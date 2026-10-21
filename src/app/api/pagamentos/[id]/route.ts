import { ok, rota } from "@/lib/api";
import { clienteLogado } from "@/lib/sessao";
import { consultarPagamento } from "@/lib/pagamentos";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

/** Status da cobrança (o front consulta enquanto o contador corre). */
export async function GET(req: Request, ctx: RouteContext<"/api/pagamentos/[id]">) {
  return rota(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new ErroNegocio("Pagamento inválido");
    const token = new URL(req.url).searchParams.get("token");
    const c = await clienteLogado();
    return ok({ pagamento: await consultarPagamento(id, { token, clienteId: c?.id }) });
  });
}
