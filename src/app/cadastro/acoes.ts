"use server";

import { redirect } from "next/navigation";
import { abrirSessaoPainel } from "@/lib/sessao";
import { criarBarbearia } from "@/lib/repositorios/empresas";
import { normalizarTelefone } from "@/lib/validacao";
import { ehPlanoPago } from "@/lib/planos-sistema";
import { ErroNegocio } from "@/lib/tipos";
import { log } from "@/lib/log";

export type EstadoCadastro = { erro?: string } | undefined;

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim().replace(/\s+/g, " ");

/** Cria a conta da barbearia no plano Gratuito e entra no painel. */
export async function cadastrar(_: EstadoCadastro, f: FormData): Promise<EstadoCadastro> {
  if (txt(f, "site")) return { erro: "Não foi possível criar a conta." }; // campo-isca contra robôs
  const barbearia = txt(f, "barbearia");
  const nome = txt(f, "nome");
  const telefone = normalizarTelefone(txt(f, "telefone"));
  const senha = String(f.get("senha") ?? "");
  if (barbearia.length < 2 || barbearia.length > 80) return { erro: "Informe o nome da barbearia" };
  if (nome.length < 2 || nome.length > 80) return { erro: "Informe o seu nome" };
  if (!telefone) return { erro: "Celular inválido. Use DDD + número." };
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres" };
  if (f.get("termos") !== "on") return { erro: "Aceite os termos para continuar" };

  try {
    const usuarioId = await criarBarbearia({ barbearia, nome, telefone, senha });
    await abrirSessaoPainel(usuarioId);
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    log.erro("[cadastro]", e);
    return { erro: "Não foi possível criar a conta. Tente novamente." };
  }
  const plano = String(f.get("plano") ?? "");
  redirect(ehPlanoPago(plano) ? `/painel/assinatura?plano=${plano}` : "/painel");
}
