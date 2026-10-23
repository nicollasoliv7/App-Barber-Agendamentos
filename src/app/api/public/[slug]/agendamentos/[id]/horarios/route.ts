import { ok, rota } from "@/lib/api";
import { agendamentoParaRemarcar } from "@/lib/consultas/publico";
import { buscarPorToken } from "@/lib/gerenciar";
import { diasDisponiveis, horariosLivres } from "@/lib/disponibilidade";
import { hhmm } from "@/lib/tempo";
import { ErroNegocio } from "@/lib/tipos";
import { dataValida, isUuid } from "@/lib/validacao";

/** Para remarcar pelo link: sem ?dia lista os dias; com ?dia lista os horários (ignora o próprio agendamento). */
export async function GET(req: Request, ctx: RouteContext<"/api/public/[slug]/agendamentos/[id]/horarios">) {
  return rota(async () => {
    const { slug, id } = await ctx.params;
    const sp = new URL(req.url).searchParams;
    if (!isUuid(id)) throw new ErroNegocio("Agendamento inválido");
    await buscarPorToken(slug, id, sp.get("t") ?? "");
    const ag = (await agendamentoParaRemarcar(id))!;
    const dia = sp.get("dia");
    if (dia) {
      if (!dataValida(dia)) throw new ErroNegocio("Dia inválido");
      const hs = await horariosLivres(ag.empresa_id, ag.servico_id, ag.profissional_id, dia, { ignorarAgendamentoId: id });
      return ok({ horarios: hs.map(hhmm) });
    }
    return ok({ dias: await diasDisponiveis(ag.empresa_id, ag.servico_id, ag.profissional_id, { ignorarAgendamentoId: id }) });
  });
}
