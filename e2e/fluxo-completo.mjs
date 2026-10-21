import { chromium } from "playwright";
const URL = process.env.BASE_URL ?? "http://localhost:3000";
const shots = process.env.SHOTS_DIR ?? "e2e/capturas";
const b = await chromium.launch();
const erros = [];
const log = (...a) => console.log(...a);
const ver = (p, tag) => {
  p.on("pageerror", (e) => erros.push(`${tag} pageerror: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && erros.push(`${tag} console: ${m.text().slice(0, 200)}`));
};

// ---------- 1. Cliente agenda pelo celular, sem login, "sem preferência" ----------
const mob = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
ver(mob, "publico");
await mob.goto(`${URL}/barbearia-exemplo`);
await mob.getByRole("button", { name: /^Corte, R\$/ }).click();
await mob.getByRole("button", { name: /Sem preferência/ }).click();
await mob.getByRole("listbox", { name: "Dias disponíveis" }).waitFor();
await mob.getByRole("option").nth(1).click();
const manha = mob.getByRole("listbox", { name: /Horários da/ }).first();
await manha.getByRole("option").first().waitFor();
await mob.screenshot({ path: `${shots}/v2-m-horarios.png`, fullPage: true });
await manha.getByRole("option").nth(2).click();
await mob.getByRole("button", { name: "Continuar" }).click();
await mob.getByLabel("Nome e sobrenome").fill("Rodrigo Teste Sem Login");
await mob.getByLabel("WhatsApp").fill("11944443333");
await mob.screenshot({ path: `${shots}/v2-m-dados.png`, fullPage: true });
await mob.getByRole("button", { name: "Confirmar agendamento" }).click();
await mob.getByText("Agendamento confirmado!").waitFor();
await mob.screenshot({ path: `${shots}/v2-m-confirmado.png`, fullPage: true });
const comprovante = (await mob.locator("dl").first().innerText()).replace(/\n+/g, " | ");
log("1. CONFIRMADO:", comprovante);
const gerenciar = await mob.getByRole("link", { name: "Gerenciar agendamento" }).getAttribute("href");
const ics = await mob.getByRole("link", { name: /Agenda do celular/ }).getAttribute("href");
const icsTxt = await (await mob.request.get(URL + ics)).text();
log("   .ics válido:", icsTxt.includes("BEGIN:VEVENT") && icsTxt.includes("DTSTART"));

// ---------- 2. Gerencia pelo link (sem login): remarca e cancela ----------
await mob.goto(URL + gerenciar);
await mob.getByRole("button", { name: "Remarcar" }).click();
await mob.locator("button.chip[aria-pressed]").nth(2).click();
await mob.locator(".grid-cols-4 button.chip").first().waitFor();
await mob.locator(".grid-cols-4 button.chip").nth(1).click();
await mob.getByRole("button", { name: "Confirmar novo horário" }).click();
await mob.getByText("Pronto! Seu horário foi remarcado.").waitFor();
log("2. REMARCADO:", (await mob.locator("dl").first().innerText()).replace(/\n+/g, " | "));
await mob.screenshot({ path: `${shots}/v2-m-gerenciar.png`, fullPage: true });
const linkErrado = await (await mob.request.get(`${URL}/api/public/barbearia-exemplo/agendamentos/${gerenciar.split("/")[3].split("?")[0]}?t=errado-errado-errado-errado`)).status();
log("   link com token errado → HTTP", linkErrado);

// ---------- 3. Painel ----------
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
ver(p, "painel");
await p.goto(`${URL}/painel/login`);
await p.fill("input[name=telefone]", "11900000001");
await p.fill("input[name=senha]", "agendou123");
await p.click("button:has-text('Entrar')");
await p.waitForURL(/\/painel$/);
await p.getByRole("heading", { name: /Olá/ }).waitFor();
await p.getByRole("button", { name: "Próximos 30 dias" }).count(); // só garante que a página renderizou
await p.screenshot({ path: `${shots}/v2-d-dashboard.png`, fullPage: true });
log("3. DASHBOARD KPIs:", (await p.getByRole("region", { name: "Indicadores" }).innerText()).replace(/\n+/g, " | ").slice(0, 300));
// filtros
await p.getByRole("button", { name: "7 dias" }).click();
await p.waitForURL(/periodo=7d/);
await p.getByLabel("Serviço", { exact: true }).selectOption({ label: "Corte" });
await p.waitForURL(/servico=/);
log("   filtro aplicado na URL:", p.url().split("?")[1]);
await p.getByRole("button", { name: "Ver tabela" }).click();
await p.getByRole("button", { name: "Ver gráfico" }).waitFor();

await p.goto(`${URL}/painel/agendamentos?periodo=proximos`);
await p.screenshot({ path: `${shots}/v2-d-agendamentos.png`, fullPage: true });
log("4. AGENDAMENTOS:", await p.getByRole("status").first().innerText());
const csv = await (await p.request.get(`${URL}/painel/exportar?periodo=proximos`)).text();
log("   CSV exportado: linhas =", csv.trim().split("\n").length, "| cabeçalho:", csv.split("\n")[0].slice(1, 60));

// importação CSV
await p.goto(`${URL}/painel/clientes/importar`);
await p.setInputFiles("input[type=file]", "e2e/dados/clientes-concorrente.csv");
await p.getByText(/linhas encontradas/).waitFor();
await p.screenshot({ path: `${shots}/v2-d-import-mapa.png`, fullPage: true });
const mapeado = await p.locator("select").evaluateAll((s) => s.map((x) => x.options[x.selectedIndex]?.text?.split("  ")[0]));
log("5. MAPEAMENTO SUGERIDO:", mapeado.join(" | "));
await p.getByPlaceholder("ex.: 11").fill("11");
await p.getByRole("button", { name: "Validar dados" }).click();
await p.getByText("Novos clientes").waitFor();
await p.getByRole("button", { name: /^Todas/ }).click();
await p.screenshot({ path: `${shots}/v2-d-import-revisao.png`, fullPage: true });
const cont = await p.locator(".grid-cols-2.md\\:grid-cols-4").first().innerText();
log("   REVISÃO:", cont.replace(/\n+/g, " | "));
await p.getByText("Completar campos vazios").click();
await p.getByRole("button", { name: /^Importar/ }).click();
await p.getByText("Importação concluída").waitFor();
log("   RESULTADO:", (await p.locator(".grid-cols-2.md\\:grid-cols-4").first().innerText()).replace(/\n+/g, " | "));
await p.screenshot({ path: `${shots}/v2-d-import-ok.png`, fullPage: true });

// importação XLSX
await p.getByRole("button", { name: "Importar outro arquivo" }).click();
await p.setInputFiles("input[type=file]", "e2e/dados/clientes-excel.xlsx");
await p.getByText(/linhas encontradas/).waitFor();
await p.getByPlaceholder("ex.: 11").fill("11");
await p.getByRole("button", { name: "Validar dados" }).click();
await p.getByText("Novos clientes").waitFor();
await p.getByRole("button", { name: /^Todas/ }).click();
log("6. XLSX:", (await p.locator("table").last().innerText()).replace(/\t/g, " ").replace(/\n+/g, " | ").slice(0, 400));
await p.getByRole("button", { name: /^Importar/ }).click();
await p.getByText("Importação concluída").waitFor();

// clientes + ficha
await p.goto(`${URL}/painel/clientes?seg=importados`);
await p.screenshot({ path: `${shots}/v2-d-clientes.png`, fullPage: true });
log("7. IMPORTADOS:", (await p.locator("tbody tr").allInnerTexts()).map((t) => t.split("\n")[0]).join(", "));
await p.getByRole("link", { name: "Marcos Vinícius Andrade" }).click();
await p.getByText("Informações extras").waitFor();
await p.screenshot({ path: `${shots}/v2-d-ficha.png`, fullPage: true });
log("   ficha extras:", (await p.locator("dl").last().innerText()).replace(/\n+/g, " | "));
await p.goto(`${URL}/painel/clientes?q=94444`);
await p.getByRole("link", { name: /Rodrigo/ }).first().click();
await p.getByLabel("E-mail").waitFor();
log("   Rodrigo (já existia): nome mantido =", await p.getByLabel("Nome").inputValue(), "| e-mail completado =", await p.getByLabel("E-mail").inputValue(), "| obs =", await p.getByLabel(/Observações/).inputValue());

for (const r of ["agenda", "servicos", "profissionais", "horarios", "bloqueios", "financeiro", "notificacoes", "configuracoes"]) {
  const resp = await p.goto(`${URL}/painel/${r}`);
  await p.screenshot({ path: `${shots}/v2-d-${r}.png`, fullPage: true });
  if (resp.status() !== 200) log("   !!", r, resp.status());
}
// painel no celular
const pm = await (await b.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
ver(pm, "painel-mobile");
await pm.goto(`${URL}/painel`);
await pm.screenshot({ path: `${shots}/v2-m-dashboard.png`, fullPage: true });
await pm.goto(`${URL}/painel/clientes/importar`);
await pm.screenshot({ path: `${shots}/v2-m-importar.png`, fullPage: true });

// cancelamento pelo link
await mob.goto(URL + gerenciar);
await mob.getByRole("button", { name: "Cancelar agendamento" }).click();
await mob.getByRole("button", { name: "Sim, cancelar" }).click();
await mob.getByText("Agendamento cancelado.").waitFor();
log("8. CANCELADO PELO LINK:", await mob.locator(".badge").first().innerText());

log("ERROS:", erros.length ? erros : "nenhum");
await b.close();
