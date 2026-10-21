import { corpo, ok, rota } from "@/lib/api";
import { buscarPorToken } from "@/lib/gerenciar";
import { cancelarPeloCliente } from "@/lib/agendamentos";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

export async function POST(req: Request, ctx: RouteContext<"/api/public/[slug]/agendamentos/[id]/cancelar">) {
  return rota(async () => {
    const { slug, id } = await ctx.params;
    const { t } = await corpo<{ t: string }>(req);
    if (!isUuid(id)) throw new ErroNegocio("Agendamento inválido");
    await buscarPorToken(slug, id, String(t ?? "")); // garante empresa + token
    await cancelarPeloCliente(id, { token: String(t) });
    return ok({ ok: true });
  });
}
