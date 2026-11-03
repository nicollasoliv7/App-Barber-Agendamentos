/**
 * Diagnóstico de overflow horizontal em mobile
 * Uso: BASE_URL=http://localhost:3000 npx tsx mobile-audit.ts
 */
import { chromium, Browser, Page, BrowserContext } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PHONE = process.env.PAINEL_PHONE ?? "(11) 90000-0001";
const SENHA = process.env.PAINEL_SENHA ?? "agendou123";

const WIDTHS = [360, 375, 390, 430];

const ROTAS = [
  { url: "/painel/login", nome: "Login" },
  { url: "/cadastro", nome: "Cadastro" },
  { url: "/painel", nome: "Visão Geral" },
  { url: "/painel/agenda", nome: "Agenda" },
  { url: "/painel/agendamentos", nome: "Agendamentos" },
  { url: "/painel/clientes", nome: "Clientes" },
  { url: "/painel/clientes/importar", nome: "Importar Clientes" },
  { url: "/painel/servicos", nome: "Serviços" },
  { url: "/painel/profissionais", nome: "Profissionais" },
  { url: "/painel/horarios", nome: "Horários" },
  { url: "/painel/bloqueios", nome: "Bloqueios" },
  { url: "/painel/financeiro", nome: "Financeiro" },
  { url: "/painel/planos", nome: "Planos" },
  { url: "/painel/whatsapp", nome: "WhatsApp" },
  { url: "/painel/notificacoes", nome: "Notificações" },
  { url: "/painel/configuracoes", nome: "Configurações" },
  { url: "/painel/assinatura", nome: "Assinatura" },
  { url: "/barbearia-do-nk", nome: "Página Pública" },
] as const;

// ------------------------------------------------
// Medição de overflow e elementos culpados
// ------------------------------------------------
async function medirOverflow(page: Page): Promise<{
  scrollWidth: number;
  innerWidth: number;
  overflow: boolean;
  elementos: string[];
}> {
  return page.evaluate(() => {
    const inner = window.innerWidth;
    const scroll = document.documentElement.scrollWidth;

    // Coleta elementos que ultrapassam o viewport
    const culpados: string[] = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      // Elemento cujo edge direito ultrapassa o viewport OU cujo left é negativo
      if (r.right > inner + 2 || r.left < -2) {
        const tag = el.tagName.toLowerCase();
        const cls = (el.className ?? "").toString().slice(0, 80);
        const id = el.id ? `#${el.id}` : "";
        const texto = (el.textContent ?? "").trim().slice(0, 40);
        culpados.push(`${tag}${id}[${cls}] right=${Math.round(r.right)} left=${Math.round(r.left)} "${texto}"`);
      }
    });

    return {
      scrollWidth: scroll,
      innerWidth: inner,
      overflow: scroll > inner + 2,
      elementos: culpados.slice(0, 10), // top 10 ofensores
    };
  });
}

