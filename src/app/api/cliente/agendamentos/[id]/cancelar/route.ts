import { ok, rota } from "@/lib/api";
import { clienteLogado } from "@/lib/sessao";
import { cancelarPeloCliente } from "@/lib/agendamentos";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

export async function POST(_req: Request, ctx: RouteContext<"/api/cliente/agendamentos/[id]/cancelar">) {
  return rota(async () => {
    const { id } = await ctx.params;
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login", 401);
    if (!isUuid(id)) throw new ErroNegocio("Agendamento inválido");
    await cancelarPeloCliente(id, c.id);
    return ok({ ok: true });
  });
}
