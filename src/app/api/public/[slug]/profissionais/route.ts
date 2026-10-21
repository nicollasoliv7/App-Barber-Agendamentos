import { ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { q } from "@/lib/db";
import { isUuid } from "@/lib/validacao";
import { ErroNegocio } from "@/lib/tipos";

/** R7: profissionais ativos que fazem o serviço. */
export async function GET(req: Request, ctx: RouteContext<"/api/public/[slug]/profissionais">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const servico = new URL(req.url).searchParams.get("servico");
    if (!isUuid(servico)) throw new ErroNegocio("Serviço inválido");
    const e = await empresaPorSlug(slug);
    const profissionais = await q(
      `select p.id, p.nome, p.foto_url from profissional p
       join profissional_servico ps on ps.profissional_id = p.id
       where p.empresa_id = $1 and p.ativo and ps.servico_id = $2 order by p.nome`,
      [e.id, servico],
    );
    return ok({ profissionais });
  });
}
