import { ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { diasDisponiveis, diasDisponiveisQualquer } from "@/lib/disponibilidade";
import { isUuid } from "@/lib/validacao";
import { ErroNegocio } from "@/lib/tipos";

/** Dias com horário livre. `profissional=qualquer` = sem preferência (união dos profissionais). */
export async function GET(req: Request, ctx: RouteContext<"/api/public/[slug]/dias">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const sp = new URL(req.url).searchParams;
    const servico = sp.get("servico");
    const profissional = sp.get("profissional");
    const unidade = sp.get("unidade");
    if (!isUuid(servico) || !(isUuid(profissional) || profissional === "qualquer")) throw new ErroNegocio("Parâmetros inválidos");
    const e = await empresaPorSlug(slug);
    const dias =
      profissional === "qualquer"
        ? await diasDisponiveisQualquer(e.id, servico, isUuid(unidade) ? unidade : null)
        : await diasDisponiveis(e.id, servico, profissional);
    return ok({ dias });
  });
}
