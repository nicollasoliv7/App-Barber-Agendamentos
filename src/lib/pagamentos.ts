import "server-only";
import QRCode from "qrcode";
import { q, tx, type Executor } from "./db";
import { configAgendamento, valorCobranca } from "./empresa";
import { expirarPendentes } from "./disponibilidade";
import { notificarConfirmacao } from "./agendamentos";
import { tokenAleatorio } from "./senha";
import { ErroNegocio, type Agendamento } from "./tipos";

/**
 * Provedor de pagamento SANDBOX.
 * Nada aqui movimenta dinheiro: a cobrança Pix é fictícia e o pagamento é
 * aprovado por "simular pagamento" (ou pelo webhook de teste).
 * Para produção, implemente um provedor real com a mesma interface.
 */

export type Autorizacao = { token?: string | null; clienteId?: string | null };

export interface PagamentoPublico {
  id: string;
  metodo: "pix" | "cartao" | "local";
  tipo: "minimo" | "integral";
  valor_centavos: number;
  status: "pendente" | "pago" | "expirado" | "cancelado" | "estornado";
  pix_copia_cola: string | null;
  expira_em: Date | null;
  pago_em: Date | null;
  agendamento_status?: string;
}

async function agendamentoAutorizado(t: Executor, agendamentoId: string, auth: Autorizacao) {
  const [ag] = await t.query<Agendamento>(`select * from agendamento where id = $1 for update`, [agendamentoId]);
  if (!ag) throw new ErroNegocio("Agendamento não encontrado", 404);
  const ok = (auth.token && auth.token === ag.token_publico) || (auth.clienteId && auth.clienteId === ag.cliente_id);
  if (!ok) throw new ErroNegocio("Acesso negado a este agendamento", 403);
  return ag;
}

function copiaColaSandbox(valor: number, ref: string) {
  // Payload no formato EMV, mas com chave fictícia: NÃO é pagável em banco real.
  const v = (valor / 100).toFixed(2);
  return `00020126360014BR.GOV.BCB.PIX0114SANDBOX-AGENDOU520400005303986540${v.length}${v}5802BR5907AGENDOU6009SAO PAULO62${String(ref.length + 4).padStart(2, "0")}05${String(ref.length).padStart(2, "0")}${ref}6304TEST`;
}

async function validarCobranca(t: Executor, ag: Agendamento) {
  const cfg = await configAgendamento(ag.empresa_id, t);
  if (cfg.pagamento_modo === "desativado") throw new ErroNegocio("Esta empresa não recebe pagamentos online");
  if (!["confirmado", "pendente_pagamento"].includes(ag.status)) throw new ErroNegocio("Agendamento não está aberto para pagamento");
  const [pago] = await t.query(`select 1 from pagamento where agendamento_id = $1 and status = 'pago'`, [ag.id]);
  if (pago) throw new ErroNegocio("Este agendamento já foi pago");
  if (ag.preco_centavos - (ag.valor_coberto_centavos ?? 0) <= 0) throw new ErroNegocio("Este atendimento está incluído no plano: não há valor a pagar");
  return cfg;
}

function tipoPermitido(cfgTipo: string, pedido: string | undefined): "minimo" | "integral" {
  if (cfgTipo === "minimo" || cfgTipo === "integral") return cfgTipo;
  return pedido === "minimo" ? "minimo" : "integral";
}

/** R15–R17 */
export async function criarCobrancaPix(agendamentoId: string, tipoPedido: string | undefined, auth: Autorizacao) {
  const pag = await tx(async (t) => {
    await expirarPendentes(t);
    const ag = await agendamentoAutorizado(t, agendamentoId, auth);
    const cfg = await validarCobranca(t, ag);
    const tipo = tipoPermitido(cfg.pagamento_tipo, tipoPedido);
    const valor = valorCobranca(ag.preco_centavos - (ag.valor_coberto_centavos ?? 0), tipo, cfg);
    await t.query(`update pagamento set status = 'cancelado' where agendamento_id = $1 and status = 'pendente'`, [ag.id]);
    const ref = tokenAleatorio(8).toUpperCase();
    // Agendamento pendente: o prazo do Pix nunca passa do prazo de reserva já definido.
    const expira = new Date(
      ag.status === "pendente_pagamento" && ag.expira_em
        ? Math.min(new Date(ag.expira_em).getTime(), Date.now() + cfg.pix_expiracao_min * 60000)
        : Date.now() + cfg.pix_expiracao_min * 60000,
    );
    const [p] = await t.query<PagamentoPublico>(
      `insert into pagamento (agendamento_id, metodo, tipo, valor_centavos, status, provedor_ref, pix_copia_cola, expira_em)
       values ($1,'pix',$2,$3,'pendente',$4,$5,$6)
       returning id, metodo, tipo, valor_centavos, status, pix_copia_cola, expira_em, pago_em`,
      [ag.id, tipo, valor, `sbx_${ref}`, copiaColaSandbox(valor, ref), expira],
    );
    return p;
  });
  const qr = await QRCode.toDataURL(pag.pix_copia_cola!, { margin: 1, width: 260 });
  return { ...pag, qr_data_url: qr };
}

