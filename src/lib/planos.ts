import "server-only";
import { q, tx, type Executor } from "./db";
import { configAgendamento } from "./empresa";
import { diaLocal, somarDias } from "./tempo";
import { ErroNegocio } from "./tipos";

/**
 * Planos mensais (módulo OPCIONAL).
 *
 * - plano               → o que a barbearia oferece (preço, período, serviços incluídos e limites)
 * - assinatura          → o cliente no plano; guarda preço e período do momento da adesão
 * - assinatura_cobranca → a mensalidade de cada ciclo (pendente / paga / cancelada). Registro manual:
 *                          não há cobrança automática sem gateway de pagamento.
 * - assinatura_uso      → um atendimento coberto pelo plano. NÃO é pagamento nem receita.
 *
 * Status da assinatura (recalculado por sincronizarAssinaturas):
 *   pendente     → ainda sem nenhuma mensalidade paga
 *   ativa        → em dia (ou renovação ainda dentro da tolerância)
 *   inadimplente → alguma mensalidade vencida há mais de TOLERANCIA_DIAS
 *   cancelada    → encerrada (manual); não volta
 */

export const TOLERANCIA_DIAS = 5;
export const PERIODOS: Record<number, string> = { 1: "Mensal", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
export const STATUS_ASSINATURA: Record<string, { rotulo: string; classe: string }> = {
  ativa: { rotulo: "Ativa", classe: "badge-ok" },
  pendente: { rotulo: "Aguardando 1º pagamento", classe: "badge-warn" },
  inadimplente: { rotulo: "Mensalidade atrasada", classe: "badge-danger" },
  cancelada: { rotulo: "Cancelada", classe: "badge-neutro" },
};
export const METODOS: Record<string, string> = { pix: "Pix", dinheiro: "Dinheiro", cartao: "Cartão", transferencia: "Transferência", outro: "Outro" };

const pad = (n: number) => String(n).padStart(2, "0");

/** Soma meses a uma data AAAA-MM-DD, ajustando para o último dia do mês quando preciso (31/01 + 1 mês = 28/02). */
export function somarMeses(dia: string, meses: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(na, nm, 0)).getUTCDate();
  return `${na}-${pad(nm)}-${pad(Math.min(d, ultimo))}`;
}

/** Início do ciclo k, sempre calculado a partir da data de início (sem "deriva" de fim de mês). */
export const inicioCiclo = (inicio: string, periodo: number, k: number) => somarMeses(inicio, periodo * k);

/** Ciclo que contém o dia informado (ou null se o dia é anterior ao início da assinatura). */
export function cicloDe(inicio: string, periodo: number, dia: string): { k: number; inicio: string; fim: string } | null {
  if (dia < inicio) return null;
  const [a1, m1] = inicio.split("-").map(Number);
  const [a2, m2] = dia.split("-").map(Number);
  let k = Math.max(0, Math.floor(((a2 - a1) * 12 + (m2 - m1)) / periodo) - 1);
  while (inicioCiclo(inicio, periodo, k + 1) <= dia) k++;
  return { k, inicio: inicioCiclo(inicio, periodo, k), fim: inicioCiclo(inicio, periodo, k + 1) };
}

export async function hojeDaEmpresa(empresaId: string, t?: Executor) {
  const cfg = await configAgendamento(empresaId, t);
  return { hoje: diaLocal(new Date(), cfg.fuso_horario), fuso: cfg.fuso_horario };
}

/** A barbearia usa o módulo? (tem ao menos um plano cadastrado) — usado para mostrar ou esconder indicadores. */
export async function usaPlanos(empresaId: string): Promise<boolean> {
  const [r] = await q<{ n: number }>(`select count(*)::int as n from plano where empresa_id = $1`, [empresaId]);
  return r.n > 0;
}

// ---------------------------------------------------------------------------
// Ciclos e status
// ---------------------------------------------------------------------------

/**
 * Avança ciclos vencidos (criando a cobrança PENDENTE de cada novo ciclo, sem duplicar) e recalcula o status.
 * Nunca cria pagamento. Idempotente: pode rodar a cada carregamento de tela.
 */
