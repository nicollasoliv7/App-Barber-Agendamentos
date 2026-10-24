"use server";

import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";
import { iniciarPagamento } from "@/lib/assinatura-sistema";
import { ErroNegocio } from "@/lib/tipos";
import { log } from "@/lib/log";
import type { Estado } from "./acoes";

/** Abre o checkout da AbacatePay para o plano escolhido. Só dono/admin. */
export async function pagarPlano(_: Estado, f: FormData): Promise<Estado> {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  if (u.papel !== "dono" && u.papel !== "admin") return { erro: "Só o dono ou um administrador pode contratar o plano." };
  let url: string;
  try {
    url = await iniciarPagamento(u.empresa_id, u.id, String(f.get("plano") ?? ""));
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    log.erro("[assinatura]", e);
    return { erro: "Não foi possível abrir o pagamento. Tente novamente." };
  }
  redirect(url); // checkout hospedado da AbacatePay
}
