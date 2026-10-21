import { corpo, ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { cadastrarSenha } from "@/lib/sessao";

/** Cadastra ou redefine a senha com o código recebido e já abre a sessão. */
export async function POST(req: Request, ctx: RouteContext<"/api/public/[slug]/auth/senha">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const b = await corpo<{ telefone: string; codigo: string; senha: string; nome?: string }>(req);
    const e = await empresaPorSlug(slug);
    await cadastrarSenha(e.id, String(b.telefone ?? ""), String(b.codigo ?? ""), String(b.senha ?? ""), b.nome);
    return ok({ ok: true });
  });
}
