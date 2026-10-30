"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";
import { ErroNegocio } from "@/lib/tipos";
import { validarChavePix, type DadosPix } from "@/lib/pix-brcode";
import { cobrarAgora } from "@/lib/cobrancas-mensalidade";
import { configPix, pausarCobrancaAssinante, removerOptout, salvarConfigPix } from "@/lib/repositorios/cobrancas-mensalidade";
import { hojeDaEmpresa } from "@/lib/planos-ciclos";
import { isUuid } from "@/lib/validacao";
import type { Estado } from "./acoes";
import { log } from "@/lib/log";

async function usuario() {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  return u;
}
async function gestor() {
  const u = await usuario();
  if (u.papel !== "dono" && u.papel !== "admin") throw new ErroNegocio("Só o dono ou um administrador pode alterar as configurações de cobrança.", 403);
  return u;
}
async function executar(fn: () => Promise<string>): Promise<Estado> {
  try {
    const ok = await fn();
    revalidatePath("/painel", "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    log.erro("[cobrancas]", e);
    return { erro: "Não foi possível salvar. Tente novamente." };
  }
}

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ---------------------------------------------------------------- Pix

/** Salva (ou atualiza) a configuração da chave Pix da barbearia (R79). */
export async function salvarPixAcao(_: Estado, f: FormData): Promise<Estado> {
  return executar(async () => {
    const u = await gestor();
    const tipo = txt(f, "pix_tipo") as DadosPix["tipo"];
    const chave = txt(f, "pix_chave");
    const recebedor = txt(f, "pix_recebedor").slice(0, 25);
    const cidade = txt(f, "pix_cidade").slice(0, 15);

    const tipos: DadosPix["tipo"][] = ["cpf", "cnpj", "telefone", "email", "aleatoria"];
    if (!tipos.includes(tipo)) throw new ErroNegocio("Tipo de chave Pix inválido");
    const erroChave = validarChavePix(tipo, chave);
    if (erroChave) throw new ErroNegocio(erroChave);
    if (!recebedor) throw new ErroNegocio("Informe o nome do recebedor (aparece no Pix do cliente)");
    if (!cidade) throw new ErroNegocio("Informe a cidade");

    await salvarConfigPix(u.empresa_id, { tipo, chave, recebedor, cidade });
    return "Chave Pix salva";
  });
}

// ---------------------------------------------------------------- Cobrar agora

/**
 * Dispara uma mensagem de cobrança manual (etapa "manual") para uma mensalidade.
 * Respeita a idempotência: no máximo 1 por cobrança por dia (R85).
 */
export async function cobrarAgoraAcao(f: FormData): Promise<Estado> {
  try {
    const u = await usuario();
    const cobrancaId = txt(f, "cobranca_id");
    if (!isUuid(cobrancaId)) throw new ErroNegocio("Mensalidade inválida");
    const pix = await configPix(u.empresa_id);
    if (!pix) throw new ErroNegocio("Configure a chave Pix antes de cobrar pelo WhatsApp");
    const { fuso } = await hojeDaEmpresa(u.empresa_id);
    const resultado = await cobrarAgora(u.empresa_id, cobrancaId, fuso);
    revalidatePath("/painel", "layout");
    if (resultado === "ja_enviado_hoje") return { ok: "Cobrança já enviada hoje para esta mensalidade" };
    if (resultado === "cobranca_invalida") return { erro: "Mensalidade não encontrada ou já paga" };
    return { ok: "Cobrança enviada via WhatsApp" };
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    log.erro("[cobrancas] cobrarAgora:", e);
    return { erro: "Não foi possível enviar. Tente novamente." };
  }
}

// ---------------------------------------------------------------- Pausar assinante

/** Liga ou desliga a régua de cobrança para um assinante específico (R76). */
export async function pausarAssinanteAcao(f: FormData): Promise<Estado> {
  try {
    const u = await usuario();
    const assinaturaId = txt(f, "assinatura_id");
    if (!isUuid(assinaturaId)) throw new ErroNegocio("Assinatura inválida");
    const pausar = f.get("pausar") === "on";
    await pausarCobrancaAssinante(u.empresa_id, assinaturaId, pausar);
    revalidatePath("/painel", "layout");
    return { ok: pausar ? "Cobrança pausada para este assinante" : "Cobrança retomada para este assinante" };
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    log.erro("[cobrancas] pausar:", e);
    return { erro: "Não foi possível salvar." };
  }
}

// ---------------------------------------------------------------- Reativar opt-out

/** Remove o opt-out de um cliente (R87 — reativação manual pelo barbeiro). */
export async function reativarOptoutAcao(f: FormData): Promise<Estado> {
  try {
    const u = await gestor();
    const clienteId = txt(f, "cliente_id");
    if (!isUuid(clienteId)) throw new ErroNegocio("Cliente inválido");
    await removerOptout(u.empresa_id, clienteId);
    revalidatePath("/painel", "layout");
    return { ok: "Cobrança automática reativada para este cliente" };
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    log.erro("[cobrancas] reativar:", e);
    return { erro: "Não foi possível salvar." };
  }
}
