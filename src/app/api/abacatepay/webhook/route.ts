import crypto from "node:crypto";
import { cobrancaDoEvento, sincronizarCobranca } from "@/lib/assinatura-sistema";
import { chaveHmacWebhook } from "@/lib/abacatepay";
import { eventoJaProcessado, marcarEventoProcessado } from "@/lib/webhook-eventos";
import { log } from "@/lib/log";

/**
 * Webhook da AbacatePay (assinatura da plataforma).
 * URL a cadastrar na AbacatePay: https://SEU-APP/api/abacatepay/webhook?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>
 *
 * Autenticidade (as duas camadas descritas na documentação da AbacatePay):
 * 1. `webhookSecret` da URL tem de ser igual a ABACATEPAY_WEBHOOK_SECRET.
 * 2. `X-Webhook-Signature` tem de ser o HMAC-SHA256 (base64) do corpo bruto, calculado com a
 *    chave pública da AbacatePay (ABACATEPAY_WEBHOOK_HMAC_KEY). Obrigatória em produção.
 *
 * Duplicados: o `id` do evento (igual em todas as retentativas) fica em webhook_evento;
 * evento já processado responde 200 sem reprocessar.
 *
 * O conteúdo do evento NUNCA libera o plano sozinho: só serve para achar a cobrança,
 * que é então conferida direto na API da AbacatePay (sincronizarCobranca).
 */

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const EVENTOS = new Set(["checkout.completed", "checkout.refunded", "checkout.disputed", "checkout.lost"]);

/** Ids que podem identificar a cobrança: id do checkout, nosso externalId ou metadata.cobranca_id. */
function idsDoEvento(data: unknown): string[] {
  const ids: string[] = [];
  const visitar = (o: unknown, nivel: number) => {
    if (!o || typeof o !== "object" || nivel > 2) return;
    const r = o as Record<string, unknown>;
    for (const k of ["id", "externalId", "cobranca_id"]) if (typeof r[k] === "string") ids.push(r[k]);
    for (const k of ["checkout", "billing", "payment", "metadata"]) visitar(r[k], nivel + 1);
  };
  visitar(data, 0);
  return [...new Set(ids)].slice(0, 10);
}

export async function POST(req: Request) {
  const segredo = process.env.ABACATEPAY_WEBHOOK_SECRET;
  const recebido = new URL(req.url).searchParams.get("webhookSecret") ?? "";
  if (!segredo || !iguais(recebido, segredo)) {
    // nunca registra os valores, só o motivo
    log.info(`[abacatepay] webhook recusado: ${!segredo ? "ABACATEPAY_WEBHOOK_SECRET não configurado" : recebido ? "webhookSecret da URL não confere" : "URL sem ?webhookSecret="}`);
    return new Response("Unauthorized", { status: 401 });
  }

  const bruto = await req.text();
  const chaveHmac = chaveHmacWebhook();
  if (chaveHmac) {
    const esperado = crypto.createHmac("sha256", chaveHmac).update(Buffer.from(bruto, "utf8")).digest("base64");
    if (!iguais(req.headers.get("x-webhook-signature") ?? "", esperado)) {
      log.info(`[abacatepay] webhook recusado: ${req.headers.get("x-webhook-signature") ? "X-Webhook-Signature não confere (confira ABACATEPAY_WEBHOOK_HMAC_KEY)" : "sem X-Webhook-Signature"}`);
      return new Response("Unauthorized", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    log.erro("[abacatepay] webhook recusado: ABACATEPAY_WEBHOOK_HMAC_KEY não configurada");
    return new Response("Webhook não configurado", { status: 503 }); // 5xx: a AbacatePay tenta de novo depois
  }

  let ev: { id?: unknown; event?: string; devMode?: unknown; data?: unknown };
  try {
    ev = JSON.parse(bruto) as typeof ev;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  log.info(`[abacatepay] webhook recebido: ${ev.event ?? "sem evento"}${ev.devMode === true ? " (Dev Mode)" : ""}`);
  if (!ev.event || !EVENTOS.has(ev.event)) return Response.json({ ok: true, ignorado: true });

  const eventoId = typeof ev.id === "string" && ev.id.length <= 200 ? ev.id : null;
  if (eventoId && (await eventoJaProcessado(eventoId, ev.event, ev.devMode === true)))
    return Response.json({ ok: true, duplicado: true });

  const cobranca = await cobrancaDoEvento(idsDoEvento(ev.data));
  if (!cobranca) {
    if (eventoId) await marcarEventoProcessado(eventoId, "cobranca-nao-encontrada");
    return Response.json({ ok: true, encontrado: false });
  }
  try {
    const status = await sincronizarCobranca(cobranca);
    if (eventoId) await marcarEventoProcessado(eventoId, `cobranca ${cobranca}: ${status ?? "?"}`);
    return Response.json({ ok: true, status });
  } catch (e) {
    log.erro("[abacatepay] webhook: falha ao conferir a cobrança", e);
    return new Response("Erro ao conferir o pagamento", { status: 502 }); // a AbacatePay tenta de novo
  }
}
