import "server-only";
import { tx } from "./db";
import { configAgendamento } from "./empresa";
import { expirarPendentes, horariosLivres } from "./disponibilidade";
import { notificar } from "./notificacoes";
import { formatarDataHora, instanteLocal, paraMinutos } from "./tempo";
import { ErroNegocio, type Agendamento } from "./tipos";
import { aplicarCobertura, removerCobertura, reavaliarCobertura } from "./planos-cobertura";

/** Ações da BARBEARIA sobre agendamentos (painel). */

/** R26 */
export async function mudarStatusPelaEmpresa(empresaId: string, id: string, status: "confirmado" | "concluido" | "faltou" | "cancelado") {
  return tx(async (t) => {
    const [ag] = await t.query<{ status: string }>(`select status from agendamento where id = $1 and empresa_id = $2`, [id, empresaId]);
    if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404);
    await t.query(
      `update agendamento set status = $3, cancelado_por = case when $3 = 'cancelado' then 'empresa' else null end,
         expira_em = case when $3 = 'confirmado' then null else expira_em end
       where id = $1 and empresa_id = $2`,
      [id, empresaId, status],
    );
    if (status === "cancelado") await removerCobertura(t, id); // R59
    if (status === "confirmado" && ag.status === "cancelado") {
      const [a] = await t.query<Agendamento>(`select * from agendamento where id = $1`, [id]);
      await aplicarCobertura(t, a); // reaberto: volta a usar o plano, se ainda couber
    }
  });
}

/**
 * R60: editar um agendamento pelo painel (data, hora, profissional e observação).
 * Respeita expediente, folgas e conflitos; ignora a antecedência mínima (como o agendamento manual).
 */
export async function editarPelaEmpresa(
  empresaId: string,
  id: string,
  d: { dia: string; hora: string; profissionalId: string; observacao: string | null },
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dia) || !/^\d{2}:\d{2}$/.test(d.hora)) throw new ErroNegocio("Data ou hora inválida");
  return tx(async (t) => {
    await expirarPendentes(t);
    const [ag] = await t.query<Agendamento & { cliente_telefone: string; servico_nome: string }>(
      `select a.*, c.telefone as cliente_telefone, s.nome as servico_nome from agendamento a
       join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
       where a.id = $1 and a.empresa_id = $2 for update of a`,
      [id, empresaId],
    );
    if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404);
    if (!["confirmado", "pendente_pagamento"].includes(ag.status)) throw new ErroNegocio("Só agendamentos em aberto podem ser editados");
    const [prof] = await t.query(`select 1 from profissional where id = $1 and empresa_id = $2 for update`, [d.profissionalId, empresaId]);
    if (!prof) throw new ErroNegocio("Profissional inválido");
    const cfg = await configAgendamento(empresaId, t);
    const minuto = paraMinutos(d.hora);
    const inicio = instanteLocal(d.dia, minuto, cfg.fuso_horario);
    const mudouHorario = inicio.getTime() !== new Date(ag.inicio).getTime() || d.profissionalId !== ag.profissional_id;
    if (mudouHorario) {
      const livres = await horariosLivres(empresaId, ag.servico_id, d.profissionalId, d.dia, { ignorarAgendamentoId: id, ignorarAntecedencia: true }, t);
      if (!livres.includes(minuto)) throw new ErroNegocio("Horário indisponível para esse profissional. Escolha outro.", 409);
    }
    const dur = new Date(ag.fim).getTime() - new Date(ag.inicio).getTime();
    await t.query(`update agendamento set inicio = $2, fim = $3, profissional_id = $4, observacao = $5 where id = $1`, [
      id,
      inicio,
      new Date(inicio.getTime() + dur),
      d.profissionalId,
      d.observacao?.slice(0, 500) || null,
    ]);
    if (inicio.getTime() !== new Date(ag.inicio).getTime()) {
      await reavaliarCobertura(t, id);
      await notificar(t, {
        empresaId,
        agendamentoId: id,
        destino: ag.cliente_telefone,
        tipo: "remarcacao",
        mensagem: `Seu ${ag.servico_nome} foi remarcado de ${formatarDataHora(ag.inicio)} para ${formatarDataHora(inicio)}.`,
      });
    }
  });
}
