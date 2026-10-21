import { corpo, ok, rota } from "@/lib/api";
import { buscarPorToken } from "@/lib/gerenciar";
import { remarcarPeloCliente } from "@/lib/agendamentos";
import { ErroNegocio } from "@/lib/tipos";
import { dataValida, isUuid } from "@/lib/validacao";

export async function POST(req: Request, ctx: RouteContext<"/api/public/[slug]/agendamentos/[id]/remarcar">) {
  return rota(async () => {
    const { slug, id } = await ctx.params;
    const { t, dia, hora } = await corpo<{ t: string; dia: string; hora: string }>(req);
    if (!isUuid(id) || !dataValida(String(dia)) || !/^\d{2}:\d{2}$/.test(String(hora))) throw new ErroNegocio("Dados inválidos");
    await buscarPorToken(slug, id, String(t ?? ""));
    await remarcarPeloCliente(id, { token: String(t) }, dia, hora);
    return ok({ ok: true });
  });
}
