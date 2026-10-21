import { ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { horariosLivres } from "@/lib/disponibilidade";
import { hhmm } from "@/lib/tempo";
import { dataValida, isUuid } from "@/lib/validacao";
import { ErroNegocio } from "@/lib/tipos";

export async function GET(req: Request, ctx: RouteContext<"/api/public/[slug]/horarios">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const sp = new URL(req.url).searchParams;
    const servico = sp.get("servico");
    const profissional = sp.get("profissional");
    const dia = sp.get("dia") ?? "";
    if (!isUuid(servico) || !isUuid(profissional) || !dataValida(dia)) throw new ErroNegocio("Parâmetros inválidos");
    const e = await empresaPorSlug(slug);
    const horarios = (await horariosLivres(e.id, servico, profissional, dia)).map(hhmm);
    return ok({ horarios });
  });
}
