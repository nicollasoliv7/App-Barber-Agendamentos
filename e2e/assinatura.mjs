// Assinatura da plataforma + AbacatePay (mock) + limite de 15 clientes do plano Gratuito.
// Pré-requisitos (ver e2e/README.md): banco NOVO, e2e/mock-abacatepay.mjs rodando e o app com as variáveis ABACATEPAY_*.
import crypto from "node:crypto";
import { chromium } from "playwright";

const URL = process.env.BASE_URL ?? "http://localhost:3300";
const MOCK = process.env.MOCK_URL ?? "http://localhost:4020";
const SEGREDO = process.env.ABACATEPAY_WEBHOOK_SECRET ?? "segredo-webhook-teste";
let falhas = 0;
const confere = (ok, msg, extra = "") => {
  console.log(`${ok ? "✔" : "✘"} ${msg}${extra !== "" ? ` — ${extra}` : ""}`);
  if (!ok) falhas++;
};
const HMAC = process.env.MOCK_HMAC_KEY ?? "chave-publica-teste-abacate";
const assinar = (texto, chave = HMAC) => crypto.createHmac("sha256", chave).update(texto, "utf8").digest("base64");
/** POST de webhook como a AbacatePay manda: corpo bruto + X-Webhook-Signature. */
const webhook = (url, corpo, assinatura) => {
  const texto = JSON.stringify(corpo);
  const headers = { "content-type": "application/json" };
  if (assinatura !== null) headers["x-webhook-signature"] = assinatura ?? assinar(texto);
  return fetch(url, { method: "POST", headers, body: texto });
};
const post = (url, corpo) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
const checkouts = async () => (await fetch(`${MOCK}/__checkouts`)).json();

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1360, height: 950 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => erros.push(e.message));
const texto = async () => (await p.locator("main").innerText()).replace(/\s+/g, " ");

// ------------------------------------------------------------ cadastro self-service
const TEL = `319${String(Date.now()).slice(-8)}`;
await p.goto(`${URL}/cadastro?plano=anual`);
await p.fill("input[name=barbearia]", "Barbearia Teste Assinatura");
await p.fill("input[name=nome]", "Dono Teste");
await p.fill("input[name=telefone]", TEL);
await p.fill("input[name=senha]", "senha-teste-123");
await p.check("input[name=termos]");
await p.click("button:has-text('Criar conta grátis')");
await p.waitForURL(/\/painel\/assinatura\?plano=anual/);
let t = await texto();
confere(t.includes("Plano atual Gratuito"), "cadastro cria a barbearia no plano Gratuito");
confere(/0\s*de 15/.test(t), "contador de clientes 0 de 15");
confere(t.includes("Assinar: pagar R$ 599,90"), "botão do Anual com o valor cobrado");

// cadastro repetido com o mesmo celular
const p2 = await (await b.newContext()).newPage();
await p2.goto(`${URL}/cadastro`);
await p2.fill("input[name=barbearia]", "Outra Tentativa");
await p2.fill("input[name=nome]", "Fulano");
await p2.fill("input[name=telefone]", TEL);
await p2.fill("input[name=senha]", "senha-teste-123");
await p2.check("input[name=termos]");
await p2.click("button:has-text('Criar conta grátis')");
await p2.locator("p[role=alert]").waitFor();
confere((await p2.locator("p[role=alert]").innerText()).includes("já tem uma conta"), "celular já cadastrado é recusado");

// ------------------------------------------------------------ limite de 15 clientes
async function novoCliente(i) {
  await p.goto(`${URL}/painel/clientes`);
  await p.click("summary:has-text('Cadastrar cliente manualmente')");
  const form = p.locator("form", { has: p.locator("input[name=observacoes]") });
  await form.locator("input[name=nome]").fill(`Cliente Fictício ${i}`);
  await form.locator("input[name=telefone]").fill(`3198${String(i).padStart(7, "0")}`);
  await form.getByRole("button", { name: "Cadastrar", exact: true }).click();
  const st = form.getByRole("status");
  await p.waitForFunction((el) => el.textContent.trim().length > 0, await st.elementHandle(), { timeout: 20000 });
  return st.innerText();
}
let ultimo = "";
for (let i = 1; i <= 15; i++) ultimo = await novoCliente(i);
confere(ultimo.includes("Cliente cadastrado"), "15º cliente cadastrado no Gratuito");
const r16 = await novoCliente(16);
confere(r16.includes("limite foi atingido"), "16º cliente bloqueado no Gratuito", r16);
await p.goto(`${URL}/painel`);
confere((await p.locator("main").innerText()).includes("limite de 15 clientes atingido"), "aviso de limite no painel");

// ------------------------------------------------------------ webhook: segurança
const W = `${URL}/api/abacatepay/webhook`;
confere((await post(W, { event: "checkout.completed", data: {} })).status === 401, "webhook sem segredo → 401");
confere((await post(`${W}?webhookSecret=errado`, { event: "checkout.completed", data: {} })).status === 401, "webhook com segredo errado → 401");
const WS = `${W}?webhookSecret=${SEGREDO}`;
const evFantasma = { id: "log_fantasma_1", event: "checkout.completed", apiVersion: 2, devMode: true, data: { checkout: { id: "bill_inexistente" } } };
confere((await webhook(WS, evFantasma, null)).status === 401, "webhook sem X-Webhook-Signature → 401");
confere((await webhook(WS, evFantasma, assinar(JSON.stringify(evFantasma), "chave-errada"))).status === 401, "webhook com assinatura HMAC errada → 401");
const fantasma = await (await webhook(WS, evFantasma)).json();
confere(fantasma.encontrado === false, "evento de checkout desconhecido é ignorado");
const fantasma2 = await (await webhook(WS, evFantasma)).json();
confere(fantasma2.duplicado === true, "mesmo id de evento recebido de novo → tratado como duplicado");