export async function sincronizarAssinaturas(t: Executor, empresaId: string, filtro?: { clienteId?: string; assinaturaId?: string }) {
  const { hoje } = await hojeDaEmpresa(empresaId, t);
  const lista = await t.query<{ id: string; inicio: string; periodo_meses: number; preco_centavos: number; status: string }>(
    `select id, inicio::text as inicio, periodo_meses, preco_centavos, status from assinatura
     where empresa_id = $1 and status <> 'cancelada'
       and ($2::uuid is null or cliente_id = $2::uuid) and ($3::uuid is null or id = $3::uuid)
     for update`,
    [empresaId, filtro?.clienteId ?? null, filtro?.assinaturaId ?? null],
  );
  for (const a of lista) {
    const atual = cicloDe(a.inicio, a.periodo_meses, hoje) ?? { k: 0, inicio: a.inicio, fim: inicioCiclo(a.inicio, a.periodo_meses, 1) };
    const [ult] = await t.query<{ ciclo_inicio: string | null }>(
      `select max(ciclo_inicio)::text as ciclo_inicio from assinatura_cobranca where assinatura_id = $1`,
      [a.id],
    );
    // cria as cobranças dos ciclos que começaram depois da última registrada (no máximo 24 de uma vez)
    if (ult.ciclo_inicio) {
      const ultimo = cicloDe(a.inicio, a.periodo_meses, ult.ciclo_inicio)!;
      for (let k = ultimo.k + 1, n = 0; k <= atual.k && n < 24; k++, n++) {
        const ini = inicioCiclo(a.inicio, a.periodo_meses, k);
        await t.query(
          `insert into assinatura_cobranca (empresa_id, assinatura_id, ciclo_inicio, ciclo_fim, vencimento, valor_centavos)
           values ($1,$2,$3,$4,$3,$5) on conflict (assinatura_id, ciclo_inicio) do nothing`,
          [empresaId, a.id, ini, inicioCiclo(a.inicio, a.periodo_meses, k + 1), a.preco_centavos],
        );
      }
    }
    const [c] = await t.query<{ vencida: string | null; pagas: number }>(
      `select min(vencimento) filter (where status = 'pendente')::text as vencida, count(*) filter (where status = 'paga')::int as pagas
       from assinatura_cobranca where assinatura_id = $1`,
      [a.id],
    );
    const limite = somarDias(hoje, -TOLERANCIA_DIAS);
    const status = c.vencida && c.vencida < limite ? "inadimplente" : c.pagas === 0 ? "pendente" : "ativa";
    await t.query(`update assinatura set status = $2, ciclo_inicio = $3, ciclo_fim = $4 where id = $1`, [a.id, status, atual.inicio, atual.fim]);
  }
}

export async function sincronizarEmpresa(empresaId: string) {
  await tx((t) => sincronizarAssinaturas(t, empresaId));
}

// ---------------------------------------------------------------------------
// Planos e assinaturas
// ---------------------------------------------------------------------------

export interface DadosPlano {
  nome: string;
  descricao: string | null;
  beneficios: string | null;
  preco_centavos: number;
  periodo_meses: number;
  ativo: boolean;
  servicos: { servico_id: string; limite_por_ciclo: number | null; valor_cliente_centavos: number }[];
}

