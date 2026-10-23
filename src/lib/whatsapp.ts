import "server-only";
import crypto from "node:crypto";
import { q, q1 } from "./db";
import { ErroNegocio } from "./tipos";

/**
 * Integração com a API oficial do WhatsApp (WhatsApp Cloud API, da Meta).
 *
 * - Cada barbearia conecta o PRÓPRIO número (phone_number_id + token).
 * - O token fica criptografado no banco (AES-256-GCM) e só é lido aqui, no servidor.
 * - Mensagens iniciadas pela empresa precisam de MODELO aprovado pela Meta (template).
 * - "aceito" = a Meta aceitou o pedido. Enviado/entregue/lido só chegam pelo webhook assinado.
 */

const GRAPH_URL = () => (process.env.WHATSAPP_GRAPH_URL ?? "https://graph.facebook.com").replace(/\/$/, "");
const GRAPH_VERSAO = () => process.env.WHATSAPP_GRAPH_VERSION ?? "v25.0";

// ---------------------------------------------------------------------------
// Criptografia das credenciais
// ---------------------------------------------------------------------------

function chave(): Buffer | null {
  const s = process.env.WHATSAPP_CHAVE_CRIPTO ?? "";
  if (s.length < 32) return null;
  return crypto.createHash("sha256").update(s).digest();
}

export const criptografiaPronta = () => chave() !== null;

export function cifrar(texto: string): string {
  const k = chave();
  if (!k) throw new ErroNegocio("O servidor ainda não tem a chave de criptografia (WHATSAPP_CHAVE_CRIPTO). Peça ao administrador da plataforma.", 503);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), dados.toString("base64")].join(".");
}

export function decifrar(cifrado: string): string {
  const k = chave();
  if (!k) throw new Error("WHATSAPP_CHAVE_CRIPTO ausente");
  const [v, iv, tag, dados] = cifrado.split(".");
  if (v !== "v1") throw new Error("formato de credencial desconhecido");
  const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Chamadas à Graph API
// ---------------------------------------------------------------------------

export class ErroMeta extends Error {
  constructor(
    message: string,
    public codigo?: number,
  ) {
    super(message);
  }
  /** Token inválido/expirado ou sem permissão: a conexão precisa ser refeita. */
  get credencialInvalida() {
    return this.codigo === 190 || this.codigo === 10 || this.codigo === 200;
  }
}

const ERROS: Record<number, string> = {
  190: "Token de acesso inválido ou expirado",
  10: "O token não tem permissão para este número",
  200: "O token não tem permissão para este número",
  100: "Identificador inválido (confira o Phone Number ID e o WABA ID)",
  131030: "Número fora da lista de teste da Meta (no modo de teste, cadastre o destinatário no painel da Meta)",
  131026: "Mensagem não entregue: o número não tem WhatsApp ou não pode receber",
  131047: "Fora da janela de 24 h: use um modelo aprovado",
  131051: "Tipo de mensagem não suportado",
  132000: "Quantidade de variáveis diferente da do modelo aprovado",
  132001: "Modelo não encontrado nesse idioma",
  132005: "Texto das variáveis longo demais",
  132007: "Conteúdo do modelo violou a política da Meta",
  132012: "Formato das variáveis não confere com o modelo",
  133010: "Número da barbearia ainda não registrado na Cloud API",
  131056: "Muitas mensagens para o mesmo número em pouco tempo",
  130429: "Limite de envio da Meta atingido; tente mais tarde",
  131048: "Limite de envio por qualidade atingido; tente mais tarde",
};

function traduzir(e: { code?: number; message?: string; error_data?: { details?: string } } | undefined, status: number) {
  const codigo = e?.code;
  const base = (codigo && ERROS[codigo]) || e?.error_data?.details || e?.message || `Erro HTTP ${status}`;
  return new ErroMeta(`${base}${codigo ? ` (código ${codigo})` : ""}`, codigo);
}

async function graph<T>(caminho: string, token: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${GRAPH_URL()}/${GRAPH_VERSAO()}/${caminho}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new ErroMeta("Não foi possível falar com a Meta (rede ou tempo esgotado)");
  }
  const j = (await r.json().catch(() => ({}))) as T & { error?: { code?: number; message?: string } };
  if (!r.ok || j.error) throw traduzir(j.error, r.status);
  return j;
}

