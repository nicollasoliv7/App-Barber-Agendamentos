import "server-only";
import { q, tx } from "../db";
import { sincronizarAssinaturas } from "../planos-ciclos";

/** Consultas das telas de planos mensais (página Planos e bloco da ficha do cliente). */

export type PlanoComServicos = {
  id: string;
  nome: string;
  descricao: string | null;
  beneficios: string | null;
  preco_centavos: number;
  periodo_meses: number;
  ativo: boolean;
  assinantes: number;
  servicos: { servico_id: string; nome: string; limite_por_ciclo: number | null; valor_cliente_centavos: number }[];
};

/** Planos com contagem de assinantes e serviços incluídos (limite e adicional). */
export const planosDaEmpresa = (empresaId: string) =>
  q<PlanoComServicos>(
    `select p.id, p.nome, p.descricao, p.beneficios, p.preco_centavos, p.periodo_meses, p.ativo,
              (select count(*) from assinatura a where a.plano_id = p.id and a.status <> 'cancelada')::int as assinantes,
              coalesce((select json_agg(json_build_object('servico_id', s.id, 'nome', s.nome, 'limite_por_ciclo', ps.limite_por_ciclo,
                                                          'valor_cliente_centavos', ps.valor_cliente_centavos) order by s.ordem, s.nome)
                        from plano_servico ps join servico s on s.id = ps.servico_id where ps.plano_id = p.id), '[]'::json) as servicos
       from plano p where p.empresa_id = $1 order by p.ativo desc, p.nome`,
    [empresaId],
  );

export const servicosAtivosComPreco = (empresaId: string) =>
  q<{ id: string; nome: string; preco_centavos: number }>(`select id, nome, preco_centavos from servico where empresa_id = $1 and ativo order by ordem, nome`, [empresaId]);

/** Assinantes por situação: "abertas" (não canceladas) ou um status específico. */
export const assinantes = (empresaId: string, filtro: string) =>
  q<{ id: string; cliente_id: string; cliente: string; telefone: string; plano: string; status: string; ciclo_fim: string; preco_centavos: number; periodo_meses: number; usos: number }>(
    `select a.id, c.id as cliente_id, c.nome as cliente, c.telefone, p.nome as plano, a.status, a.ciclo_fim::text as ciclo_fim, a.preco_centavos, a.periodo_meses,
              (select count(*) from assinatura_uso us where us.assinatura_id = a.id and us.ciclo_inicio = a.ciclo_inicio)::int as usos
       from assinatura a join cliente c on c.id = a.cliente_id join plano p on p.id = a.plano_id
       where a.empresa_id = $1 and (case when $2 = 'abertas' then a.status <> 'cancelada' else a.status = $2 end)
       order by case a.status when 'inadimplente' then 0 when 'pendente' then 1 when 'ativa' then 2 else 3 end, a.ciclo_fim, c.nome limit 200`,
    [empresaId, filtro],
  );

/** Clientes para o campo de busca "Adicionar assinante". */
export const clientesParaBusca = (empresaId: string) =>
  q<{ nome: string; telefone: string }>(`select nome, telefone from cliente where empresa_id = $1 order by nome limit 2000`, [empresaId]);

export async function sincronizarDoCliente(empresaId: string, clienteId: string) {
  await tx((t) => sincronizarAssinaturas(t, empresaId, { clienteId }));
}

export const assinaturasDoCliente = (clienteId: string, empresaId: string) =>
  q<{
  id: string;
  status: string;
  plano: string;
  preco_centavos: number;
  periodo_meses: number;
  inicio: string;
  ciclo_inicio: string;
  ciclo_fim: string;
  cancelada_em: Date | null;
  plano_id: string;
  }>(
    `select a.id, a.status, p.nome as plano, a.preco_centavos, a.periodo_meses, a.inicio::text as inicio, a.ciclo_inicio::text as ciclo_inicio,
              a.ciclo_fim::text as ciclo_fim, a.cancelada_em, a.plano_id
       from assinatura a join plano p on p.id = a.plano_id where a.cliente_id = $1 and a.empresa_id = $2
       order by (a.status = 'cancelada'), a.criado_em desc limit 5`,
    [clienteId, empresaId],
  );

export const planosAtivos = (empresaId: string) =>
  q<{ id: string; nome: string; preco_centavos: number; periodo_meses: number }>(
    `select id, nome, preco_centavos, periodo_meses from plano where empresa_id = $1 and ativo order by nome`,
    [empresaId],
  );

/** Usos de cada serviço do plano no ciclo atual. */
export const usosNoCiclo = (assinaturaId: string, planoId: string, cicloInicio: string) =>
  q<{ servico: string; limite_por_ciclo: number | null; usados: number }>(
    `select s.nome as servico, ps.limite_por_ciclo,
                  (select count(*) from assinatura_uso u where u.assinatura_id = $1 and u.servico_id = ps.servico_id and u.ciclo_inicio = $3::date)::int as usados
           from plano_servico ps join servico s on s.id = ps.servico_id where ps.plano_id = $2 order by s.nome`,
    [assinaturaId, planoId, cicloInicio],
  );

export const mensalidadesRecentes = (assinaturaId: string) =>
  q<{ id: string; ciclo_inicio: string; vencimento: string; valor_centavos: number; status: string; metodo: string | null }>(
    `select id, ciclo_inicio::text as ciclo_inicio, vencimento::text as vencimento, valor_centavos, status, metodo
           from assinatura_cobranca where assinatura_id = $1 order by ciclo_inicio desc limit 6`,
    [assinaturaId],
  );
