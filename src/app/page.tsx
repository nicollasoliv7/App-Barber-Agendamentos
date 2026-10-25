import { redirect } from "next/navigation";
import { usuarioPainel } from "@/lib/sessao";

/**
 * A raiz do app não é vitrine: a apresentação do Agendou fica só na landing (SITE_URL),
 * para não existirem duas páginas de venda com informações diferentes.
 * Quem já está logado vai direto para o painel.
 */
export default async function Home() {
  if (await usuarioPainel()) redirect("/painel");
  redirect(process.env.SITE_URL?.trim() || "https://site-agendou.vercel.app");
}
