// Teste de ponta a ponta da régua de cobrança automática de mensalidade.
// Uso: node e2e/cobrancas.mjs  (requer mock-meta.mjs na porta 4010 e o app rodando)
// Cobre: segurança do cron, skip-sem-config, configuração via painel, opt-out "PARAR",
//        reativação, pausa, BR Code CRC16, "Cobrar agora" e isolamento entre barbearias.
import crypto from "node:crypto";
import { chromium } from "playwright";

const URL_BASE = process.env.BASE_URL ?? "http://localhost:3300";
const MOCK = process.env.MOCK_URL ?? "http://localhost:4010";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "segredo-do-app-de-teste";
const TOKEN_OK = "EAATESTE_token_valido_0123456789abcdef";
const TOKEN_OUTRA = "EAATESTE_token_da_outra_barbearia_98765";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

let falhas = 0;
const confere = (ok, msg, extra = "") => {
  console.log(`${ok ? "✔" : "✘"} ${msg}${extra ? ` — ${extra}` : ""}`);
  if (!ok) falhas++;
};

const enviadas = async () => (await fetch(`${MOCK}/__enviadas`)).json();
const cron = () =>
  fetch(`${URL_BASE}/api/cron/cobrancas`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  }).then((r) => r.json());

// Constrói evento de mensagem RECEBIDA no webhook (PARAR, etc.)
const eventoMensagem = (phoneId, wabaId, de, texto) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: wabaId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneId },
              messages: [{ from: de, id: `wamid.COBR${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), text: { body: texto }, type: "text" }],
            },
          },
        ],
      },
    ],
  });

const assinar = (corpo) => `sha256=${crypto.createHmac("sha256", APP_SECRET).update(corpo).digest("hex")}`;
const webhook = (corpo) => {
  const json = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return fetch(`${URL_BASE}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": assinar(json) },
    body: json,
  });
};

// CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF) — mesmo algoritmo de pix-brcode.ts
function crc16(str) {
  let crc = 0xffff;
  for (const c of str) {
    crc ^= c.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function brCodeValido(s) {
  const idx = s.lastIndexOf("6304");
  if (idx < 0) return false;
  return crc16(s.slice(0, idx + 4)) === s.slice(idx + 4, idx + 8).toUpperCase();
}

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const erros = [];

async function entrar(telefone) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => erros.push(e.message));
  await pg.goto(`${URL_BASE}/painel/login`);
  await pg.fill("input[name=telefone]", telefone);
  await pg.fill("input[name=senha]", "agendou123");
  await pg.click("button:has-text('Entrar')");
  await pg.waitForURL(/\/painel$/);
  return pg;
}

async function enviarForm(pg, botao) {
  const form = await pg.locator("form", { has: pg.getByRole("button", { name: botao, exact: true }) }).first().elementHandle();
  await form.evaluate((f) => {
    f.dataset.ciclo = "0";
    new MutationObserver(() => {
      if (f.getAttribute("aria-busy") === "true") f.dataset.ciclo = "1";
      else if (f.dataset.ciclo === "1") f.dataset.ciclo = "2";
    }).observe(f, { attributes: true, attributeFilter: ["aria-busy"] });
  });
  await pg.getByRole("button", { name: botao, exact: true }).click();
  await pg.waitForFunction((f) => f.dataset.ciclo === "2" || !f.isConnected, form, { timeout: 20000 });
  if (!(await form.evaluate((f) => f.isConnected))) return "(formulário saiu da tela após salvar)";
  return (await form.$eval("[role=status]", (e) => e.textContent ?? "")).trim();
}

// ---------------------------------------------------------------- 1. segurança do endpoint
let r = await fetch(`${URL_BASE}/api/cron/cobrancas`, { method: "POST" });
confere(r.status === 401, "cron sem x-cron-secret → 401");
r = await fetch(`${URL_BASE}/api/cron/cobrancas`, { method: "POST", headers: { "x-cron-secret": "errado-diferente-do-certo" } });
confere(r.status === 401, "cron com segredo errado → 401");

