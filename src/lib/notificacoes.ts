import "server-only";
import { q, q1, type Executor } from "./db";
import { decifrar, enviarModelo, ErroMeta, type ConexaoWhatsapp } from "./whatsapp";
import { log } from "./log";

/**
 * Notificações por WhatsApp.
 *
 * 1. `notificar()` grava a mensagem na tabela `notificacao` (status "pendente") dentro da transação.
 * 2. Depois do commit, `despachar()` tenta enviar pelo número conectado À PRÓPRIA barbearia
 *    (WhatsApp Cloud API). Nunca há envio por número de outra empresa nem número "global".
 * 3. Resultado honesto:
 *    - nao_enviado → sem conexão ou sem modelo aprovado para esse tipo (dá para enviar manualmente)
 *    - aceito      → a Meta aceitou o pedido (ainda não é entrega)
 *    - enviado / entregue / lido / falhou → confirmados pelo webhook assinado da Meta
 */

export type TipoNotificacao = "confirmacao" | "lembrete" | "codigo" | "cancelamento" | "remarcacao" | "aviso_empresa" | "teste";

export async function notificar(
  t: Executor,
  n: {
    empresaId: string;
    agendamentoId?: string | null;
    canal?: "whatsapp" | "sms";
    destino: string;
    mensagem: string;
    tipo: TipoNotificacao;
    /** valores das variáveis {{1}}, {{2}}… do modelo aprovado, na ordem */
    parametros?: string[];
  },
): Promise<string> {
  const [row] = await t.query<{ id: string }>(
    `insert into notificacao (empresa_id, agendamento_id, canal, destino, mensagem, tipo, parametros)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb) returning id`,
    [n.empresaId, n.agendamentoId ?? null, n.canal ?? "whatsapp", n.destino, n.mensagem, n.tipo, n.parametros ? JSON.stringify(n.parametros) : null],
  );
  if (t.depois) t.depois(() => despachar(row.id));
  else await despachar(row.id);
  return row.id;
}

function modeloPara(c: ConexaoWhatsapp, tipo: string | null): { nome: string; idioma: string; params: number; botao: boolean } | null {
  switch (tipo) {
    case "confirmacao":
      return c.modelo_confirmacao ? { nome: c.modelo_confirmacao, idioma: c.idioma, params: c.modelo_confirmacao_params ?? 0, botao: false } : null;
    case "lembrete":
      return c.modelo_lembrete ? { nome: c.modelo_lembrete, idioma: c.idioma, params: c.modelo_lembrete_params ?? 0, botao: false } : null;
    case "codigo":
      return c.modelo_codigo ? { nome: c.modelo_codigo, idioma: c.idioma, params: 1, botao: c.modelo_codigo_botao } : null;
    case "teste":
      // teste: usa o modelo de confirmação; sem ele, o "hello_world" que a Meta cria em toda conta nova
      return c.modelo_confirmacao
        ? { nome: c.modelo_confirmacao, idioma: c.idioma, params: c.modelo_confirmacao_params ?? 0, botao: false }
        : { nome: "hello_world", idioma: "en_US", params: 0, botao: false };
    default:
      return null; // cancelamento, remarcação e aviso à empresa: ainda sem modelo próprio
  }
}

async function marcar(id: string, status: string, erro: string | null, extra?: { wamid?: string; limparParametros?: boolean }) {
  await q(
    `update notificacao set status = $2, erro = $3, provedor_msg_id = coalesce($4, provedor_msg_id), atualizado_em = now(),
       parametros = case when $5 then null else parametros end
     where id = $1`,
    [id, status, erro, extra?.wamid ?? null, !!extra?.limparParametros],
  );
}

/** Tenta enviar uma notificação pendente. Seguro para chamar mais de uma vez. */
export async function despachar(id: string): Promise<string> {
  // "trava" a linha: só quem muda de pendente → enviando segue (evita envio duplicado)
  const n = await q1<{ id: string; empresa_id: string; destino: string; tipo: string | null; parametros: string[] | null }>(
    `update notificacao set atualizado_em = now() where id = $1 and status = 'pendente' and (atualizado_em is null or atualizado_em < now() - interval '2 minutes')
     returning id, empresa_id, destino, tipo, parametros`,
    [id],
  );
  if (!n) return "ignorado";
  const ehCodigo = n.tipo === "codigo";
  const c = await q1<ConexaoWhatsapp>(`select * from whatsapp_conexao where empresa_id = $1`, [n.empresa_id]);
  if (!c) {
    await marcar(id, "nao_enviado", "WhatsApp da barbearia não conectado", { limparParametros: ehCodigo });
    return "nao_enviado";
  }
  if (c.status !== "conectado") {
    await marcar(id, "nao_enviado", `Conexão do WhatsApp com erro: ${c.ultimo_erro ?? "verifique em WhatsApp"}`, { limparParametros: ehCodigo });
    return "nao_enviado";
  }
  const modelo = modeloPara(c, n.tipo);
  if (!modelo) {
    await marcar(id, "nao_enviado", "Sem modelo aprovado para este tipo de mensagem", { limparParametros: ehCodigo });
    return "nao_enviado";
  }
  const valores = n.parametros ?? [];
  const params = Array.from({ length: modelo.params }, (_, i) => (valores[i] ?? "").trim() || "-");
  try {
    const token = decifrar(c.token_cifrado);
    const wamid = await enviarModelo({
      phoneNumberId: c.phone_number_id, // sempre o número DESTA barbearia
      token,
      para: n.destino,
      modelo: modelo.nome,
      idioma: modelo.idioma,
      params,
      botaoCodigo: modelo.botao ? (valores[0] ?? null) : null,
    });
    await marcar(id, "aceito", null, { wamid, limparParametros: ehCodigo });
    return "aceito";
  } catch (e) {
    const msg = e instanceof ErroMeta ? e.message : "Falha inesperada ao enviar";
    if (!(e instanceof ErroMeta)) log.erro("[whatsapp] envio falhou:", e);
    await marcar(id, "falhou", msg, { limparParametros: ehCodigo });
    if (e instanceof ErroMeta && e.credencialInvalida) {
      await q(`update whatsapp_conexao set status = 'erro', ultimo_erro = $2 where empresa_id = $1`, [n.empresa_id, msg]);
    }
    return "falhou";
  }
}

/** Status da confirmação de um agendamento (para a tela de "agendamento confirmado"). */
export async function statusConfirmacao(agendamentoId: string): Promise<string | null> {
  const r = await q1<{ status: string }>(
    `select status from notificacao where agendamento_id = $1 and tipo = 'confirmacao' order by criado_em desc limit 1`,
    [agendamentoId],
  );
  return r?.status ?? null;
}
