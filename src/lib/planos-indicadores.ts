import "server-only";
import { q } from "./db";
import { somarDias } from "./tempo";
import { hojeDaEmpresa, sincronizarEmpresa } from "./planos-ciclos";

/** Planos mensais — indicadores (só dados reais). */

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
