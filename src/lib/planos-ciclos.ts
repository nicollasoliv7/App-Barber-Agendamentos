import "server-only";
import { q, tx, type Executor } from "./db";
import { configAgendamento } from "./empresa";
import { diaLocal, somarDias } from "./tempo";

/** Planos mensais — ciclos, status e constantes compartilhadas (ver visão geral em ./planos.ts). */

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