// ------------------------------------------------
// Login no painel
// ------------------------------------------------
async function fazerLogin(page: Page, width: number) {
  await page.setViewportSize({ width, height: 812 });
  await page.goto(`${BASE_URL}/painel/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="telefone"]').fill(PHONE);
  await page.locator('input[name="senha"]').fill(SENHA);
  await page.locator('button[type="submit"], button.btn-key').click();
  await page.waitForURL(/\/painel($|\?)/, { timeout: 15_000 });
}

// ------------------------------------------------
// Busca ID do primeiro cliente para testar ficha
// ------------------------------------------------
async function buscarIdCliente(page: Page): Promise<string | null> {
  try {
    await page.goto(`${BASE_URL}/painel/clientes`, { waitUntil: "networkidle" });
    const href = await page.locator('table.tabela tbody tr:first-child td:first-child a').getAttribute("href");
    if (href) {
      const m = href.match(/\/painel\/clientes\/([^/?]+)/);
      if (m) return m[1];
    }
  } catch { /* sem clientes */ }
  return null;
}

// ------------------------------------------------
// Busca link de gerenciar agendamento
// ------------------------------------------------
async function buscarLinkGerenciar(page: Page): Promise<string | null> {
  try {
    await page.goto(`${BASE_URL}/painel/agendamentos`, { waitUntil: "networkidle" });
    const href = await page
      .locator('table.tabela tbody tr:first-child a[href*="/agendamento/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (href) return href;
    // Alternativa: buscar na agenda
    await page.goto(`${BASE_URL}/painel/agenda`, { waitUntil: "networkidle" });
    const link = await page.locator('a[href*="/agendamento/"]').first().getAttribute("href").catch(() => null);
    return link ?? null;
  } catch { return null; }
}

// ------------------------------------------------
// Garante o screenshot dir existe
// ------------------------------------------------
const SHOTS_DIR = path.join(path.dirname(require.resolve("../package.json")), "e2e", "screenshots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

// ------------------------------------------------
// Main
// ------------------------------------------------
interface ResultadoTela {
  rota: string;
  nome: string;
  resultados: {
    width: number;
    scrollWidth: number;
    overflow: boolean;
    elementos: string[];
  }[];
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Um contexto por largura para manter cookies de sessão separados
  const contextos: Record<number, BrowserContext> = {};
  const paginas: Record<number, Page> = {};

  // Login em cada largura
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 812 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const pg = await ctx.newPage();
    console.log(`[${w}px] Fazendo login...`);
    await fazerLogin(pg, w);
    contextos[w] = ctx;
    paginas[w] = pg;
  }

  // Buscar rotas dinâmicas (ficha cliente e gerenciar agendamento) na largura 390
  const pg390 = paginas[390];
  const clienteId = await buscarIdCliente(pg390);
  const gerenciarLink = await buscarLinkGerenciar(pg390);

  // Montar lista final de rotas
  const rotasFinal: Array<{ url: string; nome: string }> = [...ROTAS];
  if (clienteId) rotasFinal.splice(7, 0, { url: `/painel/clientes/${clienteId}`, nome: "Ficha Cliente" });
  if (gerenciarLink) rotasFinal.push({ url: gerenciarLink, nome: "Gerenciar Agendamento" });

  const resultados: ResultadoTela[] = [];

  for (const rota of rotasFinal) {
    const r: ResultadoTela = { rota: rota.url, nome: rota.nome, resultados: [] };

    // Para rotas que NÃO precisam de login, criar contexto limpo
    const publicRoutes = ["/cadastro", "/barbearia-do-nk"];
    const isPublic = publicRoutes.some((p) => rota.url.startsWith(p)) || rota.url.includes("/agendamento/");

    for (const w of WIDTHS) {
      let pg: Page;
      if (isPublic) {
        pg = await (await browser.newContext({ viewport: { width: w, height: 812 } })).newPage();
      } else {
        pg = paginas[w];
        await pg.setViewportSize({ width: w, height: 812 });
      }

      try {
        await pg.goto(`${BASE_URL}${rota.url}`, { waitUntil: "networkidle", timeout: 20_000 });
        // Espera um pouco para qualquer JS de layout carregar
        await pg.waitForTimeout(800);

        const med = await medirOverflow(pg);
        r.resultados.push({
          width: w,
          scrollWidth: med.scrollWidth,
          overflow: med.overflow,
          elementos: med.elementos,
        });

        // Screenshot apenas nas larguras extremas (360 e 430) ou se há overflow
        if (w === 375 || med.overflow) {
          const nomeArq = `${rota.nome.replace(/[^a-zA-Z0-9]/g, "_")}_${w}px${med.overflow ? "_OVERFLOW" : ""}.png`;
          await pg.screenshot({
            path: path.join(SHOTS_DIR, nomeArq),
            fullPage: false, // viewport screenshot
          });
        }
      } catch (err) {
        r.resultados.push({ width: w, scrollWidth: -1, overflow: false, elementos: [`ERRO: ${(err as Error).message}`] });
      }
    }

    resultados.push(r);
    console.log(
      `[${rota.nome}] ${r.resultados
        .map((x) => `${x.width}=${x.overflow ? "❌" + x.scrollWidth : "✅"}`)
        .join("  ")}`,
    );
  }

  await browser.close();

  // ------------------------------------------------
  // Relatório final
  // ------------------------------------------------
  console.log("\n\n=== RELATÓRIO DE OVERFLOW HORIZONTAL ===\n");

  const comOverflow = resultados.filter((r) => r.resultados.some((x) => x.overflow));

  if (comOverflow.length === 0) {
    console.log("✅ Nenhuma tela com overflow encontrada!");
  } else {
    console.log("Telas com problema:\n");
    for (const r of comOverflow) {
      const larguras = r.resultados.filter((x) => x.overflow).map((x) => x.width).join(", ");
      console.log(`❌ ${r.nome} (${r.rota}) — overflow em: ${larguras}px`);
      const maior = r.resultados.filter((x) => x.overflow);
      for (const m of maior) {
        console.log(`   @ ${m.width}px: scrollWidth=${m.scrollWidth}px`);
        for (const el of m.elementos.slice(0, 5)) {
          console.log(`     → ${el}`);
        }
      }
    }
  }

  console.log("\n=== TABELA RESUMO ===");
  const header = `| Tela | ${WIDTHS.map((w) => `${w}px`).join(" | ")} |`;
  const sep = `|---|${WIDTHS.map(() => "---").join("|")}|`;
  console.log(header);
  console.log(sep);
  for (const r of resultados) {
    const cols = r.resultados.map((x) =>
      x.overflow ? `❌ ${x.scrollWidth}` : x.scrollWidth === -1 ? "⚠️ erro" : `✅`,
    );
    console.log(`| ${r.nome} | ${cols.join(" | ")} |`);
  }

  // Salvar JSON completo
  const jsonPath = path.join(SHOTS_DIR, "audit-results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(resultados, null, 2));
  console.log(`\nResultados completos salvos em: ${jsonPath}`);
  console.log(`Screenshots em: ${SHOTS_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
