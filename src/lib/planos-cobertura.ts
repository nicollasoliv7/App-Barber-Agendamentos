import "server-only";
import type { Executor } from "./db";
import type { Agendamento } from "./tipos";
import { diaLocal } from "./tempo";
import { cicloDe, hojeDaEmpresa, sincronizarAssinaturas } from "./planos-ciclos";

/** Planos mensais — cobertura de atendimentos (integração com a agenda). Uso de benefício ≠ pagamento. */

// ---------------------------------------------------------------------------
// Cobertura: integração com a agenda
// ---------------------------------------------------------------------------

export interface Cobertura {
  elegivel: boolean;
  motivo?: string;
  assinaturaId?: string;
  plano?: string;
  cicloInicio?: string;
  restantes?: number | null; // usos que sobram no ciclo DEPOIS deste (null = sem limite)
  valorCliente?: number; // quanto o cliente ainda paga por este serviço
}

/** Verifica se o plano do cliente cobre este serviço nesta data (sem gravar nada). */
export async function avaliarCobertura(
  t: Executor,
  a: { empresa_id: string; cliente_id: string; servico_id: string; inicio: Date | string; id?: string },
): Promise<Cobertura> {
  await sincronizarAssinaturas(t, a.empresa_id, { clienteId: a.cliente_id });
  const [s] = await t.query<{
    id: string;
    status: string;
    inicio: string;
    periodo_meses: number;
    ciclo_inicio: string;
    plano: string;
    incluido: boolean;
    limite_por_ciclo: number | null;
    valor_cliente_centavos: number | null;
  }>(
    `select a.id, a.status, a.inicio::text as inicio, a.periodo_meses, a.ciclo_inicio::text as ciclo_inicio, p.nome as plano,
            ps.servico_id is not null as incluido, ps.limite_por_ciclo, ps.valor_cliente_centavos
     from assinatura a join plano p on p.id = a.plano_id
     left join plano_servico ps on ps.plano_id = a.plano_id and ps.servico_id = $3
     where a.empresa_id = $1 and a.cliente_id = $2 and a.status <> 'cancelada'`,
    [a.empresa_id, a.cliente_id, a.servico_id],
  );
  if (!s) return { elegivel: false, motivo: "Cliente sem plano" };
  const base = { assinaturaId: s.id, plano: s.plano };
  if (s.status !== "ativa")
    return { ...base, elegivel: false, motivo: s.status === "pendente" ? "aguardando o 1º pagamento" : "mensalidade atrasada" };
  if (!s.incluido) return { ...base, elegivel: false, motivo: "serviço não incluído" };
  const { fuso } = await hojeDaEmpresa(a.empresa_id, t);
  const dia = diaLocal(new Date(a.inicio), fuso);
  const ciclo = cicloDe(s.inicio, s.periodo_meses, dia);
  if (!ciclo || ciclo.inicio !== s.ciclo_inicio) return { ...base, elegivel: false, motivo: "data fora do ciclo atual" };
  const [{ usados }] = await t.query<{ usados: number }>(
    `select count(*)::int as usados from assinatura_uso where assinatura_id = $1 and ciclo_inicio = $2 and ($3::uuid is null or agendamento_id <> $3::uuid)`,
    [s.id, ciclo.inicio, a.id ?? null],
  );
  if (s.limite_por_ciclo !== null && usados >= s.limite_por_ciclo)
    return { ...base, elegivel: false, motivo: `limite do ciclo atingido (${s.limite_por_ciclo}×)` };
  return {
    ...base,
    elegivel: true,
    cicloInicio: ciclo.inicio,
    restantes: s.limite_por_ciclo === null ? null : s.limite_por_ciclo - usados - 1,
    valorCliente: s.valor_cliente_centavos ?? 0,
  };
}

/** Registra o uso do benefício (se elegível). O preço do atendimento fica; muda só o valor coberto. */
export async function aplicarCobertura(
  t: Executor,
  ag: { id: string; empresa_id: string; cliente_id: string; servico_id: string; inicio: Date | string; preco_centavos: number },
): Promise<Cobertura & { valorCoberto?: number }> {
  const [ja] = await t.query(`select 1 from assinatura_uso where agendamento_id = $1`, [ag.id]);
  if (ja) return { elegivel: false, motivo: "Uso do plano já registrado" };
  const c = await avaliarCobertura(t, ag);
  if (!c.elegivel) return c;
  const coberto = Math.max(0, ag.preco_centavos - (c.valorCliente ?? 0));
  await t.query(
    `insert into assinatura_uso (empresa_id, assinatura_id, agendamento_id, servico_id, ciclo_inicio, valor_coberto_centavos) values ($1,$2,$3,$4,$5,$6)`,
    [ag.empresa_id, c.assinaturaId, ag.id, ag.servico_id, c.cicloInicio, coberto],
  );
  await t.query(`update agendamento set valor_coberto_centavos = $2 where id = $1`, [ag.id, coberto]);
  return { ...c, valorCoberto: coberto };
}

/** Remove o uso do benefício (atendimento volta a ser avulso). */
export async function removerCobertura(t: Executor, agendamentoId: string) {
  await t.query(`delete from assinatura_uso where agendamento_id = $1`, [agendamentoId]);
  await t.query(`update agendamento set valor_coberto_centavos = 0 where id = $1`, [agendamentoId]);
}

/** Recalcula a cobertura do plano depois de mudar data/serviço: remove o uso e aplica de novo, se couber. */
export async function reavaliarCobertura(t: Executor, id: string) {
  const [ag] = await t.query<Agendamento>(`select * from agendamento where id = $1`, [id]);
  const tinha = (ag?.valor_coberto_centavos ?? 0) > 0;
  if (!ag || !tinha) return;
  await removerCobertura(t, id);
  await aplicarCobertura(t, ag);
}
