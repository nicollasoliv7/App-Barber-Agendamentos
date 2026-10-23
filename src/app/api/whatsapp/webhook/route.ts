import crypto from "node:crypto";
import { q } from "@/lib/db";
import { aplicarStatus, conferirAssinatura, segredosDoWebhook } from "@/lib/whatsapp";

/**
 * Webhook da WhatsApp Cloud API (Meta).
 * GET  → verificação do endereço (hub.challenge), com WHATSAPP_WEBHOOK_VERIFY_TOKEN.
 * POST → status das mensagens (sent/delivered/read/failed). Só é aceito com assinatura
 *        X-Hub-Signature-256 válida (App Secret). Cada evento só altera mensagens da
 *        barbearia dona do número que o gerou.
 */

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export async function GET(req: Request) {
  const u = new URL(req.url);
  const esperado = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const token = u.searchParams.get("hub.verify_token") ?? "";
  if (u.searchParams.get("hub.mode") === "subscribe" && esperado && iguais(token, esperado)) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

interface Evento {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: { id?: string; status?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] }[];
      };
    }[];
  }[];
}

export async function POST(req: Request) {
  const bruto = await req.text();
  let ev: Evento;
  try {
    ev = JSON.parse(bruto) as Evento;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const valores = (ev.entry ?? []).flatMap((e) => e.changes ?? []).map((c) => c.value ?? {});
  const numeros = [...new Set(valores.map((v) => v.metadata?.phone_number_id).filter((x): x is string => !!x))];

  // nada é processado antes de conferir a assinatura
  const quem = conferirAssinatura(bruto, req.headers.get("x-hub-signature-256"), await segredosDoWebhook(numeros));
  if (!quem) return new Response("Unauthorized", { status: 401 });

  for (const v of valores) {
    const numero = v.metadata?.phone_number_id;
    if (!numero) continue;
    if (quem.numero && quem.numero !== numero) continue; // app próprio de uma barbearia só fala pelo próprio número
    await q(`update whatsapp_conexao set ultimo_webhook_em = now() where phone_number_id = $1`, [numero]);
    for (const s of v.statuses ?? []) {
      if (!s.id || !s.status) continue;
      const err = s.errors?.[0];
      const motivo = err ? `${err.error_data?.details ?? err.message ?? err.title ?? "Falha na entrega"}${err.code ? ` (código ${err.code})` : ""}` : null;
      await aplicarStatus(numero, s.id, s.status, motivo);
    }
  }
  // a Meta reenvia o evento se não receber 200
  return new Response("OK", { status: 200 });
}
