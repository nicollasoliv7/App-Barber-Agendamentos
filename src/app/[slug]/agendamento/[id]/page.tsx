import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { idEmpresaPorSlug } from "@/lib/consultas/publico";
import { configTema } from "@/lib/empresa";
import { buscarPorToken } from "@/lib/gerenciar";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";
import Gerenciar from "./Gerenciar";

export const metadata: Metadata = { title: "Seu agendamento", robots: { index: false } };

export default async function Page({ params, searchParams }: PageProps<"/[slug]/agendamento/[id]">) {
  const { slug, id } = await params;
  const t = (await searchParams).t;
  const token = typeof t === "string" ? t : "";
  const emp = await idEmpresaPorSlug(slug);
  if (!emp || !isUuid(id)) notFound();
  const tema = await configTema(emp.id);
  let ag = null;
  let erro = "";
  try {
    ag = await buscarPorToken(slug, id, token);
  } catch (e) {
    erro = e instanceof ErroNegocio ? e.message : "Não foi possível abrir o agendamento.";
  }
  const estilo = {
    "--t-primaria": tema.cor_primaria,
    "--t-fundo": tema.cor_fundo,
    "--t-texto": tema.cor_texto,
  } as React.CSSProperties;
  return (
    <div className="tema ui min-h-screen" style={estilo}>
      <Gerenciar slug={slug} token={token} inicial={ag} erro={erro} />
    </div>
  );
}