// ------------------------------------------------------------ preço divergente na AbacatePay
await post(`${MOCK}/__produto`, { id: "prod_mensal", price: 1000 });
await p.goto(`${URL}/painel/assinatura`);
await p.click("button:has-text('Assinar: pagar R$ 59,90')");
await p.locator("p[role=alert]").waitFor();
const alerta = await p.locator("p[role=alert]").innerText();
confere(alerta.includes("não confere"), "produto com preço diferente não abre checkout", alerta);
await post(`${MOCK}/__produto`, { id: "prod_mensal", price: 5990 });

// ------------------------------------------------------------ pagamento do Anual
await p.goto(`${URL}/painel/assinatura`);
await p.click("button:has-text('Assinar: pagar R$ 599,90')");
await p.waitForURL(new RegExp(`^${MOCK}/pagar/`));
confere((await p.content()).includes("599.90"), "checkout aberto com o valor do Anual");
await p.click("button:has-text('Pagar')");
await p.waitForURL(/\/painel\/assinatura\?cobranca=/);
t = await texto();
const anoQueVem = new Date().getFullYear() + 1;
confere(t.includes("Pagamento confirmado") && t.includes("Plano atual Anual"), "plano Anual liberado após o pagamento");
const validade = t.match(/Válido até (\d{2}\/\d{2}\/\d{4})/)?.[1];
confere(validade?.endsWith(String(anoQueVem)), "período de 12 meses", validade);
confere(t.includes("sem limite"), "sem limite de clientes no plano pago");

// webhook repetido não soma período
const anual = (await checkouts()).find((c) => c.amount === 59990 && c.status === "PAID");
await post(`${MOCK}/__estado`, { id: anual.id, campos: {}, evento: "checkout.completed" });
await post(`${MOCK}/__estado`, { id: anual.id, campos: {}, evento: "checkout.completed", repetir: true }); // retentativa (mesmo id)
await p.goto(`${URL}/painel/assinatura`);
confere((await texto()).includes(`Válido até ${validade}`), "webhook repetido não estende o período (idempotente)");

const r17 = await novoCliente(16);
confere(r17.includes("Cliente cadastrado"), "16º cliente liberado no plano pago");

// evento "pago" forjado para um checkout NÃO pago
await p.goto(`${URL}/painel/assinatura`);
await p.click("button:has-text('Renovar: pagar R$ 59,90')");
await p.waitForURL(new RegExp(`^${MOCK}/pagar/`));
const pendente = (await checkouts()).find((c) => c.amount === 5990 && c.status === "PENDING");
await post(`${MOCK}/__estado`, { id: pendente.id, campos: {}, evento: "checkout.completed" });
await p.goto(`${URL}/painel/assinatura`);
t = await texto();
confere(t.includes(`Válido até ${validade}`) && t.includes("Aguardando pagamento"), "evento de pagamento sem pagamento real não libera nada");

// renovação antecipada emenda no fim do período
await p.goto(pendente.url);
await p.click("button:has-text('Pagar')");
await p.waitForURL(/\/painel\/assinatura\?cobranca=/);
t = await texto();
const nova = t.match(/Válido até (\d{2}\/\d{2}\/\d{4})/)?.[1];
const [, m1, a1] = validade.split("/").map(Number);
const [, m2, a2] = nova.split("/").map(Number);
confere((a2 * 12 + m2) - (a1 * 12 + m1) === 1, "renovar antes de vencer soma 1 mês ao fim do período", `${validade} → ${nova}`);

// estorno do Anual tira os 12 meses
await post(`${MOCK}/__estado`, { id: anual.id, campos: { status: "REFUNDED" }, evento: "checkout.refunded" });
await p.goto(`${URL}/painel/assinatura`);
t = await texto();
confere(t.includes("Estornado"), "estorno aparece no histórico");
const posEstorno = t.match(/Válido até (\d{2}\/\d{2}\/\d{4})/)?.[1];
confere(!!posEstorno && Number(posEstorno.split("/")[2]) === new Date().getFullYear() + (new Date().getMonth() === 11 ? 1 : 0), "estorno remove o período do Anual", posEstorno);

// ------------------------------------------------------------ isolamento e barbearia de demonstração
const demo = await (await b.newContext()).newPage();
await demo.goto(`${URL}/painel/login`);
await demo.fill("input[name=telefone]", "11900000001");
await demo.fill("input[name=senha]", "agendou123");
await demo.click("button:has-text('Entrar')");
await demo.waitForURL(/\/painel$/);
const cobrancaAlheia = new globalThis.URL(anual.completionUrl ?? (await checkouts())[0].completionUrl).searchParams.get("cobranca");
await demo.goto(`${URL}/painel/assinatura?cobranca=${cobrancaAlheia}`);
const td = (await demo.locator("main").innerText()).replace(/\s+/g, " ");
confere(td.includes("Cortesia") && !td.includes("Pagamento confirmado") && !td.includes("Estornado"), "outra barbearia não vê nem confere cobranças alheias");

confere(erros.length === 0, "sem erros de JavaScript nas páginas", erros.join(" | "));
await b.close();
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
process.exit(falhas ? 1 : 0);