/** Cria ou edita um plano. Editar NÃO muda assinaturas existentes (preço e período ficam congelados nelas). */
export async function salvarPlano(empresaId: string, id: string | null, d: DadosPlano): Promise<string> {
  if (d.nome.trim().length < 2) throw new ErroNegocio("Dê um nome ao plano");
  if (!Number.isInteger(d.preco_centavos) || d.preco_centavos <= 0) throw new ErroNegocio("Informe o preço do plano");
  if (!PERIODOS[d.periodo_meses]) throw new ErroNegocio("Período inválido");
  if (d.servicos.length === 0 && !d.beneficios?.trim()) throw new ErroNegocio("Inclua ao menos um serviço ou descreva os benefícios");
  return tx(async (t) => {
    if (d.servicos.length) {
      const ok = await t.query<{ id: string }>(`select id from servico where empresa_id = $1 and id = any($2::uuid[])`, [empresaId, d.servicos.map((s) => s.servico_id)]);
      if (ok.length !== new Set(d.servicos.map((s) => s.servico_id)).size) throw new ErroNegocio("Serviço inválido");
    }
    let planoId = id;
    if (planoId) {
      const r = await t.query(
        `update plano set nome = $3, descricao = $4, beneficios = $5, preco_centavos = $6, periodo_meses = $7, ativo = $8
         where id = $1 and empresa_id = $2 returning id`,
        [planoId, empresaId, d.nome.trim(), d.descricao, d.beneficios, d.preco_centavos, d.periodo_meses, d.ativo],
      );
      if (!r.length) throw new ErroNegocio("Plano não encontrado", 404);
      await t.query(`delete from plano_servico where plano_id = $1`, [planoId]);
    } else {
      const [p] = await t.query<{ id: string }>(
        `insert into plano (empresa_id, nome, descricao, beneficios, preco_centavos, periodo_meses, ativo) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [empresaId, d.nome.trim(), d.descricao, d.beneficios, d.preco_centavos, d.periodo_meses, d.ativo],
      );
      planoId = p.id;
    }
    for (const s of d.servicos)
      await t.query(`insert into plano_servico (plano_id, servico_id, limite_por_ciclo, valor_cliente_centavos) values ($1,$2,$3,$4)`, [
        planoId,
        s.servico_id,
        s.limite_por_ciclo,
        s.valor_cliente_centavos,
      ]);
    return planoId!;
  });
}

export async function criarAssinatura(
  empresaId: string,
  usuarioId: string,
  d: { clienteId: string; planoId: string; inicio: string; pagoAgora: boolean; metodo: string | null },
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio)) throw new ErroNegocio("Data de início inválida");
  if (d.pagoAgora && !(d.metodo && METODOS[d.metodo])) throw new ErroNegocio("Informe como o primeiro pagamento foi recebido");
  return tx(async (t) => {
    const { hoje } = await hojeDaEmpresa(empresaId, t);
    if (d.inicio < somarDias(hoje, -366) || d.inicio > somarDias(hoje, 60)) throw new ErroNegocio("A data de início deve estar entre 1 ano atrás e 60 dias à frente");
    const [cli] = await t.query(`select 1 from cliente where id = $1 and empresa_id = $2`, [d.clienteId, empresaId]);
    if (!cli) throw new ErroNegocio("Cliente não encontrado", 404);
    const [p] = await t.query<{ preco_centavos: number; periodo_meses: number; ativo: boolean }>(
      `select preco_centavos, periodo_meses, ativo from plano where id = $1 and empresa_id = $2`,
      [d.planoId, empresaId],
    );
    if (!p) throw new ErroNegocio("Plano não encontrado", 404);
    if (!p.ativo) throw new ErroNegocio("Este plano está inativo e não aceita novas assinaturas");
    const [aberta] = await t.query(`select 1 from assinatura where cliente_id = $1 and status <> 'cancelada'`, [d.clienteId]);
    if (aberta) throw new ErroNegocio("Este cliente já tem um plano em andamento. Cancele-o antes de trocar.");

    // começa cobrando o ciclo atual (início no passado = cliente que já era assinante antes do sistema)
    const c = cicloDe(d.inicio, p.periodo_meses, hoje) ?? { k: 0, inicio: d.inicio, fim: inicioCiclo(d.inicio, p.periodo_meses, 1) };
    const [a] = await t.query<{ id: string }>(
      `insert into assinatura (empresa_id, cliente_id, plano_id, status, inicio, preco_centavos, periodo_meses, ciclo_inicio, ciclo_fim)
       values ($1,$2,$3,'pendente',$4,$5,$6,$7,$8) returning id`,
      [empresaId, d.clienteId, d.planoId, d.inicio, p.preco_centavos, p.periodo_meses, c.inicio, c.fim],
    );
    await t.query(
      `insert into assinatura_cobranca (empresa_id, assinatura_id, ciclo_inicio, ciclo_fim, vencimento, valor_centavos, status, metodo, pago_em, registrado_por)
       values ($1,$2,$3,$4,$3,$5,$6,$7,$8,$9)`,
      [
        empresaId,
        a.id,
        c.inicio,
        c.fim,
        p.preco_centavos,
        d.pagoAgora ? "paga" : "pendente",
        d.pagoAgora ? d.metodo : null,
        d.pagoAgora ? new Date() : null,
        d.pagoAgora ? usuarioId : null,
      ],
    );
    await sincronizarAssinaturas(t, empresaId, { assinaturaId: a.id });
    return a.id;
  });
}

/** Registra o recebimento de UMA mensalidade (só se estiver pendente: nunca duplica). */
export async function registrarPagamentoMensalidade(empresaId: string, usuarioId: string, cobrancaId: string, metodo: string) {
  if (!METODOS[metodo]) throw new ErroNegocio("Forma de pagamento inválida");
  await tx(async (t) => {
    const r = await t.query<{ assinatura_id: string }>(
      `update assinatura_cobranca set status = 'paga', metodo = $3, pago_em = now(), registrado_por = $4
       where id = $1 and empresa_id = $2 and status = 'pendente' returning assinatura_id`,
      [cobrancaId, empresaId, metodo, usuarioId],
    );
    if (!r.length) throw new ErroNegocio("Essa mensalidade já foi paga ou cancelada");
    await sincronizarAssinaturas(t, empresaId, { assinaturaId: r[0].assinatura_id });
  });
}

/** Desfaz um registro de pagamento feito por engano (volta para pendente). */
export async function desfazerPagamentoMensalidade(empresaId: string, cobrancaId: string) {
  await tx(async (t) => {
    const r = await t.query<{ assinatura_id: string }>(
      `update assinatura_cobranca set status = 'pendente', metodo = null, pago_em = null, registrado_por = null
       where id = $1 and empresa_id = $2 and status = 'paga' returning assinatura_id`,
      [cobrancaId, empresaId],
    );
    if (!r.length) throw new ErroNegocio("Essa mensalidade não está paga");
    await sincronizarAssinaturas(t, empresaId, { assinaturaId: r[0].assinatura_id });
  });
}

/**
 * Cancela a assinatura. Mensalidades pendentes são canceladas (não viram dívida);
 * as pagas ficam no histórico. Atendimentos FUTUROS deixam de ser cobertos; os passados não mudam.
 */
export async function cancelarAssinatura(empresaId: string, id: string, motivo: string | null) {
  await tx(async (t) => {
    const r = await t.query(
      `update assinatura set status = 'cancelada', cancelada_em = now(), motivo_cancelamento = $3
       where id = $1 and empresa_id = $2 and status <> 'cancelada' returning id`,
      [id, empresaId, motivo],
    );
    if (!r.length) throw new ErroNegocio("Assinatura não encontrada ou já cancelada");
    await t.query(`update assinatura_cobranca set status = 'cancelada' where assinatura_id = $1 and status = 'pendente'`, [id]);
    const futuros = await t.query<{ agendamento_id: string }>(
      `select u.agendamento_id from assinatura_uso u join agendamento a on a.id = u.agendamento_id
       where u.assinatura_id = $1 and a.inicio >= now() and a.status in ('confirmado','pendente_pagamento')`,
      [id],
    );
    for (const f of futuros) await removerCobertura(t, f.agendamento_id);
  });
}

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

// ---------------------------------------------------------------------------
// Indicadores (só dados reais)
// ---------------------------------------------------------------------------

export interface ResumoPlanos {
  ativas: number;
  pendentes: number;
  inadimplentes: number;
  canceladas: number;
  /** receita recorrente mensal das assinaturas ativas (planos trimestrais/anuais divididos por mês) */
  recorrenteMensal: number;
  /** mensalidades efetivamente recebidas no período */
  recebido: number;
  emAberto: { qtd: number; valor: number };
  renovacoes: { assinatura_id: string; cliente_id: string; cliente: string; plano: string; ciclo_fim: string; valor: number; paga: boolean }[];
}

export async function resumoPlanos(empresaId: string, ini: Date, fim: Date): Promise<ResumoPlanos> {
  await sincronizarEmpresa(empresaId);
  const { hoje } = await hojeDaEmpresa(empresaId);
  const [[s], [r], [ab], ren] = await Promise.all([
    q<{ ativas: number; pendentes: number; inadimplentes: number; canceladas: number; mrr: number }>(
      `select count(*) filter (where status='ativa')::int as ativas, count(*) filter (where status='pendente')::int as pendentes,
              count(*) filter (where status='inadimplente')::int as inadimplentes, count(*) filter (where status='cancelada')::int as canceladas,
              coalesce(sum(round(preco_centavos::numeric / periodo_meses)) filter (where status='ativa'),0)::int as mrr
       from assinatura where empresa_id = $1`,
      [empresaId],
    ),
    q<{ recebido: number }>(
      `select coalesce(sum(valor_centavos),0)::int as recebido from assinatura_cobranca
       where empresa_id = $1 and status = 'paga' and pago_em >= $2 and pago_em < $3`,
      [empresaId, ini, fim],
    ),
    q<{ qtd: number; valor: number }>(
      `select count(*)::int as qtd, coalesce(sum(valor_centavos),0)::int as valor from assinatura_cobranca where empresa_id = $1 and status = 'pendente'`,
      [empresaId],
    ),
    q<ResumoPlanos["renovacoes"][number]>(
      `select a.id as assinatura_id, c.id as cliente_id, c.nome as cliente, p.nome as plano, a.ciclo_fim::text as ciclo_fim, a.preco_centavos as valor,
              exists (select 1 from assinatura_cobranca ac where ac.assinatura_id = a.id and ac.ciclo_inicio = a.ciclo_fim and ac.status = 'paga') as paga
       from assinatura a join cliente c on c.id = a.cliente_id join plano p on p.id = a.plano_id
       where a.empresa_id = $1 and a.status in ('ativa','inadimplente') and a.ciclo_fim <= $2::date
       order by a.ciclo_fim, c.nome limit 8`,
      [empresaId, somarDias(hoje, 7)],
    ),
  ]);
  return {
    ativas: s.ativas,
    pendentes: s.pendentes,
    inadimplentes: s.inadimplentes,
    canceladas: s.canceladas,
    recorrenteMensal: s.mrr,
    recebido: r.recebido,
    emAberto: ab,
    renovacoes: ren,
  };
}
