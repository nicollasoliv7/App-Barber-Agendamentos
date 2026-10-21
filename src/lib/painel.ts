import "server-only";
import { redirect } from "next/navigation";
import { usuarioPainel, type UsuarioPainel } from "./sessao";

/**
 * Usuário logado no painel ou redireciona para o login.
 * Cada página chama isto (e não só o layout), porque layout e página renderizam em paralelo.
 */
export async function usuarioOuLogin(): Promise<UsuarioPainel> {
  const u = await usuarioPainel();
  if (!u) redirect("/painel/login");
  return u;
}
