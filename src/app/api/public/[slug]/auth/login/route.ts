import { corpo, ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { loginCliente } from "@/lib/sessao";

export async function POST(req: Request, ctx: RouteContext<"/api/public/[slug]/auth/login">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const b = await corpo<{ telefone: string; senha: string }>(req);
    const e = await empresaPorSlug(slug);
    await loginCliente(e.id, String(b.telefone ?? ""), String(b.senha ?? ""));
    return ok({ ok: true });
  });
}
