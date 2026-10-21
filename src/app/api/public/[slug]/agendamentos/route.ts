import { corpo, ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { criarAgendamento } from "@/lib/agendamentos";
import { q1 } from "@/lib/db";
import { isUuid } from "@/lib/validacao";
import { ErroNegocio } from "@/lib/tipos";

/** Cria agendamento pela página pública (R9–R14). Não exige login (R31). */
export async function POST(req: Request, ctx: RouteContext<"/api/public/[slug]/agendamentos">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const b = await corpo<{
      servico: string;
      profissional: string;
      unidade?: string;
      dia: string;
      hora: string;
      nome: string;
      telefone: string;
      extras?: Record<string, string>;
    }>(req);
    if (!isUuid(b.servico) || !(isUuid(b.profissional) || b.profissional === "qualquer")) throw new ErroNegocio("Serviço ou profissional inválido");
    const e = await empresaPorSlug(slug);
    const ag = await criarAgendamento({
      empresaId: e.id,
      servicoId: b.servico,
      profissionalId: b.profissional,
      unidadeId: isUuid(b.unidade) ? b.unidade : null,
      dia: String(b.dia ?? ""),
      hora: String(b.hora ?? ""),
      nome: String(b.nome ?? ""),
      telefone: String(b.telefone ?? ""),
      extras: typeof b.extras === "object" && b.extras ? b.extras : {},
    });
    const prof = await q1<{ nome: string }>(`select nome from profissional where id = $1`, [ag.profissional_id]);
    return ok(
      {
        agendamento: {
          id: ag.id,
          status: ag.status,
          inicio: ag.inicio,
          fim: ag.fim,
          preco_centavos: ag.preco_centavos,
          expira_em: ag.expira_em,
          profissional: prof?.nome ?? null,
          token: ag.token_publico, // autoriza pagar/gerenciar este agendamento sem login
          gerenciar: `/${slug}/agendamento/${ag.id}?t=${ag.token_publico}`,
        },
      },
      201,
    );
  });
}
