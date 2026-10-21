import { ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { q } from "@/lib/db";
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
    const profissionais = await q(
      `select p.id, p.nome, p.foto_url from profissional p
       join profissional_servico ps on ps.profissional_id = p.id
       where p.empresa_id = $1 and p.ativo and ps.servico_id = $2
         and ($3::uuid is null or p.unidade_id is null or p.unidade_id = $3::uuid)
       order by p.nome`,
      [e.id, servico, isUuid(unidade) ? unidade : null],
    );
    return ok({ profissionais });
  });
}