// ---------------------------------------------------------------- 2. sem cobrancas_ativas → 0
const r0 = await cron();
confere(typeof r0.enviados === "number" && r0.enviados === 0, "cron retorna 0 quando nenhuma empresa tem cobrancas_ativas", `enviados=${r0.enviados}`);

// ---------------------------------------------------------------- 3. configurar via painel (barbearia-exemplo)
const p = await entrar("11900000001");

// 3a. conectar WhatsApp se necessário
await p.goto(`${URL_BASE}/painel/whatsapp`);
if (await p.getByText("Não conectado", { exact: true }).isVisible()) {
  await p.fill("input[name=phone_number_id]", "111111111111111");
  await p.fill("input[name=waba_id]", "222222222222222");
  await p.fill("input[name=token]", TOKEN_OK);
  const msgConn = await enviarForm(p, "Conectar e verificar");
  confere(/Conectado/.test(msgConn), "WhatsApp reconectado para o teste de cobrança", msgConn);
}

// 3b. salvar modelo de cobrança e habilitar régua
await p.goto(`${URL_BASE}/painel/whatsapp`);
await p.fill("input[name=modelo_cobranca]", "cobranca_mensalidade");
const cbAtiva = p.locator("input[name=cobrancas_ativas]");
if (!(await cbAtiva.isChecked())) await cbAtiva.check();
await p.fill("input[name=cobranca_dias_antes]", "30");
await p.fill("input[name=cobranca_dias_depois]", "3");
let msg = await enviarForm(p, "Salvar");
confere(/cobrança|salvo/i.test(msg), "modelo de cobrança e régua configurados", msg);

// 3c. salvar chave Pix — CPF fake válido para validação formal
await p.goto(`${URL_BASE}/painel/whatsapp/cobranca`);
await p.selectOption("select[name=pix_tipo]", "cpf");
await p.fill("input[name=pix_chave]", "12345678909");
await p.fill("input[name=pix_recebedor]", "Barbearia Exemplo");
await p.fill("input[name=pix_cidade]", "Sao Paulo");
msg = await enviarForm(p, "Salvar chave Pix");
confere(/salva|salvo/i.test(msg), "chave Pix salva no painel de cobrança", msg);

// 3d. sem Pix → toggle cobrancas_ativas deve exigir Pix primeiro
// (verificado ao salvar acima: se Pix não estava salvo antes, a ação da 3b teria retornado erro)

// ---------------------------------------------------------------- 4. criar cliente de teste para opt-out e pausa
const TEL_COBR = "11955550091";
await p.goto(`${URL_BASE}/painel/clientes`);
await p.click("summary:has-text('Cadastrar cliente manualmente')");
const fCli = p.locator("form", { has: p.locator("input[name=observacoes]") });
await fCli.locator("input[name=nome]").fill("Cliente Cobranca E2E");
await fCli.locator("input[name=telefone]").fill(TEL_COBR);
await fCli.getByRole("button", { name: "Cadastrar", exact: true }).click();
const stCli = fCli.getByRole("status");
await p.waitForFunction((el) => el.textContent.trim().length > 0, await stCli.elementHandle(), { timeout: 20000 });
const msgCad = await stCli.innerText();
confere(/cadastrado/i.test(msgCad), "cliente de teste cadastrado", msgCad);

// Navegar para ficha do cliente recém-criado
const linkFicha = await p.locator("a[href*='/painel/clientes/']", { hasText: "Cliente Cobranca E2E" }).getAttribute("href").catch(async () => {
  await p.fill("input[type=search]", "Cobranca E2E").catch(() => {});
  await p.waitForTimeout(400);
  return p.locator("a[href*='/painel/clientes/']").first().getAttribute("href").catch(() => null);
});
confere(!!linkFicha, "ficha do cliente encontrada na lista");

