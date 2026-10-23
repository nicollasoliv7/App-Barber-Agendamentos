import { ok, rota } from "@/lib/api";
import { camposAtivos, configAgendamento, configTema, empresaPorSlug, servicosAtivos } from "@/lib/empresa";
import { unidadesAtivas } from "@/lib/consultas/publico";

/** Dados da página pública: empresa, tema, serviços, campos e regras de pagamento. */
export async function GET(_req: Request, ctx: RouteContext<"/api/public/[slug]">) {
  return rota(async () => {
    const { slug } = await ctx.params;
    const e = await empresaPorSlug(slug);
    const [tema, cfg, servicos, campos, unidades] = await Promise.all([
      configTema(e.id),
      configAgendamento(e.id),
      servicosAtivos(e.id),
      camposAtivos(e.id),
      unidadesAtivas(e.id),
    ]);
    return ok({
      empresa: { nome: e.nome, slug: e.slug, endereco: e.endereco, maps_url: e.maps_url, logo_url: e.logo_url, multiunidade: e.multiunidade, unidades },
      tema,
      pagamento: {
        modo: cfg.pagamento_modo,
        tipo: cfg.pagamento_tipo,
        minimo_pct: cfg.pagamento_minimo_pct,
        pix_expiracao_min: cfg.pix_expiracao_min,
      },
      servicos: servicos.map((s) => ({
        id: s.id,
        nome: s.nome,
        descricao: s.descricao,
        observacao: s.observacao,
        preco_centavos: s.preco_centavos,
        duracao_min: s.duracao_min,
        imagem_url: s.imagem_url,
      })),
      campos: campos.map((c) => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo, obrigatorio: c.obrigatorio })),
    });
  });
}
