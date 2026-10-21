import { corpo, ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { situacaoTelefone } from "@/lib/sessao";

/** Diz se o telefone já tem cadastro e senha (decide entre login e cadastro). */
export async function POST(req: Request, ctx: RouteContext<"/api/public/[slug]/auth/telefone">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const { telefone } = await corpo<{ telefone: string }>(req);
    const e = await empresaPorSlug(slug);
    return ok(await situacaoTelefone(e.id, String(telefone ?? "")));
  });
}
