import { corpo, ok, rota } from "@/lib/api";
import { empresaPorSlug } from "@/lib/empresa";
import { enviarCodigo } from "@/lib/sessao";

/** Envia código de 6 dígitos por WhatsApp/SMS (R30). */
export async function POST(req: Request, ctx: RouteContext<"/api/public/[slug]/auth/codigo">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const { telefone } = await corpo<{ telefone: string }>(req);
    const e = await empresaPorSlug(slug);
    return ok(await enviarCodigo(e.id, String(telefone ?? "")));
  });
}
