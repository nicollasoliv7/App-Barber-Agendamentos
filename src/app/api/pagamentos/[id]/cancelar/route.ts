import { corpo, ok, rota } from "@/lib/api";
import { clienteLogado } from "@/lib/sessao";
import { cancelarCobranca } from "@/lib/pagamentos";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

export async function POST(req: Request, ctx: RouteContext<"/api/pagamentos/[id]/cancelar">) {
  return rota(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new ErroNegocio("Pagamento inválido");
    const { token } = await corpo<{ token?: string }>(req).catch(() => ({ token: undefined }));
    const c = await clienteLogado();
    await cancelarCobranca(id, { token, clienteId: c?.id });
    return ok({ ok: true });
  });
}
