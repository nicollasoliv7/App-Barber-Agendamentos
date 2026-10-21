import { corpo, ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { criarAgendamento } from "@/lib/agendamentos";
import { isUuid } from "@/lib/validacao";
import { ErroNegocio } from "@/lib/tipos";

/** Cria agendamento pela página pública (R9–R14). Não exige login (R31). */
export async function POST(req: Request, ctx: RouteContext<"/api/public/[slug]/agendamentos">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const b = await corpo<{
      servico: string;
      profissional: string;
      dia: string;
      hora: string;
      nome: string;
      telefone: string;
      extras?: Record<string, string>;
    }>(req);
    if (!isUuid(b.servico) || !isUuid(b.profissional)) throw new ErroNegocio("Serviço ou profissional inválido");
    const e = await empresaPorSlug(slug);
    const ag = await criarAgendamento({
      empresaId: e.id,
      servicoId: b.servico,
      profissionalId: b.profissional,
      dia: String(b.dia ?? ""),
      hora: String(b.hora ?? ""),
      nome: String(b.nome ?? ""),
      telefone: String(b.telefone ?? ""),
      extras: typeof b.extras === "object" && b.extras ? b.extras : {},
    });
    return ok(
      {
        agendamento: {
          id: ag.id,
          status: ag.status,
          inicio: ag.inicio,
          preco_centavos: ag.preco_centavos,
          expira_em: ag.expira_em,
          token: ag.token_publico, // autoriza pagar este agendamento sem login
        },
      },
      201,
    );
  });
}
