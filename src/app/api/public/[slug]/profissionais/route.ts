import { ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { profissionaisDoServico } from "@/lib/consultas/publico";
import { isUuid } from "@/lib/validacao";
import { ErroNegocio } from "@/lib/tipos";

/** R7: profissionais ativos que fazem o serviço. */
export async function GET(req: Request, ctx: RouteContext<"/api/public/[slug]/profissionais">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const sp = new URL(req.url).searchParams;
    const servico = sp.get("servico");
    const unidade = sp.get("unidade");
    if (!isUuid(servico)) throw new ErroNegocio("Serviço inválido");
    const e = await empresaPorSlug(slug);
    const profissionais = await profissionaisDoServico(e.id, servico, isUuid(unidade) ? unidade : null);
    return ok({ profissionais });
  });
}