export async function consultarPagamento(id: string, auth: Autorizacao): Promise<PagamentoPublico> {
  return tx(async (t) => {
    await expirarPendentes(t);
    const [p] = await t.query<PagamentoPublico & { agendamento_id: string }>(
      `select id, agendamento_id, metodo, tipo, valor_centavos, status, pix_copia_cola, expira_em, pago_em from pagamento where id = $1`,
      [id],
    );
    if (!p) throw new ErroNegocio("Pagamento não encontrado", 404);
    const ag = await agendamentoAutorizado(t, p.agendamento_id, auth);
    return { ...p, agendamento_status: ag.status };
  });
}

async function aprovar(t: Executor, pagamentoId: string, agendamentoId: string) {
  await t.query(`update pagamento set status = 'pago', pago_em = now() where id = $1`, [pagamentoId]);
  const [ag] = await t.query<Agendamento>(
    `update agendamento set status = 'confirmado', expira_em = null
     where id = $1 and status = 'pendente_pagamento' returning *`,
    [agendamentoId],
  );
  if (ag) {
    // R19: era pendente → agora confirmado; dispara a confirmação (R14)
    const [info] = await t.query<{ cliente: string; telefone: string; servico: string; profissional: string; enome: string; eslug: string; ewhats: string | null }>(
      `select c.nome as cliente, c.telefone, s.nome as servico, p.nome as profissional, e.nome as enome, e.slug as eslug, e.telefone_whatsapp as ewhats
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
       join profissional p on p.id = a.profissional_id join empresa e on e.id = a.empresa_id where a.id = $1`,
      [agendamentoId],
    );
    await notificarConfirmacao(t, ag, { ...info, empresa: { nome: info.enome, slug: info.eslug, telefone_whatsapp: info.ewhats } });
  }
}

/** R19 — somente sandbox */
export async function simularPagamento(id: string, auth: Autorizacao) {
  if (process.env.PAGAMENTOS_SANDBOX === "0") throw new ErroNegocio("Simulação desativada", 403);
  return tx(async (t) => {
    await expirarPendentes(t);
    const [p] = await t.query<{ status: string; agendamento_id: string }>(
      `select status, agendamento_id from pagamento where id = $1 for update`,
      [id],
    );
    if (!p) throw new ErroNegocio("Pagamento não encontrado", 404);
    await agendamentoAutorizado(t, p.agendamento_id, auth);
    if (p.status !== "pendente") throw new ErroNegocio(p.status === "expirado" ? "O Pix expirou" : "Pagamento não está pendente");
    await aprovar(t, id, p.agendamento_id);
  });
}

export async function cancelarCobranca(id: string, auth: Autorizacao) {
  return tx(async (t) => {
    const [p] = await t.query<{ status: string; agendamento_id: string }>(
      `select status, agendamento_id from pagamento where id = $1 for update`,
      [id],
    );
    if (!p) throw new ErroNegocio("Pagamento não encontrado", 404);
    const ag = await agendamentoAutorizado(t, p.agendamento_id, auth);
    if (p.status === "pendente") await t.query(`update pagamento set status = 'cancelado' where id = $1`, [id]);
    // Pagamento obrigatório: desistir do pagamento libera o horário.
    if (ag.status === "pendente_pagamento")
      await t.query(`update agendamento set status = 'cancelado', cancelado_por = 'cliente' where id = $1`, [ag.id]);
  });
}

// ---------- Cartão (sandbox: tokenização fictícia, R20) ----------

export function luhn(num: string): boolean {
  let soma = 0;
  let dobra = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i];
    if (dobra) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobra = !dobra;
  }
  return num.length >= 13 && soma % 10 === 0;
}

export function bandeira(num: string): string {
  if (/^4/.test(num)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(num)) return "mastercard";
  if (/^3[47]/.test(num)) return "amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(num)) return "elo";
  return "outra";
}

