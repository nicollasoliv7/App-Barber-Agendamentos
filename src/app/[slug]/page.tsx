import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { camposAtivos, configAgendamento, configTema, servicosAtivos } from "@/lib/empresa";
import type { Empresa } from "@/lib/tipos";
import PaginaPublica from "./PaginaPublica";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const e = await q1<{ nome: string }>(`select nome from empresa where slug = $1`, [slug]);
  return { title: e ? `Agende na ${e.nome}` : "Não encontrado" };
}

export default async function Page({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const e = await q1<Empresa>(`select * from empresa where slug = $1`, [slug]);
  if (!e) notFound();
  const [tema, cfg, servicos, campos, unidades] = await Promise.all([
    configTema(e.id),
    configAgendamento(e.id),
    servicosAtivos(e.id),
    camposAtivos(e.id),
    q<{ id: string; nome: string; endereco: string | null; maps_url: string | null }>(`select id, nome, endereco, maps_url from unidade where empresa_id = $1 and ativo order by nome`, [e.id]),
  ]);
  const estilo = {
    "--t-primaria": tema.cor_primaria,
    "--t-secundaria": tema.cor_secundaria,
    "--t-fundo": tema.cor_fundo,
    "--t-texto": tema.cor_texto,
  } as React.CSSProperties;

  return (
    <div className="tema min-h-screen" style={estilo}>
      <PaginaPublica
        empresa={{ nome: e.nome, slug: e.slug, endereco: e.endereco, maps_url: e.maps_url, logo_url: e.logo_url }}
        unidades={e.multiunidade ? unidades : []}
        pixel={e.pixel_campanha}
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