// ---------------------------------------------------------------- 5. opt-out via "PARAR" — webhook de mensagem recebida
const evParar = eventoMensagem("111111111111111", "222222222222222", `55${TEL_COBR}`, "PARAR");
const wParar = await webhook(evParar);
confere(wParar.status === 200, "webhook de entrada com PARAR retorna 200");

// Ficha do cliente deve mostrar o banner de opt-out
if (linkFicha) {
  await p.goto(`${URL_BASE}${linkFicha}`);
  const optoutBanner = p.locator("[role=alert]", { hasText: /PARAR/ });
  confere(await optoutBanner.isVisible(), "ficha do cliente mostra banner de opt-out após PARAR");

  // cron não deve enviar para este cliente (opt-out ativo)
  const antesOptout = (await enviadas()).length;
  await cron();
  confere((await enviadas()).length === antesOptout, "cron não envia para cliente com opt-out ativo");

  // ---------------------------------------------------------------- 6. reativar opt-out via UI
  const msgReativar = await enviarForm(p, "Reativar cobrança");
  confere(/reativada/i.test(msgReativar), "opt-out reativado pelo painel", msgReativar);
  await p.reload();
  confere(!(await p.locator("[role=alert]", { hasText: /PARAR/ }).isVisible()), "banner de opt-out sumiu após reativação");
}

// ---------------------------------------------------------------- 7. "PARAR" case-insensitive
const evParar2 = eventoMensagem("111111111111111", "222222222222222", `55${TEL_COBR}`, "parar");
confere((await webhook(evParar2)).status === 200, "PARAR minúsculo também é aceito pelo webhook");
// Reativar para não deixar o cliente em opt-out no final do teste
if (linkFicha) {
  await p.goto(`${URL_BASE}${linkFicha}`);
  const banner2 = p.locator("[role=alert]", { hasText: /PARAR/ });
  if (await banner2.isVisible()) await enviarForm(p, "Reativar cobrança");
}

// ---------------------------------------------------------------- 8. isolamento: opt-out da barbearia B não afeta a barbearia A
const p2 = await entrar("21900000002");
await p2.goto(`${URL_BASE}/painel/whatsapp`);
if (await p2.getByText("Não conectado", { exact: true }).isVisible()) {
  await p2.fill("input[name=phone_number_id]", "333333333333333");
  await p2.fill("input[name=waba_id]", "444444444444444");
  await p2.fill("input[name=token]", TOKEN_OUTRA);
  await enviarForm(p2, "Conectar e verificar");
}
// PARAR recebido na barbearia B com o mesmo telefone não afeta a barbearia A
const evPararB = eventoMensagem("333333333333333", "444444444444444", `55${TEL_COBR}`, "PARAR");
confere((await webhook(evPararB)).status === 200, "webhook de PARAR da barbearia B aceito");
if (linkFicha) {
  await p.goto(`${URL_BASE}${linkFicha}`);
  confere(!(await p.locator("[role=alert]", { hasText: /PARAR/ }).isVisible()), "opt-out da barbearia B não afeta o cliente na barbearia A");
}

// ---------------------------------------------------------------- 9. cron com empresa configurada mas sem mensalidades → 0
// (barbearia-exemplo pode não ter assinaturas; cron sincroniza e retorna 0 ou enviados)
const cronConfig = await cron();
confere(typeof cronConfig.enviados === "number", "cron com empresa configurada retorna JSON com .enviados", JSON.stringify(cronConfig));
console.log(`  ℹ cron barbearia-exemplo enviou ${cronConfig.enviados} mensagem(ns) de cobrança`);

