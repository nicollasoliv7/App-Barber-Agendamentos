import type { Metadata } from "next";
import { confirmacaoAutomaticaAtiva } from "@/lib/whatsapp";
import { notFound } from "next/navigation";
import { empresaCompletaPorSlug, resumoEmpresaPorSlug, totalProfissionaisAtivos, unidadesAtivas } from "@/lib/consultas/publico";
import { camposAtivos, configAgendamento, configTema, servicosAtivos } from "@/lib/empresa";
import PaginaPublica from "./PaginaPublica";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const e = await resumoEmpresaPorSlug(slug);
  if (!e) return { title: "Não encontrado" };
  const titulo = `Agende na ${e.nome}`;
  const desc = `Escolha o serviço, o profissional e o horário em poucos toques, sem cadastro.${e.endereco ? ` ${e.endereco}.` : ""}`;
  return { title: titulo, description: desc, openGraph: { title: titulo, description: desc, type: "website" } };
}

export default async function Page({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const e = await empresaCompletaPorSlug(slug);
  if (!e) notFound();
  const [tema, cfg, servicos, campos, unidades, [{ profs }]] = await Promise.all([
    configTema(e.id),
    configAgendamento(e.id),
    servicosAtivos(e.id),
    camposAtivos(e.id),
    unidadesAtivas(e.id),
    totalProfissionaisAtivos(e.id),
  ]);
  const estilo = {
    "--t-primaria": tema.cor_primaria,
    "--t-secundaria": tema.cor_secundaria,
    "--t-fundo": tema.cor_fundo,
    "--t-texto": tema.cor_texto,
  } as React.CSSProperties;

  return (
    <div className="tema ui relative min-h-screen" style={estilo}>
      <PaginaPublica
        empresa={{
          nome: e.nome,
          slug: e.slug,
          endereco: e.endereco,
          maps_url: e.maps_url,
          logo_url: e.logo_url,
          whatsapp: e.telefone_whatsapp,
        }}
        unidades={e.multiunidade ? unidades : []}
        pixel={e.pixel_campanha}
        totalProfissionais={profs}
        whatsappAtivo={await confirmacaoAutomaticaAtiva(e.id)}
        regras={{ cancelamentoH: cfg.cancelamento_ate_min / 60 }}
        servicos={servicos.map((s) => ({
          id: s.id,
          nome: s.nome,
          descricao: s.descricao,
          observacao: s.observacao,
          preco_centavos: s.preco_centavos,
          duracao_min: s.duracao_min,
        }))}
        campos={campos.map((c) => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo, obrigatorio: c.obrigatorio }))}
        pagamento={{ modo: cfg.pagamento_modo, tipo: cfg.pagamento_tipo, minimo_pct: cfg.pagamento_minimo_pct }}
      />
    </div>
  );
}
