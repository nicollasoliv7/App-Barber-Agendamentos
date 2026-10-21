import { ok, rota } from "@/lib/api";
import { tx } from "@/lib/db";
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
    await tx(async (t) => {
      const r = await t.query(`update cartao set favorito = (id = $1) where cliente_id = $2 returning id`, [id, c.id]);
      if (!r.length) throw new ErroNegocio("Cartão não encontrado", 404);
    });
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/cliente/cartoes/[id]">) {
  return rota(async () => {
    const { id } = await ctx.params;
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login", 401);
    if (!isUuid(id)) throw new ErroNegocio("Cartão inválido");
    await tx((t) => t.query(`delete from cartao where id = $1 and cliente_id = $2`, [id, c.id]));
    return ok({ ok: true });
  });
}
