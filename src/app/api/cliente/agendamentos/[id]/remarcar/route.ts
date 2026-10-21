import { corpo, ok, rota } from "@/lib/api";
import { clienteLogado } from "@/lib/sessao";
import { remarcarPeloCliente } from "@/lib/agendamentos";
import { ErroNegocio } from "@/lib/tipos";
import { dataValida, isUuid } from "@/lib/validacao";

export async function POST(req: Request, ctx: RouteContext<"/api/cliente/agendamentos/[id]/remarcar">) {
  return rota(async () => {
    const { id } = await ctx.params;
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login", 401);
    const { dia, hora } = await corpo<{ dia: string; hora: string }>(req);
    if (!isUuid(id) || !dataValida(String(dia)) || !/^\d{2}:\d{2}$/.test(String(hora))) throw new ErroNegocio("Dados inválidos");
    await remarcarPeloCliente(id, c.id, dia, hora);
    return ok({ ok: true });
  });
}