export async function salvarCartao(clienteId: string, numero: string, mes: number, ano: number, cvv: string) {
  const n = numero.replace(/\D/g, "");
  if (!luhn(n)) throw new ErroNegocio("Número de cartão inválido");
  if (!/^\d{3,4}$/.test(cvv)) throw new ErroNegocio("CVV inválido");
  const anoFull = ano < 100 ? 2000 + ano : ano;
  const agora = new Date();
  if (mes < 1 || mes > 12 || anoFull < agora.getFullYear() || (anoFull === agora.getFullYear() && mes < agora.getMonth() + 1))
    throw new ErroNegocio("Cartão vencido ou validade inválida");
  // O número completo e o CVV são descartados aqui: guardamos só o token e os 4 últimos dígitos.
  return tx(async (t) => {
    const [{ n: qtd }] = await t.query<{ n: number }>(`select count(*)::int as n from cartao where cliente_id = $1`, [clienteId]);
    const [c] = await t.query(
      `insert into cartao (cliente_id, bandeira, ultimos4, validade_mes, validade_ano, token_provedor, favorito)
       values ($1,$2,$3,$4,$5,$6,$7) returning id, bandeira, ultimos4, validade_mes, validade_ano, favorito`,
      [clienteId, bandeira(n), n.slice(-4), mes, anoFull, `tok_sandbox_${tokenAleatorio(12)}`, qtd === 0],
    );
    return c;
  });
}

export async function pagarComCartao(agendamentoId: string, cartaoId: string, tipoPedido: string | undefined, clienteId: string) {
  return tx(async (t) => {
    await expirarPendentes(t);
    const ag = await agendamentoAutorizado(t, agendamentoId, { clienteId });
    const cfg = await validarCobranca(t, ag);
    const [cartao] = await t.query<{ ultimos4: string }>(`select ultimos4 from cartao where id = $1 and cliente_id = $2`, [cartaoId, clienteId]);
    if (!cartao) throw new ErroNegocio("Cartão não encontrado", 404);
    const tipo = tipoPermitido(cfg.pagamento_tipo, tipoPedido);
    const valor = valorCobranca(ag.preco_centavos - (ag.valor_coberto_centavos ?? 0), tipo, cfg);
    await t.query(`update pagamento set status = 'cancelado' where agendamento_id = $1 and status = 'pendente'`, [ag.id]);
    const [p] = await t.query<{ id: string }>(
      `insert into pagamento (agendamento_id, metodo, tipo, valor_centavos, status, provedor_ref)
       values ($1,'cartao',$2,$3,'pendente',$4) returning id`,
      [ag.id, tipo, valor, `sbx_card_${tokenAleatorio(6)}`],
    );
    // Sandbox: cartão terminado em 0002 é recusado (para testar o caminho de erro).
    if (cartao.ultimos4 === "0002") {
      await t.query(`update pagamento set status = 'cancelado' where id = $1`, [p.id]);
      return { aprovado: false as const, mensagem: "Pagamento recusado pelo emissor (sandbox)" };
    }
    await aprovar(t, p.id, ag.id);
    return { aprovado: true as const, pagamentoId: p.id, valor_centavos: valor };
  });
}

// ---------- Recebimento no balcão e estorno (painel) ----------

/** "Recebi no local": registra só o saldo = preço − parte coberta pelo plano − o que já foi pago (nunca cobra duas vezes). */
export async function registrarRecebimentoLocal(empresaId: string, id: string) {
  await tx(async (t) => {
    const [ag] = await t.query<{ saldo: number }>(
      `select preco_centavos - valor_coberto_centavos
              - coalesce((select sum(valor_centavos) from pagamento where agendamento_id = a.id and status='pago'),0)::int as saldo
       from agendamento a where id = $1 and empresa_id = $2 for update`,
      [id, empresaId],
    );
    if (!ag || ag.saldo <= 0) return;
    await t.query(
      `insert into pagamento (agendamento_id, metodo, tipo, valor_centavos, status, pago_em) values ($1,'local','integral',$2,'pago',now())`,
      [id, ag.saldo],
    );
  });
}

/** Estorna pagamentos aprovados de um agendamento cancelado (R24). No sandbox apenas marca como estornado. */
export async function estornarPagamentosCancelado(empresaId: string, id: string) {
  await q(
    `update pagamento p set status = 'estornado'
     from agendamento a
     where p.agendamento_id = a.id and a.id = $1 and a.empresa_id = $2 and a.status = 'cancelado'
       and p.status = 'pago' and p.metodo in ('pix','cartao')`,
    [id, empresaId],
  );
}
