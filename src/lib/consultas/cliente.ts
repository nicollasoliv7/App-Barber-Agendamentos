import "server-only";
import { q, q1, tx } from "../db";
import { ErroNegocio } from "../tipos";

/**
 * Consultas da área do cliente logado ("Meus agendamentos" e cartões salvos).
 * Toda consulta é restrita ao cliente da sessão (cliente_id).
 */

export const agendamentoDoClienteParaRemarcar = (id: string, clienteId: string) =>
  q1<{ empresa_id: string; servico_id: string; profissional_id: string }>(
    `select empresa_id, servico_id, profissional_id from agendamento where id = $1 and cliente_id = $2`,
    [id, clienteId],
  );

/** Histórico paginado: próximos em aberto primeiro, depois os passados. */
export const historicoDoCliente = (clienteId: string, limite: number, offset: number) =>
  q(
    `select a.id, a.inicio, a.fim, a.status, a.preco_centavos, a.cancelado_por, a.expira_em, a.token_publico as token,
              s.nome as servico, p.nome as profissional, a.servico_id, a.profissional_id,
              coalesce((select sum(valor_centavos) from pagamento pg where pg.agendamento_id = a.id and pg.status = 'pago'), 0)::int as pago_centavos,
              (select json_build_object('id', pg.id, 'valor_centavos', pg.valor_centavos, 'expira_em', pg.expira_em)
                 from pagamento pg where pg.agendamento_id = a.id and pg.status = 'pendente' and pg.metodo = 'pix'
                 order by pg.criado_em desc limit 1) as pix_pendente
       from agendamento a join servico s on s.id = a.servico_id join profissional p on p.id = a.profissional_id
       where a.cliente_id = $1
       order by (a.inicio >= now() and a.status in ('confirmado','pendente_pagamento')) desc,
                case when a.inicio >= now() then a.inicio end asc, a.inicio desc
       limit $2 offset $3`,
    [clienteId, limite, offset],
  );

export const cartoesDoCliente = (clienteId: string) =>
  q(
    `select id, bandeira, ultimos4, validade_mes, validade_ano, favorito from cartao where cliente_id = $1 order by favorito desc, criado_em desc`,
    [clienteId],
  );

/** Favoritar (um favorito por vez). */
export async function favoritarCartao(id: string, clienteId: string) {
  await tx(async (t) => {
    const r = await t.query(`update cartao set favorito = (id = $1) where cliente_id = $2 returning id`, [id, clienteId]);
    if (!r.length) throw new ErroNegocio("Cartão não encontrado", 404);
  });
}

export async function apagarCartao(id: string, clienteId: string) {
  await tx((t) => t.query(`delete from cartao where id = $1 and cliente_id = $2`, [id, clienteId]));
}
