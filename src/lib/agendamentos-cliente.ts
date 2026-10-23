import "server-only";
import { tx, type Executor } from "./db";
import { configAgendamento } from "./empresa";
import { expirarPendentes, horariosLivres } from "./disponibilidade";
import { notificar } from "./notificacoes";
import { formatarDataHora, instanteLocal, paraMinutos } from "./tempo";
import { ErroNegocio, type Agendamento } from "./tipos";
import { removerCobertura, reavaliarCobertura } from "./planos-cobertura";

/** Ações do CLIENTE sobre o próprio agendamento (pelo login ou pelo link com token). */

/** Quem pode mexer no agendamento: o cliente logado OU quem tem o link com o token secreto. */
export type AcessoCliente = string | { clienteId?: string | null; token?: string | null };

async function carregarDoCliente(t: Executor, id: string, acesso: AcessoCliente) {
  const a = typeof acesso === "string" ? { clienteId: acesso, token: null } : acesso;
  if (!a.clienteId && !(a.token && a.token.length >= 20)) throw new ErroNegocio("Acesso negado", 403);
  const [ag] = await t.query<Agendamento & { cliente_telefone: string; servico_nome: string; empresa_nome: string }>(
    `select a.*, c.telefone as cliente_telefone, s.nome as servico_nome, e.nome as empresa_nome
     from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
     join empresa e on e.id = a.empresa_id
     where a.id = $1 and (a.cliente_id = $2::uuid or a.token_publico = $3::text) for update of a`,
    [id, a.clienteId ?? null, a.token ?? null],
  );
  if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404); // R21
  return ag;
}

/** R22 */
export async function cancelarPeloCliente(id: string, clienteId: AcessoCliente) {
  return tx(async (t) => {
    await expirarPendentes(t);
    const ag = await carregarDoCliente(t, id, clienteId);
    if (!["confirmado", "pendente_pagamento"].includes(ag.status)) throw new ErroNegocio("Este agendamento não pode mais ser cancelado");
    const cfg = await configAgendamento(ag.empresa_id, t);
    if (new Date(ag.inicio).getTime() - Date.now() < cfg.cancelamento_ate_min * 60000)
      throw new ErroNegocio(`Cancelamento permitido até ${cfg.cancelamento_ate_min / 60}h antes. Fale com a barbearia.`);
    await t.query(`update agendamento set status = 'cancelado', cancelado_por = 'cliente' where id = $1`, [id]);
    await t.query(`update pagamento set status = 'cancelado' where agendamento_id = $1 and status = 'pendente'`, [id]);
    await removerCobertura(t, id); // R59: cancelado devolve o uso do plano
    await notificar(t, {
      empresaId: ag.empresa_id,
      agendamentoId: id,
      destino: ag.cliente_telefone,
      tipo: "cancelamento",
      mensagem: `Seu agendamento de ${ag.servico_nome} em ${formatarDataHora(ag.inicio)} foi cancelado.`,
    });
  });
}

/** R23 */
export async function remarcarPeloCliente(id: string, clienteId: AcessoCliente, dia: string, hora: string) {
  return tx(async (t) => {
    await expirarPendentes(t);
    const ag = await carregarDoCliente(t, id, clienteId);
    if (!["confirmado", "pendente_pagamento"].includes(ag.status)) throw new ErroNegocio("Este agendamento não pode ser remarcado");
    const cfg = await configAgendamento(ag.empresa_id, t);
    if (new Date(ag.inicio).getTime() - Date.now() < cfg.remarcacao_ate_min * 60000)
      throw new ErroNegocio(`Remarcação permitida até ${cfg.remarcacao_ate_min / 60}h antes.`);
    await t.query(`select id from profissional where id = $1 for update`, [ag.profissional_id]);
    const minuto = paraMinutos(hora);
    const livres = await horariosLivres(ag.empresa_id, ag.servico_id, ag.profissional_id, dia, { ignorarAgendamentoId: id }, t);
    if (!livres.includes(minuto)) throw new ErroNegocio("Horário indisponível. Escolha outro.", 409);
    const inicio = instanteLocal(dia, minuto, cfg.fuso_horario);
    const dur = new Date(ag.fim).getTime() - new Date(ag.inicio).getTime();
    const antigo = formatarDataHora(ag.inicio);
    await t.query(`update agendamento set inicio = $2, fim = $3 where id = $1`, [id, inicio, new Date(inicio.getTime() + dur)]);
    await reavaliarCobertura(t, id); // R59: a nova data pode cair em outro ciclo do plano
    await notificar(t, {
      empresaId: ag.empresa_id,
      agendamentoId: id,
      destino: ag.cliente_telefone,
      tipo: "remarcacao",
      mensagem: `Seu ${ag.servico_nome} foi remarcado de ${antigo} para ${formatarDataHora(inicio)}.`,
    });
  });
}
