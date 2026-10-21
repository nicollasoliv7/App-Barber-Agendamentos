import { corpo, ok, rota } from "@/lib/api";
import { clienteLogado } from "@/lib/sessao";
import { simularPagamento } from "@/lib/pagamentos";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

/** SANDBOX: simula a confirmação do banco (webhook de teste). */
export async function POST(req: Request, ctx: RouteContext<"/api/pagamentos/[id]/simular">) {
  return rota(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new ErroNegocio("Pagamento inválido");
    const { token } = await corpo<{ token?: string }>(req).catch(() => ({ token: undefined }));
    const c = await clienteLogado();
    await simularPagamento(id, { token, clienteId: c?.id });
    return ok({ ok: true });
  });
}
