import { ok, rota } from "@/lib/api";
import { agendamentoDoClienteParaRemarcar } from "@/lib/consultas/cliente";
import { clienteLogado } from "@/lib/sessao";
import { diasDisponiveis, horariosLivres } from "@/lib/disponibilidade";
import { hhmm } from "@/lib/tempo";
import { ErroNegocio } from "@/lib/tipos";
import { dataValida, isUuid } from "@/lib/validacao";

/** Para remarcar: sem ?dia lista os dias; com ?dia lista os horários (ignorando o próprio agendamento). */
export async function GET(req: Request, ctx: RouteContext<"/api/cliente/agendamentos/[id]/horarios">) {
  return rota(async () => {
    const { id } = await ctx.params;
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login", 401);
    if (!isUuid(id)) throw new ErroNegocio("Agendamento inválido");
    const ag = await agendamentoDoClienteParaRemarcar(id, c.id);
    if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404);
    const dia = new URL(req.url).searchParams.get("dia");
    if (dia) {
      if (!dataValida(dia)) throw new ErroNegocio("Dia inválido");
      const hs = await horariosLivres(ag.empresa_id, ag.servico_id, ag.profissional_id, dia, { ignorarAgendamentoId: id });
      return ok({ horarios: hs.map(hhmm) });
    }
    const dias = await diasDisponiveis(ag.empresa_id, ag.servico_id, ag.profissional_id, { ignorarAgendamentoId: id });
    return ok({ dias });
  });
}
