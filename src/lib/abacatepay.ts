import "server-only";
import type { PlanoPago } from "./planos-sistema";

/**
 * Cliente mínimo da API v2 da AbacatePay (https://docs.abacatepay.com).
 * Roda só no servidor: a chave (ABACATEPAY_API_KEY) nunca vai para o navegador.
 *
 * Usamos o Checkout hospedado com produtos AVULSOS (sem `cycle`) cadastrados no
 * painel da AbacatePay: cada pagamento libera um período (1, 3 ou 12 meses) e
 * não existe cobrança recorrente automática.
 */

const BASE = () => (process.env.ABACATEPAY_API_URL ?? "https://api.abacatepay.com").replace(/\/+$/, "");
const TIMEOUT_MS = 15000;

const PRODUTO_ENV: Record<PlanoPago, string> = {
  mensal: "ABACATEPAY_PRODUTO_MENSAL",
  trimestral: "ABACATEPAY_PRODUTO_TRIMESTRAL",
  anual: "ABACATEPAY_PRODUTO_ANUAL",
};

export class ErroAbacatePay extends Error {}

export type StatusCheckout = "PENDING" | "EXPIRED" | "CANCELLED" | "PAID" | "REFUNDED" | "REDEEMED";

export interface Checkout {
  id: string;
  url: string;
  status: StatusCheckout;
  amount: number | null;
  paidAmount: number | null;
  externalId: string | null;
  devMode: boolean;
}

export const produtoDoPlano = (p: PlanoPago) => process.env[PRODUTO_ENV[p]]?.trim() || null;

/**
 * Chave do HMAC do header X-Webhook-Signature. Pela documentação da AbacatePay, é a
 * CHAVE PÚBLICA da AbacatePay (publicada em docs.abacatepay.com/pages/webhooks/security),
 * não o secret do webhook. Não é segredo, mas fica em variável para poder ser trocada.
 */
export const chaveHmacWebhook = () => process.env.ABACATEPAY_WEBHOOK_HMAC_KEY?.trim() || null;

/**
 * Pagamentos feitos em Dev Mode (chave de teste) não movimentam dinheiro. Em produção eles
 * NUNCA liberam plano, a menos que ABACATEPAY_PERMITIR_DEVMODE=1 (só para homologação).
 */
export const permitirDevMode = () => process.env.NODE_ENV !== "production" || process.env.ABACATEPAY_PERMITIR_DEVMODE === "1";

/** O que falta configurar no servidor (lista vazia = pronto para cobrar). */
export function pendenciasConfiguracao(): string[] {
  const falta: string[] = [];
  if (!process.env.ABACATEPAY_API_KEY) falta.push("ABACATEPAY_API_KEY");
  if (!process.env.ABACATEPAY_WEBHOOK_SECRET) falta.push("ABACATEPAY_WEBHOOK_SECRET");
  if (!chaveHmacWebhook() && process.env.NODE_ENV === "production") falta.push("ABACATEPAY_WEBHOOK_HMAC_KEY");
  if (!process.env.APP_URL) falta.push("APP_URL");
  for (const [plano, env] of Object.entries(PRODUTO_ENV)) if (!produtoDoPlano(plano as PlanoPago)) falta.push(env);
  return falta;
}

function metodos(): string[] {
  const validos = new Set(["PIX", "CARD", "BOLETO"]);
  const lista = (process.env.ABACATEPAY_METODOS ?? "PIX,CARD")
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter((m) => validos.has(m));
  return lista.length ? [...new Set(lista)] : ["PIX"];
}

async function chamar<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
  const chave = process.env.ABACATEPAY_API_KEY;
  if (!chave) throw new ErroAbacatePay("Pagamento online não configurado (falta ABACATEPAY_API_KEY).");
  let r: Response;
  try {
    r = await fetch(`${BASE()}${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${chave}`, "content-type": "application/json", accept: "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ErroAbacatePay("Não foi possível falar com a AbacatePay. Tente de novo em instantes.");
  }
  const j = (await r.json().catch(() => null)) as { data?: T; error?: string | null; success?: boolean } | null;
  if (!r.ok || !j || j.error || !j.data) {
    const motivo = j?.error ?? `HTTP ${r.status}`;
    throw new ErroAbacatePay(r.status === 401 ? "A AbacatePay recusou a chave da API (ABACATEPAY_API_KEY)." : `AbacatePay: ${motivo}`);
  }
  return j.data;
}

function normalizar(d: Record<string, unknown>): Checkout {
  return {
    id: String(d.id ?? ""),
    url: String(d.url ?? ""),
    status: String(d.status ?? "PENDING") as StatusCheckout,
    amount: typeof d.amount === "number" ? d.amount : null,
    paidAmount: typeof d.paidAmount === "number" ? d.paidAmount : null,
    externalId: typeof d.externalId === "string" ? d.externalId : null,
    devMode: d.devMode === true,
  };
}

/** POST /v2/checkouts/create com o produto do plano. */
export async function criarCheckout(p: {
  plano: PlanoPago;
  externalId: string;
  retornoUrl: string;
  metadata: Record<string, string>;
}): Promise<Checkout> {
  const produto = produtoDoPlano(p.plano);
  if (!produto) throw new ErroAbacatePay(`Produto do plano ${p.plano} não configurado (${PRODUTO_ENV[p.plano]}).`);
  const d = await chamar<Record<string, unknown>>("POST", "/v2/checkouts/create", {
    items: [{ id: produto, quantity: 1 }],
    methods: metodos(),
    returnUrl: p.retornoUrl,
    completionUrl: p.retornoUrl,
    externalId: p.externalId,
    metadata: p.metadata,
  });
  const c = normalizar(d);
  if (!c.id || !/^https?:\/\//.test(c.url)) throw new ErroAbacatePay("Resposta inesperada da AbacatePay.");
  return c;
}

/** GET /v2/checkouts/get?id= — fonte da verdade sobre o pagamento. */
export async function consultarCheckout(id: string): Promise<Checkout> {
  return normalizar(await chamar<Record<string, unknown>>("GET", `/v2/checkouts/get?id=${encodeURIComponent(id)}`));
}
