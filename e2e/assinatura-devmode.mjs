// Produção não aceita pagamento de teste: com ABACATEPAY_PERMITIR_DEVMODE desligada, um checkout
// pago em Dev Mode (o mock sempre responde devMode: true) NÃO libera o plano.
// Rodar com o app em `next start` SEM ABACATEPAY_PERMITIR_DEVMODE (ver e2e/README.md).
import { chromium } from "playwright";

const URL = process.env.BASE_URL ?? "http://localhost:3300";
const MOCK = process.env.MOCK_URL ?? "http://localhost:4020";
let falhas = 0;
const confere = (ok, msg, extra = "") => {
  console.log(`${ok ? "✔" : "✘"} ${msg}${extra !== "" ? ` — ${extra}` : ""}`);
  if (!ok) falhas++;
};

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await (await b.newContext()).newPage();
const texto = async () => (await p.locator("main").innerText()).replace(/\s+/g, " ");

await p.goto(`${URL}/cadastro?plano=mensal`);
await p.fill("input[name=barbearia]", "Barbearia Teste Dev Mode");
await p.fill("input[name=nome]", "Dono Teste");
await p.fill("input[name=telefone]", `319${String(Date.now()).slice(-8)}`);
await p.fill("input[name=senha]", "senha-teste-123");
await p.check("input[name=termos]");
await p.click("button:has-text('Criar conta grátis')");
await p.waitForURL(/\/painel\/assinatura/);
await p.click("button:has-text('Assinar: pagar R$ 59,90')");
await p.waitForURL(new RegExp(`^${MOCK}/pagar/`));
await p.click("button:has-text('Pagar')");
await p.waitForURL(/\/painel\/assinatura\?cobranca=/);
const t = await texto();
confere(t.includes("Plano atual Gratuito") && !t.includes("Pagamento confirmado"), "pagamento em Dev Mode não libera plano em produção");
confere(t.includes("Aguardando pagamento"), "cobrança continua pendente no histórico");
await b.close();
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
process.exit(falhas ? 1 : 0);
