import { ok, rota } from "@/lib/api";
import { buscarPorToken } from "@/lib/gerenciar";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

/** Detalhes de um agendamento para quem tem o link (token). Sem login. */
export async function GET(req: Request, ctx: RouteContext<"/api/public/[slug]/agendamentos/[id]">) {
  return rota(async () => {
    const { slug, id } = await ctx.params;
    const t = new URL(req.url).searchParams.get("t") ?? "";
    if (!isUuid(id)) throw new ErroNegocio("Agendamento inválido");
    return ok({ agendamento: await buscarPorToken(slug, id, t) });
  });
}
