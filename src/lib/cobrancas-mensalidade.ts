import "server-only";
import { tx } from "./db";
import { notificar } from "./notificacoes";
import { gerarBRCode } from "./pix-brcode";
import { sincronizarAssinaturas } from "./planos-ciclos";
import { diaLocal, minutosLocal, somarDias } from "./tempo";
import { linkWhatsapp, primeiroNome } from "./mensagens";
import { log } from "./log";
import { configPix, registrarEtapaAutomatica, registrarEtapaManual } from "./repositorios/cobrancas-mensalidade";
import {
  clienteTemOptout,
  cobrancasPendentesParaRegua,
  empresasParaCobranca,
  etapaJaRegistrada,
  etapaManualHojeJaRegistrada,
} from "./consultas/cobrancas-mensalidade";

// ---------------------------------------------------------------------------
// Helpers de tempo local
// ---------------------------------------------------------------------------

/** Hora local da empresa (0–23). */
const horaLocal = (fuso: string) => Math.floor(minutosLocal(new Date(), fuso) / 60);

/** Hoje na empresa (YYYY-MM-DD). */
const hojeLocal = (fuso: string) => diaLocal(new Date(), fuso);

// ---------------------------------------------------------------------------
// Cálculo de etapas — janela deslizante
// ---------------------------------------------------------------------------

type Etapa = "antes" | "vencimento" | "depois";

/**
 * Retorna qual etapa automática é devida hoje, considerando janelas deslizantes:
 *   antes    : [V - diasAntes,  V - 1]
 *   vencimento: [V,              V]
 *   depois   : [V + 1,          V + diasDepois]
 * Retorna a etapa mais recente válida (depois > vencimento > antes).
 */
function etapaDevida(hoje: string, vencimento: string, diasAntes: number, diasDepois: number): Etapa | null {
  const V = vencimento;
  if (hoje >= somarDias(V, 1) && hoje <= somarDias(V, diasDepois)) return "depois";
  if (hoje === V) return "vencimento";
  if (hoje >= somarDias(V, -diasAntes) && hoje <= somarDias(V, -1)) return "antes";
  return null;
}

// ---------------------------------------------------------------------------
// Texto da mensagem de cobrança
// ---------------------------------------------------------------------------

function formatarValor(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
}

function formatarData(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function textoCobranca(clienteNome: string, planoNome: string, centavos: number, vencimento: string, brCode: string): string {
  return (
    `Olá ${primeiroNome(clienteNome)}, a mensalidade do plano "${planoNome}" ` +
    `(${formatarValor(centavos)}) vence em ${formatarData(vencimento)}.\n` +
    `Pague com Pix: ${brCode}`
  );
}

function parametrosCobranca(clienteNome: string, planoNome: string, centavos: number, vencimento: string, brCode: string): string[] {
  return [primeiroNome(clienteNome), planoNome, formatarValor(centavos), formatarData(vencimento), brCode];
}

// ---------------------------------------------------------------------------
// Envio de uma cobrança
// ---------------------------------------------------------------------------

async function enviarUmaCobranca(
  empresaId: string,
  cobrancaId: string,
  clienteId: string,
  clienteNome: string,
  clienteTelefone: string,
  planoNome: string,
  valorCentavos: number,
  vencimento: string,
  etapa: Etapa | "manual",
  hoje: string,
): Promise<boolean> {
  const pix = await configPix(empresaId);
  if (!pix) return false;

  const brCode = gerarBRCode(pix, valorCentavos, cobrancaId);
  const mensagem = textoCobranca(clienteNome, planoNome, valorCentavos, vencimento, brCode);
  const parametros = parametrosCobranca(clienteNome, planoNome, valorCentavos, vencimento, brCode);
  const fallback = linkWhatsapp(clienteTelefone, mensagem);
  void fallback; // reservado para uso nas telas

  let notificacaoId: string;
  try {
    notificacaoId = await tx((t) => notificar(t, {
      empresaId,
      destino: clienteTelefone,
      tipo: "cobranca_mensalidade",
      mensagem,
      parametros,
    }));
  } catch (e) {
    log.erro(`[cobrancas] notificar falhou empresa=${empresaId} cobranca=${cobrancaId}:`, e);
    return false;
  }

  await tx(async (t) => {
    if (etapa === "manual") {
      await registrarEtapaManual(t, empresaId, cobrancaId, hoje, notificacaoId);
    } else {
      await registrarEtapaAutomatica(t, empresaId, cobrancaId, etapa, hoje, notificacaoId);
    }
  });
  return true;
}

// ---------------------------------------------------------------------------
// Loop por empresa
// ---------------------------------------------------------------------------

async function processarEmpresa(
  empresaId: string,
  fuso: string,
  diasAntes: number,
  diasDepois: number,
): Promise<number> {
  const hoje = hojeLocal(fuso);

  return tx(async (t) => {
    await sincronizarAssinaturas(t, empresaId);
    const lista = await cobrancasPendentesParaRegua(empresaId);
    let enviados = 0;

    for (const c of lista) {
      if (c.cobranca_pausada) continue;
      if (await clienteTemOptout(empresaId, c.cliente_id)) continue;

      const etapa = etapaDevida(hoje, c.vencimento, diasAntes, diasDepois);
      if (!etapa) continue;
      if (await etapaJaRegistrada(c.cobranca_id, etapa)) continue;

      const ok = await enviarUmaCobranca(
        empresaId, c.cobranca_id, c.cliente_id,
        c.cliente_nome, c.cliente_telefone, c.plano_nome,
        c.valor_centavos, c.vencimento, etapa, hoje,
      );
      if (ok) enviados++;
    }
    return enviados;
  });
}

// ---------------------------------------------------------------------------
// Ponto de entrada — chamado pelo cron e pelo instrumentation.ts
// ---------------------------------------------------------------------------

/** R84: envia cobranças automáticas de mensalidade. Máx 50/empresa/execução. */
export async function enviarCobrancas(): Promise<number> {
  const empresas = await empresasParaCobranca();
  let total = 0;
  for (const emp of empresas) {
    const hora = horaLocal(emp.fuso_horario);
    if (hora < 9 || hora >= 20) continue; // R76: janela 9h–20h local
    try {
      total += await processarEmpresa(emp.empresa_id, emp.fuso_horario, emp.cobranca_dias_antes, emp.cobranca_dias_depois);
    } catch (e) {
      log.erro(`[cobrancas] empresa=${emp.empresa_id} falhou:`, e);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// "Cobrar agora" — etapa manual, respeitando idempotência
// ---------------------------------------------------------------------------

export async function cobrarAgora(
  empresaId: string,
  cobrancaId: string,
  fuso: string,
): Promise<"enviado" | "ja_enviado_hoje" | "cobranca_invalida"> {
  const hoje = hojeLocal(fuso);
  if (await etapaManualHojeJaRegistrada(cobrancaId, hoje)) return "ja_enviado_hoje";

  const lista = await cobrancasPendentesParaRegua(empresaId);
  const c = lista.find((x) => x.cobranca_id === cobrancaId);
  if (!c) return "cobranca_invalida";

  await enviarUmaCobranca(
    empresaId, c.cobranca_id, c.cliente_id,
    c.cliente_nome, c.cliente_telefone, c.plano_nome,
    c.valor_centavos, c.vencimento, "manual", hoje,
  );
  return "enviado";
}
