// Cenários do módulo de planos mensais + núcleo (agenda, clientes, financeiro), contra um banco NOVO.
// Pré-requisito: e2e/outra-barbearia.mjs (2ª barbearia, para o teste de isolamento). Dados fictícios.
import { chromium } from "playwright";

const URL = process.env.BASE_URL ?? "http://localhost:3300";
const SLUG = "barbearia-exemplo";
let falhas = 0;
const confere = (ok, msg, extra = "") => {
  console.log(`${ok ? "✔" : "✘"} ${msg}${extra !== "" ? ` — ${extra}` : ""}`);
  if (!ok) falhas++;
};
const centavos = (txt) => {
  const m = String(txt).match(/R\$\s*([\d.]+,\d{2})/);
  return m ? Math.round(Number(m[1].replace(/\./g, "").replace(",", ".")) * 100) : NaN;
};

// ------------------------------------------------------------ helpers HTTP (página pública)
const pub = await (await fetch(`${URL}/api/public/${SLUG}`)).json();
const servico = (nome) => pub.servicos.find((s) => s.nome === nome);
const { dias } = await (await fetch(`${URL}/api/public/${SLUG}/dias?servico=${servico("Corte").id}&profissional=qualquer`)).json();
const DIA = dias[1]; // um dia futuro com horários
async function agendar(nome, telefone, servicoNome = "Corte", dia = DIA) {
  const s = servico(servicoNome);
  const h = await (await fetch(`${URL}/api/public/${SLUG}/horarios?servico=${s.id}&profissional=qualquer&dia=${dia}`)).json();
  const hora = (h.horarios ?? h.horas)[0];
  const r = await fetch(`${URL}/api/public/${SLUG}/agendamentos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ servico: s.id, profissional: "qualquer", dia, hora, nome, telefone }),
  });
  const j = await r.json();
  if (r.status !== 201) throw new Error(`agendar falhou: ${JSON.stringify(j)}`);
  return { ...j.agendamento, hora };
}

// ------------------------------------------------------------ helpers de tela
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const erros = [];
async function entrar(tel) {
  const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage();
  p.on("pageerror", (e) => erros.push(e.message));
  await p.goto(`${URL}/painel/login`);
  await p.fill("input[name=telefone]", tel);
  await p.fill("input[name=senha]", "agendou123");
  await p.click("button:has-text('Entrar')");
  await p.waitForURL(/\/painel$/);
  return p;
}
async function enviarForm(p, form, botao) {
  const h = await form.elementHandle();
  await h.evaluate((f) => {
    f.dataset.ciclo = "0";
    new MutationObserver(() => {
      if (f.getAttribute("aria-busy") === "true") f.dataset.ciclo = "1";
      else if (f.dataset.ciclo === "1") f.dataset.ciclo = "2";
    }).observe(f, { attributes: true, attributeFilter: ["aria-busy"] });
  });
  await form.getByRole("button", { name: botao, exact: true }).click();
  await p.waitForFunction((f) => f.dataset.ciclo === "2" || !f.isConnected, h, { timeout: 20000 });
  if (!(await h.evaluate((f) => f.isConnected))) return "(formulário saiu da tela)";
  return (await h.$eval("[role=status]", (e) => e.textContent ?? "")).trim();
}
/** Clica num botão (form simples, sem estado) dentro do card do agendamento na agenda. */
async function acaoNaAgenda(p, cliente, botao) {
  await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
  const li = p.locator("li", { hasText: cliente }).first();
  await li.getByRole("button", { name: botao, exact: true }).click();
  await p.waitForLoadState("networkidle");
}
const cardAgenda = async (p, cliente) => {
  await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
  return (await p.locator("li", { hasText: cliente }).first().innerText()).replace(/\n+/g, " | ");
};
async function kpiFinanceiro(p, rotulo) {
  await p.goto(`${URL}/painel/financeiro?de=${new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)}&ate=${dias.at(-1)}`);
  const t = await p.locator(".card", { has: p.locator(`div.text-xs:text-is("${rotulo}")`) }).first().innerText();
  return centavos(t);
}
async function abrirFicha(p, telefone) {
  await p.goto(`${URL}/painel/clientes?q=${telefone}`);
  await p.locator("tbody a").first().click();
  await p.waitForURL(/\/painel\/clientes\/[0-9a-f-]{36}$/);
  return p.url().split("/").pop();
}

const p = await entrar("11900000001");

// ============================================================ 1. só atendimentos por corte (sem planos)
await p.goto(`${URL}/painel/planos`);
confere(await p.getByText("Quer começar a vender planos?").isVisible(), "1. sem planos: página de Planos mostra só a orientação inicial");
await p.goto(`${URL}/painel`);
confere(!(await p.getByRole("heading", { name: "Planos mensais" }).count()), "1. sem planos: dashboard não mostra nada de planos");
confere(await p.getByText("A receber").first().isVisible() && (await p.getByText("Clientes recorrentes").isVisible()), "1. dashboard tem 'A receber' e 'Clientes recorrentes'");
await p.goto(`${URL}/painel/clientes`);
confere(!(await p.getByRole("link", { name: "Com plano" }).count()), "1. sem planos: CRM não mostra o filtro 'Com plano'");
const recebido0 = await kpiFinanceiro(p, "Recebido");
const avulso = await agendar("Paulo Avulso Teste", "11966660001");
confere(avulso.valor_a_pagar === 4000, "1. atendimento avulso cobra o preço cheio", avulso.valor_a_pagar);
await acaoNaAgenda(p, "Paulo Avulso Teste", "Concluir");
await acaoNaAgenda(p, "Paulo Avulso Teste", "Recebi no local");
confere(!(await p.locator("li", { hasText: "Paulo Avulso Teste" }).first().getByRole("button", { name: "Recebi no local" }).count()), "1. depois de receber, o botão some (não cobra duas vezes)");
const recebido1 = await kpiFinanceiro(p, "Recebido");
confere(recebido1 - recebido0 === 4000, "1. financeiro: 'Recebido' subiu exatamente R$ 40,00", `${recebido0} → ${recebido1}`);

// editar agendamento pelo painel (gap do núcleo)
await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
await agendar("Rita Edita Teste", "11966660009");
const { profissionais } = await (await fetch(`${URL}/api/public/${SLUG}/profissionais?servico=${servico("Corte").id}`)).json();
const prof = profissionais.at(-1);
const livres = await (await fetch(`${URL}/api/public/${SLUG}/horarios?servico=${servico("Corte").id}&profissional=${prof.id}&dia=${DIA}`)).json();
const novaHora = (livres.horarios ?? livres.horas).at(-1);
await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
const liEd = p.locator("li", { hasText: "Rita Edita Teste" }).first();
await liEd.locator("summary", { hasText: "Editar" }).click();
await liEd.locator("input[name=hora]").fill(novaHora);
await liEd.locator("select[name=profissional]").selectOption(prof.id);
const msgEd = await enviarForm(p, liEd.locator("form", { has: p.locator("input[name=hora]") }), "Salvar alterações");
await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
const cardRita = await p.locator("li", { hasText: "Rita Edita Teste" }).first().innerText();
confere(cardRita.includes(novaHora), "núcleo: editar agendamento pelo painel (nova hora e profissional)", `${msgEd} → ${novaHora} com ${prof.nome}`);
const conflito = await p.locator("li", { hasText: "Rita Edita Teste" }).first();
await conflito.locator("summary", { hasText: "Editar" }).click();
await conflito.locator("input[name=hora]").fill("03:00");
const msgConf = await enviarForm(p, conflito.locator("form", { has: p.locator("input[name=hora]") }), "Salvar alterações");
confere(/indisponível/.test(msgConf), "núcleo: edição fora do expediente é recusada", msgConf);

// ============================================================ 2. clientes e histórico
await p.goto(`${URL}/painel/clientes`);
await p.locator("summary", { hasText: "Cadastrar cliente manualmente" }).click();
await p.locator("form", { has: p.locator("input[name=telefone]") }).last().locator("input[name=nome]").fill("Carlos Assinante Teste");
await p.locator("form", { has: p.locator("input[name=telefone]") }).last().locator("input[name=telefone]").fill("11966660002");
let msg = await enviarForm(p, p.locator("form", { has: p.locator("input[name=telefone]") }).last(), "Cadastrar");
confere(/./.test(msg), "2. cliente cadastrado pelo painel", msg);
const idCarlos = await abrirFicha(p, "11966660002");
confere(!(await p.getByRole("heading", { name: "Plano mensal" }).count()), "2. ficha do cliente sem bloco de plano quando a barbearia não tem planos");
await abrirFicha(p, "11966660001");
confere(await p.getByText("Paulo Avulso Teste").first().isVisible() && (await p.locator("tbody tr").count()) >= 1, "2. histórico do cliente lista o atendimento");

// ============================================================ 3. criar plano e associar cliente
await p.goto(`${URL}/painel/planos`);
const fp = p.locator("form", { has: p.locator("input[name=nome]") }).first();
await fp.locator("input[name=nome]").fill("Clube do Corte Teste");
await fp.locator("input[name=preco]").fill("99,90");
const idCorte = servico("Corte").id;
const idBarba = servico("Barba").id;
await fp.locator(`input[name=servico][value="${idCorte}"]`).check();
await fp.locator(`input[name=limite_${idCorte}]`).fill("2");
await fp.locator(`input[name=servico][value="${idBarba}"]`).check();
await fp.locator(`input[name=adicional_${idBarba}]`).fill("10,00");
msg = await enviarForm(p, fp, "Criar plano");
await p.goto(`${URL}/painel/planos`);
confere(await p.getByRole("heading", { name: "Clube do Corte Teste" }).isVisible(), "3. plano criado (Corte 2×/mês 100%; Barba ilimitada com R$ 10 adicional)", msg);

await p.goto(`${URL}/painel/clientes/${idCarlos}`);
const fa = p.locator("form", { has: p.locator("select[name=plano_id]") });
msg = await enviarForm(p, fa, "Ativar plano");
await p.reload();
const blocoPlano = await p.locator("section", { has: p.getByRole("heading", { name: "Plano mensal" }) }).innerText();
confere(blocoPlano.includes("Clube do Corte Teste") && !blocoPlano.includes("paga ("), "3. plano associado sem pagamento → 'aguardando 1º pagamento' (nenhum pagamento criado)", msg);
await p.reload();
confere(await p.getByText("Aguardando 1º pagamento").isVisible(), "3. ficha mostra a situação da assinatura");
const naoCoberto = await agendar("Carlos Assinante Teste", "11966660002");
confere(naoCoberto.valor_a_pagar === 4000, "3. plano ainda não pago NÃO cobre atendimento", naoCoberto.valor_a_pagar);
const recPlanos0 = await kpiFinanceiro(p, "Recebido");
await p.goto(`${URL}/painel/clientes/${idCarlos}`);
msg = await enviarForm(p, p.locator("form", { has: p.locator("input[name=cobranca_id]") }).first(), "Registrar pagamento");
await p.reload();
confere(/paga \(Pix\)/.test(await p.locator("section", { has: p.getByRole("heading", { name: "Plano mensal" }) }).innerText()), "3. mensalidade registrada (Pix)", msg);
await p.reload();
confere(await p.getByText("Ativa", { exact: true }).isVisible(), "3. assinatura ficou ativa");
const recPlanos1 = await kpiFinanceiro(p, "Recebido");
confere(recPlanos1 - recPlanos0 === 9990, "8. financeiro: mensalidade entra em 'Recebido' uma vez (R$ 99,90)", `${recPlanos0} → ${recPlanos1}`);
await p.goto(`${URL}/painel/clientes/${idCarlos}`);
const outraVez = p.locator("form", { has: p.locator("input[name=cobranca_id]") });
confere(!(await outraVez.getByRole("button", { name: "Registrar pagamento" }).count()), "8. a mesma mensalidade não pode ser registrada duas vezes");

// o atendimento agendado antes do pagamento pode passar a usar o plano pelo botão "Usar plano"
await acaoNaAgenda(p, "Carlos Assinante Teste", "Usar plano");
confere(/coberto, sem cobrança/.test(await cardAgenda(p, "Carlos Assinante Teste")), "4. 'Usar plano' registra o benefício no atendimento já marcado");

// ============================================================ 4–5. assinante agenda serviço coberto
// Pix obrigatório não cobra quem tem o serviço coberto
await p.goto(`${URL}/painel/configuracoes`);
const fr = p.locator("form", { has: p.locator("select[name=pagamento_modo]") });
await fr.locator("select[name=pagamento_modo]").selectOption("obrigatorio");
await enviarForm(p, fr, "Salvar");
const coberto = await agendar("Carlos Assinante Teste", "11966660002");
confere(coberto.valor_a_pagar === 0 && coberto.status === "confirmado", "4. assinante agenda Corte (com Pix obrigatório ligado) → incluído no plano, confirmado sem cobrar", `${coberto.status} / ${coberto.valor_a_pagar}`);
const ana = await agendar("Ana Sem Plano Teste", "11966660003");
confere(ana.status === "pendente_pagamento", "regressão: Pix obrigatório continua valendo para quem não tem plano", ana.status);
await p.goto(`${URL}/painel/configuracoes`);
await fr.locator("select[name=pagamento_modo]").selectOption("desativado");
await enviarForm(p, fr, "Salvar");

await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
const cards = p.locator("li", { hasText: "Carlos Assinante Teste" });
confere((await cards.count()) === 2, "4. os atendimentos continuam na agenda");
const recAntes = await kpiFinanceiro(p, "Recebido");
const realizadoAntes = await kpiFinanceiro(p, "Realizado em atendimentos");
for (let i = 0; i < 2; i++) {
  await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
  await p.locator("li", { hasText: "Carlos Assinante Teste" }).filter({ has: p.getByRole("button", { name: "Concluir" }) }).first().getByRole("button", { name: "Concluir" }).click();
  await p.waitForLoadState("networkidle");
}
await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
confere(!(await p.locator("li", { hasText: "Carlos Assinante Teste" }).getByRole("button", { name: "Recebi no local" }).count()), "5. atendimento coberto não oferece cobrança ('Recebi no local' some)");
confere((await kpiFinanceiro(p, "Recebido")) === recAntes, "5. concluir atendimento coberto NÃO gera pagamento");
confere((await kpiFinanceiro(p, "Realizado em atendimentos")) === realizadoAntes, "5. atendimento coberto não é contado de novo como faturamento");
await p.goto(`${URL}/painel/clientes/${idCarlos}`);
confere(/Corte\s*2 de 2/.test(await p.locator("section", { hasText: "Uso no ciclo" }).innerText()), "5. uso contabilizado: Corte 2 de 2 no ciclo");
confere((await p.getByText("coberto pelo plano").count()) >= 2, "5. histórico do cliente marca os atendimentos cobertos");

const excedente = await agendar("Carlos Assinante Teste", "11966660002");
confere(excedente.valor_a_pagar === 4000, "5. 3º corte no ciclo passa do limite → cobrado normalmente", excedente.valor_a_pagar);
await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
confere((await p.getByText(/Plano: limite do ciclo atingido/).count()) > 0, "5. agenda informa o limite atingido");

// ============================================================ 6. serviço não coberto / adicional
const sobr = await agendar("Carlos Assinante Teste", "11966660002", "Sobrancelha");
confere(sobr.valor_a_pagar === 1000, "6. serviço fora do plano (Sobrancelha) cobra o preço cheio", sobr.valor_a_pagar);
const barba = await agendar("Carlos Assinante Teste", "11966660002", "Barba");
confere(barba.valor_a_pagar === 1000, "6. Barba com adicional: plano cobre R$ 20, cliente paga R$ 10", barba.valor_a_pagar);
const r0 = await kpiFinanceiro(p, "Recebido");
await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
const liBarba = p.locator("li", { hasText: "Carlos Assinante Teste" }).filter({ hasText: "cliente paga R$ 10,00" }).first();
await liBarba.getByRole("button", { name: "Concluir" }).click();
await p.waitForLoadState("networkidle");
await p.goto(`${URL}/painel/agenda?dia=${DIA}`);
await p.locator("li", { hasText: "Carlos Assinante Teste" }).filter({ hasText: "cliente paga R$ 10,00" }).first().getByRole("button", { name: "Recebi no local" }).click();
await p.waitForLoadState("networkidle");
confere((await kpiFinanceiro(p, "Recebido")) - r0 === 1000, "6. 'Recebi no local' registra só o adicional (R$ 10,00)");

// ============================================================ 7. pendente, inadimplente, cancelada
await p.goto(`${URL}/painel/planos`);
const fAdd = p.locator("form", { has: p.locator("input[name=cliente]") });
await fAdd.locator("input[name=cliente]").fill("11966660001");
await fAdd.locator("input[name=inicio]").fill(new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10));
msg = await enviarForm(p, fAdd, "Ativar plano");
await p.goto(`${URL}/painel/planos?st=inadimplente`);
confere(await p.getByRole("link", { name: "Paulo Avulso Teste" }).isVisible(), "7. assinatura com mensalidade vencida há 5+ dias fica 'Mensalidade atrasada'", msg);
const atrasado = await agendar("Paulo Avulso Teste", "11966660001");
confere(atrasado.valor_a_pagar === 4000, "7. plano atrasado não cobre atendimento");
await p.goto(`${URL}/painel/planos?st=pendente`);
confere(!(await p.getByRole("link", { name: "Carlos Assinante Teste" }).count()), "7. filtro por situação funciona");

// cancelar: atendimento FUTURO perde a cobertura; os concluídos não mudam
const futuro = await agendar("Carlos Assinante Teste", "11966660002", "Barba", dias[2]);
confere(futuro.valor_a_pagar === 1000, "7. (antes de cancelar) atendimento futuro coberto parcialmente");
await p.goto(`${URL}/painel/clientes/${idCarlos}`);
await p.locator("summary", { hasText: "Cancelar assinatura" }).click();
const fc = p.locator("form", { has: p.locator("input[name=assinatura_id]") });
await fc.locator("input[name=confirmo]").check();
msg = await enviarForm(p, fc, "Cancelar assinatura");
await p.reload();
confere(await p.getByText("Planos anteriores").isVisible(), "7. assinatura cancelada vai para 'planos anteriores'", msg);
confere((await p.getByText("coberto pelo plano").count()) >= 2, "7. atendimentos já feitos continuam marcados como cobertos (histórico preservado)");
await p.goto(`${URL}/painel/agenda?dia=${dias[2]}`);
confere(!/Plano/.test(await p.locator("li", { hasText: "Carlos Assinante Teste" }).first().innerText()), "7. atendimento futuro deixa de ser coberto após o cancelamento");
confere((await kpiFinanceiro(p, "Recebido")) - r0 === 1000, "7. cancelar não estorna nem cria pagamentos");

// edição do plano não muda assinaturas existentes
await p.goto(`${URL}/painel/planos`);
await p.locator("summary", { hasText: "Editar plano" }).first().click();
const fe = p.locator("form", { has: p.locator("input[name=id]") }).first();
await fe.locator("input[name=preco]").fill("129,90");
msg = await enviarForm(p, fe, "Salvar plano");
await p.goto(`${URL}/painel/planos?st=inadimplente`);
confere(/R\$\s*99,90/.test(await p.locator("tr", { hasText: "Paulo Avulso Teste" }).innerText()), "7. mudar o preço do plano não altera a assinatura existente", msg);

// ============================================================ 8. indicadores
await p.goto(`${URL}/painel`);
const painelPlanos = await p.locator("section", { has: p.getByRole("heading", { name: "Planos mensais" }) }).innerText();
confere(/Assinaturas ativas\s*0/.test(painelPlanos) && /Mensalidades em aberto\s*R\$\s*99,90 \(1\)/.test(painelPlanos), "8. dashboard de planos com dados reais (0 ativas, 1 mensalidade em aberto)", painelPlanos.replace(/\n+/g, " | "));

// ============================================================ 9. isolamento entre barbearias
const p2 = await entrar("21900000002");
await p2.goto(`${URL}/painel/planos`);
confere(await p2.getByText("Quer começar a vender planos?").isVisible(), "9. outra barbearia não vê os planos desta");
const r404 = await p2.goto(`${URL}/painel/clientes/${idCarlos}`);
confere(r404.status() === 404, "9. outra barbearia não abre a ficha de cliente desta (404)");
await p2.goto(`${URL}/painel/planos`);
const fp2 = p2.locator("form", { has: p2.locator("input[name=nome]") }).first();
await fp2.locator("input[name=nome]").fill("Plano da Outra");
await fp2.locator("input[name=preco]").fill("50");
await fp2.locator("input[name=beneficios]").fill("Benefício fictício");
await enviarForm(p2, fp2, "Criar plano");
await p2.goto(`${URL}/painel/planos`);
const fAdd2 = p2.locator("form", { has: p2.locator("input[name=cliente]") });
await fAdd2.locator("input[name=cliente]").fill("11966660002");
msg = await enviarForm(p2, fAdd2, "Ativar plano");
confere(/Cliente não encontrado/.test(msg), "9. não dá para colocar cliente de outra barbearia no plano", msg);
await p.goto(`${URL}/painel/planos`);
confere(!(await p.getByText("Plano da Outra").count()), "9. plano da outra barbearia não aparece aqui");

confere(erros.length === 0, "sem erros de JavaScript", erros.join(" | "));
await b.close();
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
