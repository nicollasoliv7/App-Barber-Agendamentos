// Teste de ponta a ponta da integração com o WhatsApp, contra o mock da Meta (e2e/mock-meta.mjs).
// Veja e2e/README.md para subir o app com as variáveis de teste. Nenhuma mensagem real é enviada.
import crypto from "node:crypto";
import { chromium } from "playwright";

const URL = process.env.BASE_URL ?? "http://localhost:3300";
const MOCK = process.env.MOCK_URL ?? "http://localhost:4010";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "segredo-do-app-de-teste";
const VERIFY = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "verifica-webhook-teste";
const TOKEN_OK = "EAATESTE_token_valido_0123456789abcdef";
const TOKEN_OUTRA = "EAATESTE_token_da_outra_barbearia_98765";
const SLUG = "barbearia-exemplo";

let falhas = 0;
const confere = (ok, msg, extra = "") => {
  console.log(`${ok ? "✔" : "✘"} ${msg}${extra ? ` — ${extra}` : ""}`);
  if (!ok) falhas++;
};
const enviadas = async () => (await fetch(`${MOCK}/__enviadas`)).json();

/** Agenda pela API pública (como a página faz) e devolve a resposta. */
let usados = 0;
async function agendar(nome, telefone) {
  const pub = await (await fetch(`${URL}/api/public/${SLUG}`)).json();
  const corte = pub.servicos.find((s) => s.nome === "Corte");
  const { dias } = await (await fetch(`${URL}/api/public/${SLUG}/dias?servico=${corte.id}&profissional=qualquer`)).json();
  for (const dia of dias.slice(1)) {
    const h = await (await fetch(`${URL}/api/public/${SLUG}/horarios?servico=${corte.id}&profissional=qualquer&dia=${dia}`)).json();
    const lista = h.horarios ?? h.horas ?? [];
    if (lista.length <= usados) continue;
    const hora = lista[usados++];
    const r = await fetch(`${URL}/api/public/${SLUG}/agendamentos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ servico: corte.id, profissional: "qualquer", dia, hora, nome, telefone }),
    });
    return { status: r.status, ...(await r.json()) };
  }
  throw new Error("sem horário livre");
}

const assinar = (corpo, segredo = APP_SECRET) => `sha256=${crypto.createHmac("sha256", segredo).update(corpo).digest("hex")}`;
const evento = (phoneId, wamid, status) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "x", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneId }, statuses: [{ id: wamid, status, timestamp: "1" }] } }] }],
  });
const webhook = (corpo, assinatura) =>
  fetch(`${URL}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json", ...(assinatura ? { "x-hub-signature-256": assinatura } : {}) }, body: corpo });

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const erros = [];
async function entrar(telefone) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(`${URL}/painel/login`);
  await p.fill("input[name=telefone]", telefone);
  await p.fill("input[name=senha]", "agendou123");
  await p.click("button:has-text('Entrar')");
  await p.waitForURL(/\/painel$/);
  return p;
}
/** Clica no botão do formulário e devolve a mensagem de status (sucesso ou erro) que ele mostrar. */
async function enviarForm(p, botao) {
  const form = await p.locator("form", { has: p.getByRole("button", { name: botao, exact: true }) }).first().elementHandle();
  // espera o ciclo completo do envio (aria-busy true → false), para não ler a mensagem anterior
  await form.evaluate((f) => {
    f.dataset.ciclo = "0";
    new MutationObserver(() => {
      if (f.getAttribute("aria-busy") === "true") f.dataset.ciclo = "1";
      else if (f.dataset.ciclo === "1") f.dataset.ciclo = "2";
    }).observe(f, { attributes: true, attributeFilter: ["aria-busy"] });
  });
  await p.getByRole("button", { name: botao, exact: true }).click();
  await p.waitForFunction((f) => f.dataset.ciclo === "2" || !f.isConnected, form, { timeout: 20000 });
  if (!(await form.evaluate((f) => f.isConnected))) return "(formulário saiu da tela após salvar)";
  return (await form.$eval("[role=status]", (e) => e.textContent ?? "")).trim();
}

// ---------------------------------------------------------------- 1. sem integração
const a0 = await agendar("Cliente Sem Integração", "11955550001");
confere(a0.status === 201 && a0.agendamento.whatsapp === "nao_enviado", "sem conexão: agendamento criado e confirmação marcada como NÃO enviada", a0.agendamento?.whatsapp);
confere((await enviadas()).length === 0, "sem conexão: nada saiu para a Meta");

const pub = await b.newPage();
await pub.goto(`${URL}/${SLUG}`);
await pub.getByRole("button", { name: /^Corte, R\$/ }).click();
await pub.getByRole("button", { name: /Sem preferência/ }).click();
await pub.getByRole("option").nth(2).click();
await pub.getByRole("listbox", { name: /Horários da/ }).first().getByRole("option").last().click();
await pub.getByRole("button", { name: "Continuar" }).click();
await pub.getByLabel("Nome e sobrenome").fill("Cliente Pela Página");
await pub.getByLabel("WhatsApp").fill("11955550002");
await pub.getByRole("button", { name: "Confirmar agendamento" }).click();
await pub.getByText("Agendamento confirmado!").waitFor();
const aviso = pub.getByRole("link", { name: "Avisar a barbearia pelo WhatsApp" });
const hrefAviso = (await aviso.count()) ? await aviso.getAttribute("href") : "";
confere(hrefAviso.startsWith("https://wa.me/5511999990000?text="), "página pública: botão para avisar a barbearia com mensagem pronta", decodeURIComponent(hrefAviso.split("text=")[1] ?? ""));
confere(!(await pub.getByText("a caminho do seu WhatsApp").count()), "página pública: não diz que enviou");

const p = await entrar("11900000001");
await p.goto(`${URL}/painel/whatsapp`);
confere(await p.getByText("Não conectado", { exact: true }).isVisible(), "painel: status 'Não conectado'");
await p.goto(`${URL}/painel/notificacoes`);
confere((await p.getByText("Não enviada").count()) > 0 && (await p.getByRole("link", { name: "Enviar pelo meu WhatsApp" }).count()) > 0, "notificações: 'Não enviada' + botão de envio manual");
await p.goto(`${URL}/painel/agenda?dia=${a0.agendamento.inicio.slice(0, 10)}`);
const manual = await p.locator("a[href^='https://wa.me/'][title*='confirmação']").first().getAttribute("href").catch(() => null);
confere(!!manual && decodeURIComponent(manual).includes("está confirmado"), "agenda: botão WhatsApp com confirmação pronta");

// ---------------------------------------------------------------- 2. conectar
await p.goto(`${URL}/painel/whatsapp`);
await p.fill("input[name=phone_number_id]", "111111111111111");
await p.fill("input[name=waba_id]", "222222222222222");
await p.fill("input[name=token]", "EAATESTE_token_ERRADO_000000000000");
let msg = await enviarForm(p, "Conectar e verificar");
confere(/Token de acesso inválido/.test(msg), "token errado é recusado com o motivo da Meta", msg);
await p.fill("input[name=phone_number_id]", "111111111111111");
await p.fill("input[name=waba_id]", "444444444444444");
await p.fill("input[name=token]", TOKEN_OK);
msg = await enviarForm(p, "Conectar e verificar");
confere(/código 190|não pertence|inválido/i.test(msg), "número que não é da WABA informada é recusado", msg);
await p.fill("input[name=phone_number_id]", "111111111111111");
await p.fill("input[name=waba_id]", "222222222222222");
await p.fill("input[name=token]", TOKEN_OK);
msg = await enviarForm(p, "Conectar e verificar");
confere(/Conectado: \+55 11 90000-0001/.test(msg), "conexão verificada na Meta", msg);
await p.reload();
const html = await p.content();
confere(!html.includes(TOKEN_OK) && !html.includes("token_cifrado"), "o token não aparece no HTML do painel");
confere(await p.getByText("Conectado · falta o modelo").isVisible(), "status honesto: conectado, mas sem modelo aprovado");
const a1 = await agendar("Cliente Sem Modelo", "11955550003");
confere(a1.agendamento.whatsapp === "nao_enviado", "conectado sem modelo: confirmação não é enviada", a1.agendamento.whatsapp);

// ---------------------------------------------------------------- 3. modelos
await p.fill("input[name=modelo_confirmacao]", "modelo_em_analise");
msg = await enviarForm(p, "Salvar");
confere(/ainda não foi aprovado/.test(msg), "modelo pendente é recusado", msg);
await p.fill("input[name=modelo_confirmacao]", "confirmacao_agendamento");
await p.fill("input[name=modelo_lembrete]", "lembrete_agendamento");
await p.fill("input[name=modelo_codigo]", "codigo_verificacao");
await p.check("input[name=lembretes_ativos]");
msg = await enviarForm(p, "Salvar");
confere(/confirmação, lembrete, código/.test(msg), "modelos aprovados são salvos", msg);

// ---------------------------------------------------------------- 4. envio real (no mock) ao agendar
const a2 = await agendar("Joana Cliente Teste", "11955550004");
confere(a2.agendamento.whatsapp === "aceito", "agendamento → confirmação ACEITA pela Meta", a2.agendamento.whatsapp);
const env = (await enviadas()).at(-1);
confere(env?.numero === "111111111111111" && env.to === "5511955550004", "saiu pelo número DA barbearia para o cliente certo", `${env?.numero} → ${env?.to}`);
const params = env?.template?.components?.[0]?.parameters?.map((x) => x.text) ?? [];
confere(env?.template?.name === "confirmacao_agendamento" && env.template.language.code === "pt_BR" && params.length === 6, "modelo, idioma e 6 variáveis", params.join(" | "));
confere(params[0] === "Joana" && params[1] === "Barbearia Exemplo" && params[2] === "Corte" && params[5].includes("/agendamento/"), "variáveis na ordem documentada (nome, barbearia, serviço, …, link)");
const wamid = env.id;

// ---------------------------------------------------------------- 5. webhook
let r = await fetch(`${URL}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
confere(r.status === 200 && (await r.text()) === "12345", "webhook: verificação da Meta (GET) com token certo");
r = await fetch(`${URL}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=12345`);
confere(r.status === 403, "webhook: token de verificação errado → 403");
const ev = evento("111111111111111", wamid, "delivered");
confere((await webhook(ev)).status === 401, "webhook sem assinatura → 401");
confere((await webhook(ev, assinar(ev, "segredo-falso"))).status === 401, "webhook com assinatura falsa → 401");
confere((await webhook(ev, assinar(ev))).status === 200, "webhook assinado (delivered) → 200");
const evAtrasado = evento("111111111111111", wamid, "sent");
await webhook(evAtrasado, assinar(evAtrasado));
await p.goto(`${URL}/painel/notificacoes`);
const linhaConf = p.locator("li", { hasText: "Olá, Joana" }).first();
confere((await linhaConf.locator(".badge").innerText()) === "Entregue", "status 'Entregue' e não volta para 'Enviada' fora de ordem");
const evLido = evento("111111111111111", wamid, "read");
await webhook(evLido, assinar(evLido));
await p.reload();
confere((await p.locator("li", { hasText: "Olá, Joana" }).first().locator(".badge").innerText()) === "Lida", "status 'Lida' após o webhook read");

// ---------------------------------------------------------------- 6. isolamento entre barbearias
const p2 = await entrar("21900000002");
await p2.goto(`${URL}/painel/whatsapp`);
await p2.fill("input[name=phone_number_id]", "111111111111111");
await p2.fill("input[name=waba_id]", "222222222222222");
await p2.fill("input[name=token]", TOKEN_OK);
msg = await enviarForm(p2, "Conectar e verificar");
confere(/já está conectado a outra barbearia/.test(msg), "outra barbearia NÃO consegue usar o número já conectado", msg);
await p2.fill("input[name=phone_number_id]", "333333333333333");
await p2.fill("input[name=waba_id]", "444444444444444");
await p2.fill("input[name=token]", TOKEN_OUTRA);
msg = await enviarForm(p2, "Conectar e verificar");
confere(/Conectado/.test(msg), "outra barbearia conecta o próprio número", msg);
const evOutra = evento("333333333333333", wamid, "failed");
await webhook(evOutra, assinar(evOutra));
await p.reload();
confere((await p.locator("li", { hasText: "Olá, Joana" }).first().locator(".badge").innerText()) === "Lida", "evento vindo do número de OUTRA barbearia não altera mensagens desta");
await p2.goto(`${URL}/painel/notificacoes`);
confere(!(await p2.getByText("Joana").count()), "a outra barbearia não vê as notificações desta");

// ---------------------------------------------------------------- 7. teste, erro da Meta, código, lembrete
await p.goto(`${URL}/painel/whatsapp`);
await p.fill("input[name=telefone]", "11900009999");
msg = await enviarForm(p, "Enviar teste");
confere(/fora da lista de teste/.test(msg), "teste para número não autorizado mostra o motivo real", msg);
await p.fill("input[name=telefone]", "11955550005");
msg = await enviarForm(p, "Enviar teste");
confere(/aceitou a mensagem de teste/.test(msg), "teste para número válido é aceito", msg);

r = await fetch(`${URL}/api/public/${SLUG}/auth/codigo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ telefone: "11955550006" }) });
const cod = await r.json();
const envCod = (await enviadas()).at(-1);
confere(cod.enviado === true && envCod.template.name === "codigo_verificacao", "código de verificação enviado pelo modelo de autenticação");
const botao = envCod.template.components.find((c) => c.type === "button");
confere(botao?.parameters?.[0]?.text === envCod.template.components[0].parameters[0].text && /^\d{6}$/.test(botao.parameters[0].text), "código vai no corpo e no botão 'copiar código'");