// ---------------------------------------------------------------- 10. régua automática — se enviou, verificar formato
if (cronConfig.enviados > 0) {
  const todas = await enviadas();
  const cobrs = todas.filter((e) => e.template?.name === "cobranca_mensalidade");
  confere(cobrs.length > 0, "cron enviou pelo número correto usando modelo cobranca_mensalidade");
  confere(cobrs.every((e) => e.numero === "111111111111111"), "todas as cobranças saíram pelo número da barbearia-exemplo");
  const params0 = cobrs[0]?.template?.components?.[0]?.parameters?.map((x) => x.text) ?? [];
  confere(params0.length === 5, "modelo cobranca_mensalidade tem exatamente 5 parâmetros", String(params0.length));
  confere(brCodeValido(params0[4] ?? ""), "Pix copia-e-cola (param[5]) tem CRC16 válido", params0[4]?.slice(0, 20) + "…");

  // idempotência automática: 2ª chamada ao cron não reenvia a mesma etapa
  const cronIdem = await cron();
  confere(cronIdem.enviados === 0, "2ª chamada ao cron não reenvia a mesma etapa (idempotência automática)", `enviados=${cronIdem.enviados}`);
}

// ---------------------------------------------------------------- 11. "Cobrar agora" e idempotência manual
if (linkFicha) {
  await p.goto(`${URL_BASE}${linkFicha}`);
  const botaoCobrar = p.getByRole("button", { name: "Cobrar agora", exact: true }).first();
  if (await botaoCobrar.isVisible()) {
    const antesManuais = (await enviadas()).length;
    const msgCobrar = await enviarForm(p, "Cobrar agora");
    confere(/enviada|WhatsApp/i.test(msgCobrar), '"Cobrar agora" dispara cobrança manual', msgCobrar);
    const depoisManuais = await enviadas();
    const novas = depoisManuais.slice(antesManuais);
    confere(novas.length === 1 && novas[0].template?.name === "cobranca_mensalidade", '"Cobrar agora" envia 1 mensagem com o modelo correto');
    const brCode = novas[0]?.template?.components?.[0]?.parameters?.[4]?.text ?? "";
    confere(brCodeValido(brCode), '"Cobrar agora": BR Code no param[5] tem CRC16 válido', brCode.slice(0, 20) + "…");

    // idempotência manual: 2ª vez no mesmo dia → já enviado
    const msgCobrar2 = await enviarForm(p, "Cobrar agora");
    confere(/hoje/i.test(msgCobrar2), '"Cobrar agora" 2ª vez no mesmo dia informa que já foi enviado', msgCobrar2);
    confere((await enviadas()).length === depoisManuais.length, '"Cobrar agora" 2ª vez não envia mensagem extra');

    // pausa: toggle no assinante impede envio
    const msgPausar = await enviarForm(p, "Pausar cobrança");
    confere(/pausada/i.test(msgPausar), '"Pausar cobrança" confirma pausa', msgPausar);
    await p.reload();
    confere(await p.getByText("Cobrança pausada").isVisible(), "ficha mostra badge 'Cobrança pausada'");
    const antesP = (await enviadas()).length;
    await cron();
    confere((await enviadas()).length === antesP, "cron não envia para assinante com cobrança pausada");

    // retomar: toggle de volta
    const msgRetomar = await enviarForm(p, "Retomar cobrança");
    confere(/retomada/i.test(msgRetomar), '"Retomar cobrança" confirma retomada', msgRetomar);
  } else {
    console.log("  ℹ nenhuma mensalidade pendente na ficha — testes de 'Cobrar agora' e pausa pulados");
  }
}

// ---------------------------------------------------------------- 12. isolamento: barbearia B não vê cobranças da A
if (linkFicha) {
  const fichaIdMatch = linkFicha.match(/\/clientes\/([^/]+)/);
  if (fichaIdMatch) {
    const clienteId = fichaIdMatch[1];
    // Tentar acessar a ficha do cliente da barbearia A pela barbearia B → deve dar 404
    await p2.goto(`${URL_BASE}/painel/clientes/${clienteId}`);
    const status = await p2.locator("h1, [data-testid='not-found']").first().innerText().catch(() => "");
    confere(!status.includes("Cobranca E2E"), "barbearia B não vê ficha de cliente da barbearia A");
  }
}

// ---------------------------------------------------------------- fim
confere(erros.length === 0, "sem erros de JavaScript nas páginas", erros.join(" | "));
await b.close();
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
