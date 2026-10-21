import { chromium } from "playwright";
const URL = process.env.BASE_URL ?? "http://localhost:3000";
const b = await chromium.launch();
const ctx0 = await b.newContext();
const p0 = await ctx0.newPage();
await p0.goto(`${URL}/painel/login`); await p0.fill("input[name=email]", "dono@agendou.dev"); await p0.fill("input[name=senha]", "agendou123");
await p0.click("button:has-text('Entrar')"); await p0.waitForURL(/\/painel$/);
const st = await ctx0.storageState();
const rotas = ["/", "/barbearia-exemplo", "/painel", "/painel/agenda", "/painel/agendamentos", "/painel/clientes", "/painel/clientes/importar", "/painel/servicos", "/painel/profissionais", "/painel/horarios", "/painel/bloqueios", "/painel/financeiro", "/painel/notificacoes", "/painel/configuracoes"];
for (const w of [1440, 1024, 390]) {
  const p = await (await b.newContext({ viewport: { width: w, height: 900 }, storageState: st })).newPage();
  for (const r of rotas) {
    await p.goto(URL + r, { waitUntil: "networkidle" });
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w + 1) console.log(`ESTOURO ${w}px ${r}: scrollWidth=${sw}`);
  }
}
console.log("fim");
await b.close();