const antes = (await enviadas()).length;
r = await fetch(`${URL}/api/cron/lembretes`, { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" } });
const lem = await r.json();
const depois = await enviadas();
confere(lem.enviados > 0 && depois.slice(antes).every((m) => m.template.name === "lembrete_agendamento" && m.numero === "111111111111111"), "lembretes automáticos só pelo número da barbearia", `${lem.enviados} lembrete(s)`);

// ---------------------------------------------------------------- 8. token revogado
await fetch(`${MOCK}/__revogar`);
const a3 = await agendar("Cliente Token Revogado", "11955550007");
confere(a3.agendamento.whatsapp === "falhou", "token revogado: confirmação marcada como FALHOU", a3.agendamento.whatsapp);
await p.goto(`${URL}/painel/whatsapp`);
confere(await p.getByText("Erro na conexão").isVisible(), "painel mostra 'Erro na conexão'");
const a4 = await agendar("Cliente Depois do Erro", "11955550008");
confere(a4.agendamento.whatsapp === "nao_enviado", "com a conexão em erro, não tenta enviar de novo", a4.agendamento.whatsapp);
await fetch(`${MOCK}/__revogar?v=0`);
msg = await enviarForm(p, "Testar conexão");
confere(/Conexão funcionando/.test(msg), "‘Testar conexão’ reativa depois que o token volta a valer", msg);

// ---------------------------------------------------------------- 9. desconectar
await p.reload();
await p.check("input[name=confirmo]");
msg = await enviarForm(p, "Desconectar");
await p.reload();
confere(await p.getByText("Não conectado", { exact: true }).isVisible(), "desconectar apaga a conexão e o painel volta a 'Não conectado'", msg);
const a5 = await agendar("Cliente Pós Desconexão", "11955550009");
confere(a5.agendamento.whatsapp === "nao_enviado", "depois de desconectar, nada é enviado", a5.agendamento.whatsapp);

confere(erros.length === 0, "sem erros de JavaScript nas páginas", erros.join(" | "));
await b.close();
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
