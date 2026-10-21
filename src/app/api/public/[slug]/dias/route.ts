import { ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { diasDisponiveis } from "@/lib/disponibilidade";
import { isUuid } from "@/lib/validacao";
import { ErroNegocio } from "@/lib/tipos";

export async function GET(req: Request, ctx: RouteContext<"/api/public/[slug]/dias">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const sp = new URL(req.url).searchParams;
    const servico = sp.get("servico");
    const profissional = sp.get("profissional");
    if (!isUuid(servico) || !isUuid(profissional)) throw new ErroNegocio("Parâmetros inválidos");
    const e = await empresaPorSlug(slug);
    const dias = await diasDisponiveis(e.id, servico, profissional);
    return ok({ dias });
  });
}
