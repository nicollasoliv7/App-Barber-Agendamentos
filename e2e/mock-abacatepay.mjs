// AbacatePay FALSA (API v2) para testes: nada sai para a AbacatePay de verdade.
// node e2e/mock-abacatepay.mjs   → porta 4020 (MOCK_ABACATE_PORTA)
// Chave aceita: "chave-teste-abacate". WEBHOOK_URL = endereço do webhook do app (com ?webhookSecret=).
import http from "node:http";
import crypto from "node:crypto";

const PORTA = Number(process.env.MOCK_ABACATE_PORTA ?? 4020);
const CHAVE = "chave-teste-abacate";
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "http://localhost:3300/api/abacatepay/webhook?webhookSecret=segredo-webhook-teste";
const produtos = { prod_mensal: 5990, prod_trimestral: 15990, prod_anual: 59990 };
// chave do HMAC (na AbacatePay real é a chave pública dela; aqui, uma de teste)
const HMAC = process.env.MOCK_HMAC_KEY ?? "chave-publica-teste-abacate";
const checkouts = new Map();
let seqEvento = 0;
let ultimoEvento = null;
let seq = 0;

const json = (res, status, corpo) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
};
const ler = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
const publico = (c) => ({ id: c.id, url: c.url, status: c.status, amount: c.amount, paidAmount: c.paidAmount, externalId: c.externalId, devMode: true, items: c.items });

// cada evento tem um id próprio, repetido só nas retentativas (como na AbacatePay)
async function avisar(c, evento, repetir = false) {
  const id = repetir && ultimoEvento ? ultimoEvento : `log_teste_${++seqEvento}`;
  ultimoEvento = id;
  const corpo = JSON.stringify({ id, event: evento, apiVersion: 2, devMode: true, data: { checkout: { id: c.id, externalId: c.externalId } } });
  const assinatura = crypto.createHmac("sha256", HMAC).update(corpo, "utf8").digest("base64");
  await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "x-webhook-signature": assinatura }, body: corpo }).catch(() => {});
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORTA}`);
  const api = u.pathname.startsWith("/v2/");
  if (api && req.headers.authorization !== `Bearer ${CHAVE}`) return json(res, 401, { data: null, error: "Unauthorized", success: false });

  if (req.method === "POST" && u.pathname === "/v2/checkouts/create") {
    const b = JSON.parse(await ler(req));
    const item = b.items?.[0];
    if (!(item?.id in produtos)) return json(res, 400, { data: null, error: "Product not found", success: false });
    const id = `bill_teste_${++seq}`;
    const c = { id, url: `http://localhost:${PORTA}/pagar/${id}`, status: "PENDING", amount: produtos[item.id] * (item.quantity ?? 1), paidAmount: null, externalId: b.externalId ?? null, completionUrl: b.completionUrl, items: b.items, metodos: b.methods };
    checkouts.set(id, c);
    return json(res, 200, { data: publico(c), error: null, success: true });
  }
  if (req.method === "GET" && u.pathname === "/v2/checkouts/get") {
    const c = checkouts.get(u.searchParams.get("id"));
    return c ? json(res, 200, { data: publico(c), error: null, success: true }) : json(res, 404, { data: null, error: "Not found", success: false });
  }
  // página de pagamento falsa
  const m = u.pathname.match(/^\/pagar\/([\w-]+)$/);
  if (m && checkouts.has(m[1])) {
    const c = checkouts.get(m[1]);
    if (req.method === "POST") {
      c.status = "PAID";
      c.paidAmount = c.amount;
      await avisar(c, "checkout.completed");
      res.writeHead(303, { location: c.completionUrl });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><title>Checkout de teste</title><h1>Checkout de teste</h1><p>Valor: ${(c.amount / 100).toFixed(2)}</p><form method="post"><button>Pagar (teste)</button></form>`);
  }
  // controles do teste
  if (req.method === "POST" && u.pathname === "/__produto") {
    const b = JSON.parse(await ler(req));
    produtos[b.id] = b.price;
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && u.pathname === "/__estado") {
    const b = JSON.parse(await ler(req));
    const c = checkouts.get(b.id);
    if (!c) return json(res, 404, {});
    Object.assign(c, b.campos);
    if (b.evento) await avisar(c, b.evento, b.repetir === true);
    return json(res, 200, publico(c));
  }
  if (u.pathname === "/__checkouts") return json(res, 200, [...checkouts.values()]);
  json(res, 404, { error: "rota desconhecida" });
}).listen(PORTA, () => console.log(`AbacatePay falsa em http://localhost:${PORTA}`));
