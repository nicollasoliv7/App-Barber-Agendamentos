import { ok, rota } from "@/lib/api";
import { apagarCartao, favoritarCartao } from "@/lib/consultas/cliente";
import { clienteLogado } from "@/lib/sessao";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

/** Favoritar (um favorito por vez). */
export async function PATCH(_req: Request, ctx: RouteContext<"/api/cliente/cartoes/[id]">) {
  return rota(async () => {
    const { id } = await ctx.params;
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login", 401);
    if (!isUuid(id)) throw new ErroNegocio("Cartão inválido");
    await favoritarCartao(id, c.id);
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/cliente/cartoes/[id]">) {
  return rota(async () => {
    const { id } = await ctx.params;
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login", 401);
    if (!isUuid(id)) throw new ErroNegocio("Cartão inválido");
    await apagarCartao(id, c.id);
    return ok({ ok: true });
  });
}