/** Confere token + número + WABA. Retorna os dados públicos do número. */
export async function verificarCredenciais(phoneNumberId: string, wabaId: string, token: string) {
  const numero = await graph<{ id: string; display_phone_number?: string; verified_name?: string }>(
    `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
    token,
  );
  const lista = await graph<{ data?: { id: string }[] }>(`${encodeURIComponent(wabaId)}/phone_numbers?fields=id&limit=200`, token);
  if (!lista.data?.some((n) => n.id === phoneNumberId))
    throw new ErroMeta("Esse número não pertence à conta do WhatsApp Business (WABA) informada");
  return { numero: numero.display_phone_number ?? null, nome: numero.verified_name ?? null };
}

export interface InfoModelo {
  params: number;
  botaoCodigo: boolean;
  categoria: string;
}

/** Procura o modelo aprovado pelo nome e idioma e conta as variáveis {{n}} do corpo. */
export async function verificarModelo(wabaId: string, token: string, nome: string, idioma: string): Promise<InfoModelo> {
  type Componente = { type: string; text?: string; buttons?: { type: string; url?: string }[] };
  const r = await graph<{ data?: { name: string; language: string; status: string; category: string; parameter_format?: string; components?: Componente[] }[] }>(
    `${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(nome)}&fields=name,language,status,category,parameter_format,components&limit=100`,
    token,
  );
  const doNome = (r.data ?? []).filter((m) => m.name === nome);
  if (doNome.length === 0) throw new ErroMeta(`Modelo "${nome}" não encontrado nesta conta`);
  const m = doNome.find((x) => x.language === idioma);
  if (!m) throw new ErroMeta(`Modelo "${nome}" existe, mas não no idioma ${idioma} (há: ${doNome.map((x) => x.language).join(", ")})`);
  if (m.status !== "APPROVED") throw new ErroMeta(`Modelo "${nome}" ainda não foi aprovado pela Meta (status: ${m.status})`);
  if (m.parameter_format === "NAMED") throw new ErroMeta(`Modelo "${nome}" usa variáveis com nome; crie-o com variáveis numeradas ({{1}}, {{2}}…)`);
  const corpo = m.components?.find((c) => c.type === "BODY")?.text ?? "";
  const nums = [...corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((x) => Number(x[1]));
  const botoes = m.components?.find((c) => c.type === "BUTTONS")?.buttons ?? [];
  const botaoCodigo = botoes.some((b) => b.type === "OTP" || (b.type === "URL" && /\{\{\s*1\s*\}\}/.test(b.url ?? "")));
  return { params: nums.length ? Math.max(...nums) : 0, botaoCodigo, categoria: m.category };
}

/** Telefone BR (só dígitos, com DDD) → formato internacional exigido pela API. */
export function paraInternacional(tel: string) {
  const d = tel.replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

/** Envia um modelo aprovado. Retorna o id da mensagem (wamid) que a Meta aceitou. */
export async function enviarModelo(o: {
  phoneNumberId: string;
  token: string;
  para: string;
  modelo: string;
  idioma: string;
  params: string[];
  botaoCodigo?: string | null;
}): Promise<string> {
  const componentes: unknown[] = [];
  if (o.params.length) componentes.push({ type: "body", parameters: o.params.map((t) => ({ type: "text", text: t.slice(0, 1000) })) });
  if (o.botaoCodigo) componentes.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: o.botaoCodigo }] });
  const r = await graph<{ messages?: { id: string }[] }>(`${encodeURIComponent(o.phoneNumberId)}/messages`, o.token, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: paraInternacional(o.para),
      type: "template",
      template: { name: o.modelo, language: { code: o.idioma }, ...(componentes.length ? { components: componentes } : {}) },
    },
  });
  const id = r.messages?.[0]?.id;
  if (!id) throw new ErroMeta("A Meta não devolveu o id da mensagem");
  return id;
}

// ---------------------------------------------------------------------------
// Conexão da barbearia
// ---------------------------------------------------------------------------

export interface ConexaoWhatsapp {
  empresa_id: string;
  phone_number_id: string;
  waba_id: string;
  numero_exibicao: string | null;
  nome_verificado: string | null;
  token_cifrado: string;
  app_secret_cifrado: string | null;
  idioma: string;
  modelo_confirmacao: string | null;
  modelo_confirmacao_params: number | null;
  modelo_lembrete: string | null;
  modelo_lembrete_params: number | null;
  modelo_codigo: string | null;
  modelo_codigo_botao: boolean;
  lembretes_ativos: boolean;
  status: "conectado" | "erro";
  ultimo_erro: string | null;
  verificado_em: Date;
  ultimo_webhook_em: Date | null;
}

/** Dados da conexão SEM credenciais — seguro para mandar às telas. */
export type ConexaoPublica = Omit<ConexaoWhatsapp, "token_cifrado" | "app_secret_cifrado"> & { tem_app_secret: boolean };

export async function conexaoPublica(empresaId: string): Promise<ConexaoPublica | null> {
  const c = await q1<ConexaoWhatsapp>(`select * from whatsapp_conexao where empresa_id = $1`, [empresaId]);
  if (!c) return null;
  const { token_cifrado: _t, app_secret_cifrado, ...resto } = c;
  void _t;
  return { ...resto, tem_app_secret: !!app_secret_cifrado };
}

/** A confirmação automática está pronta para esta barbearia? (usado pela página pública) */
export async function confirmacaoAutomaticaAtiva(empresaId: string): Promise<boolean> {
  if (!criptografiaPronta()) return false;
  const r = await q1(`select 1 from whatsapp_conexao where empresa_id = $1 and status = 'conectado' and modelo_confirmacao is not null`, [empresaId]);
  return !!r;
}

// ---------------------------------------------------------------------------
// Webhook (status de entrega)
// ---------------------------------------------------------------------------

/** Segredo que pode assinar webhooks. `numero` = null → app da plataforma (vale para todos os números). */
export interface SegredoWebhook {
  segredo: string;
  numero: string | null;
}

/**
 * Confere o cabeçalho X-Hub-Signature-256. Retorna o segredo que bateu (ou null).
 * Se quem assinou foi o app próprio de UMA barbearia, o evento só vale para o número dela.
 */
export function conferirAssinatura(corpo: string, cabecalho: string | null, segredos: SegredoWebhook[]): SegredoWebhook | null {
  if (!cabecalho?.startsWith("sha256=")) return null;
  const recebido = Buffer.from(cabecalho.slice(7), "hex");
  for (const s of segredos) {
    const esperado = crypto.createHmac("sha256", s.segredo).update(corpo, "utf8").digest();
    if (esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido)) return s;
  }
  return null;
}

/** Segredos aceitos para estes números: o App Secret da plataforma + o de apps próprios das barbearias. */
export async function segredosDoWebhook(phoneNumberIds: string[]): Promise<SegredoWebhook[]> {
  const s: SegredoWebhook[] = [];
  if (process.env.WHATSAPP_APP_SECRET) s.push({ segredo: process.env.WHATSAPP_APP_SECRET, numero: null });
  if (phoneNumberIds.length && criptografiaPronta()) {
    const rows = await q<{ phone_number_id: string; app_secret_cifrado: string }>(
      `select phone_number_id, app_secret_cifrado from whatsapp_conexao where phone_number_id = any($1::text[]) and app_secret_cifrado is not null`,
      [phoneNumberIds],
    );
    for (const r of rows) {
      try {
        s.push({ segredo: decifrar(r.app_secret_cifrado), numero: r.phone_number_id });
      } catch {
        /* credencial ilegível: ignora */
      }
    }
  }
  return s;
}

const ORDEM: Record<string, number> = { pendente: 0, nao_enviado: 0, aceito: 1, enviado: 2, entregue: 3, lido: 4 };
const DA_META: Record<string, string> = { sent: "enviado", delivered: "entregue", read: "lido", failed: "falhou" };

/**
 * Aplica um status vindo da Meta. Só atualiza mensagens da barbearia dona do número
 * que gerou o evento, e nunca "volta" um status (ex.: lido → entregue fora de ordem).
 */
export async function aplicarStatus(phoneNumberId: string, wamid: string, statusMeta: string, erro?: string | null): Promise<boolean> {
  const novo = DA_META[statusMeta];
  if (!novo) return false;
  const atual = await q1<{ id: string; status: string }>(
    `select n.id, n.status from notificacao n join whatsapp_conexao w on w.empresa_id = n.empresa_id
     where n.provedor_msg_id = $1 and w.phone_number_id = $2`,
    [wamid, phoneNumberId],
  );
  if (!atual) return false;
  const pode =
    novo === "falhou" ? ["aceito", "enviado"].includes(atual.status) : (ORDEM[novo] ?? 0) > (ORDEM[atual.status] ?? 0) && atual.status !== "falhou";
  if (!pode) return false;
  await q(
    `update notificacao set status = $2, atualizado_em = now(),
       enviado_em = case when $2 = 'enviado' then coalesce(enviado_em, now()) else enviado_em end,
       erro = case when $2 = 'falhou' then $3 else erro end
     where id = $1`,
    [atual.id, novo, erro ?? null],
  );
  return true;
}

/** Marca que chegou um evento da Meta para este número (mostrado no painel como "último status recebido"). */
export async function registrarWebhookRecebido(phoneNumberId: string) {
  await q(`update whatsapp_conexao set ultimo_webhook_em = now() where phone_number_id = $1`, [phoneNumberId]);
}
