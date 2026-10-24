import "server-only";
import { q1, type Executor } from "./db";
import { ErroNegocio } from "./tipos";

/**
 * Planos da PLATAFORMA (o que a barbearia paga para usar o Agendou).
 * Os recursos são os mesmos em todos; a única diferença é o limite de clientes do Gratuito.
 * Não confundir com os planos que a barbearia vende aos próprios clientes (planos.ts).
 */

export const LIMITE_GRATUITO = 15;

export type PlanoPago = "mensal" | "trimestral" | "anual";

export const PLANOS_SISTEMA: Record<PlanoPago, { nome: string; centavos: number; meses: number; periodo: string }> = {
  mensal: { nome: "Mensal", centavos: 5990, meses: 1, periodo: "por mês" },
  trimestral: { nome: "Trimestral", centavos: 15990, meses: 3, periodo: "a cada 3 meses" },
  anual: { nome: "Anual", centavos: 59990, meses: 12, periodo: "por ano" },
};

export const ehPlanoPago = (p: unknown): p is PlanoPago => typeof p === "string" && p in PLANOS_SISTEMA;

export interface SituacaoAssinatura {
  /** plano em vigor agora */
  plano: "gratuito" | PlanoPago;
  /** fim do período pago (também quando já venceu, para avisar) */
  validoAte: Date | null;
  origem: "pagamento" | "cortesia" | null;
  clientes: number;
  /** null = sem limite (plano pago em vigor) */
  limite: number | null;
  /** dias até o fim do período pago (null no Gratuito) */
  diasRestantes: number | null;
}

/** Plano em vigor e número de clientes cadastrados. Período vencido = Gratuito (nada é apagado). */
export async function situacaoAssinatura(empresaId: string, t?: Executor): Promise<SituacaoAssinatura> {
  const sql = `select a.plano, a.valido_ate, a.origem, a.valido_ate > now() as vigente,
                      ceil(extract(epoch from (a.valido_ate - now())) / 86400)::int as dias,
                      (select count(*)::int from cliente c where c.empresa_id = $1) as clientes
               from (select 1) x left join assinatura_sistema a on a.empresa_id = $1`;
  const r = t
    ? (await t.query<LinhaSituacao>(sql, [empresaId]))[0]
    : await q1<LinhaSituacao>(sql, [empresaId]);
  const vigente = !!r?.vigente && ehPlanoPago(r.plano);
  return {
    plano: vigente ? (r!.plano as PlanoPago) : "gratuito",
    validoAte: r?.valido_ate ? new Date(r.valido_ate) : null,
    origem: r?.origem ?? null,
    clientes: r?.clientes ?? 0,
    limite: vigente ? null : LIMITE_GRATUITO,
    diasRestantes: vigente ? (r!.dias ?? null) : null,
  };
}
interface LinhaSituacao {
  plano: string | null;
  valido_ate: string | Date | null;
  origem: "pagamento" | "cortesia" | null;
  vigente: boolean | null;
  dias: number | null;
  clientes: number;
}

export type Contexto = "painel" | "publico" | "importacao";

const MENSAGEM: Record<Contexto, (vagas: number, novos: number) => string> = {
  painel: () =>
    `O plano Gratuito permite até ${LIMITE_GRATUITO} clientes cadastrados e esse limite foi atingido. Assine um plano em Assinatura para cadastrar mais clientes.`,
  // para o cliente final não expomos o plano da barbearia
  publico: () => "No momento esta barbearia não está aceitando novos clientes pelo agendamento online. Fale direto com a barbearia.",
  importacao: (vagas, novos) =>
    `A planilha traria ${novos} clientes novos, mas o plano Gratuito só tem ${vagas} ${vagas === 1 ? "vaga" : "vagas"} (limite de ${LIMITE_GRATUITO} clientes). Assine um plano em Assinatura ou importe menos linhas.`,
};

/**
 * Confere se a barbearia pode cadastrar `novos` clientes. Chamar DENTRO da transação que insere.
 * Trava a linha da empresa para duas inserções simultâneas não passarem juntas do limite.
 */
export async function conferirVagaClientes(t: Executor, empresaId: string, novos: number, contexto: Contexto): Promise<void> {
  if (novos <= 0) return;
  await t.query(`select id from empresa where id = $1 for update`, [empresaId]);
  const s = await situacaoAssinatura(empresaId, t);
  if (s.limite === null) return;
  const vagas = Math.max(0, s.limite - s.clientes);
  if (novos > vagas) throw new ErroNegocio(MENSAGEM[contexto](vagas, novos), 403);
}

/** Atalho para quando o cliente pode já existir (upsert por telefone). */
export async function conferirVagaSeNovo(t: Executor, empresaId: string, telefone: string, contexto: Contexto): Promise<void> {
  const [existe] = await t.query(`select 1 from cliente where empresa_id = $1 and telefone = $2`, [empresaId, telefone]);
  if (!existe) await conferirVagaClientes(t, empresaId, 1, contexto);
}
