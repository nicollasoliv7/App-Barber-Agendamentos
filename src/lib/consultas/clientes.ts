import "server-only";
import { q, q1 } from "../db";
import { RECORRENTE_VISITAS } from "../relatorios";

/** Consultas do CRM (lista de clientes e ficha). Sempre restritas à empresa. */

export type ClienteLinha = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  origem: string;
  visitas: number;
  faltas: number;
  gasto: number;
  ultimo: Date | null;
  proximo: Date | null;
  criado_em: Date;
  recentes: number;
  plano: string | null;
  plano_status: string | null;
};

/** Segmentos e ordens da lista (chaves validadas na página; aqui viram SQL). */
const FILTRO_SEGMENTO: Record<string, string> = {
  todos: "true",
  proximo: "proximo is not null",
  sumidos: "ultimo < now() - interval '45 days' and proximo is null",
  novos: "criado_em >= now() - interval '30 days'",
  importados: "origem = 'importacao'",
  recorrentes: `recentes >= ${RECORRENTE_VISITAS}`,
  assinantes: "plano is not null",
};
const ORDEM_SQL: Record<string, string> = {
  recentes: "ultimo desc nulls last, nome",
  gasto: "gasto desc, nome",
  visitas: "visitas desc, nome",
  nome: "nome",
};

export const listarClientes = (empresaId: string, busca: string, seg: string, ordem: string, limite: number, offset: number) =>
  q<ClienteLinha>(
    `with base as (
         select c.id, c.nome, c.telefone, c.email, c.origem, c.criado_em,
                count(a.id) filter (where a.status = 'concluido')::int as visitas,
                count(a.id) filter (where a.status = 'faltou')::int as faltas,
                coalesce(sum(a.preco_centavos - a.valor_coberto_centavos) filter (where a.status = 'concluido'),0)::int as gasto,
                count(a.id) filter (where a.status = 'concluido' and a.inicio >= now() - interval '90 days' and a.inicio <= now())::int as recentes,
                (select p.nome from assinatura s join plano p on p.id = s.plano_id where s.cliente_id = c.id and s.status <> 'cancelada' limit 1) as plano,
                (select s.status from assinatura s where s.cliente_id = c.id and s.status <> 'cancelada' limit 1) as plano_status,
                max(a.inicio) filter (where a.inicio < now() and a.status in ('concluido','confirmado')) as ultimo,
                min(a.inicio) filter (where a.inicio >= now() and a.status in ('confirmado','pendente_pagamento')) as proximo
         from cliente c left join agendamento a on a.cliente_id = c.id
         where c.empresa_id = $1
           and ($2 = '' or c.nome ilike '%' || $2 || '%' or c.email ilike '%' || $2 || '%'
                or c.telefone like '%' || nullif(regexp_replace($2, '\\D', '', 'g'), '') || '%')
         group by c.id)
       select * from base where ${FILTRO_SEGMENTO[seg] ?? "true"} order by ${ORDEM_SQL[ordem] ?? ORDEM_SQL.recentes} limit ${limite} offset ${offset}`,
    [empresaId, busca],
  );

export const fichaDoCliente = (id: string, empresaId: string) =>
  q1<{
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  observacoes: string | null;
  origem: string;
  telefone_verificado: boolean;
  dados_extras: Record<string, string>;
  criado_em: Date;
  arquivo_nome: string | null;
}>(
    `select c.*, i.arquivo_nome from cliente c left join importacao i on i.id = c.importacao_id where c.id = $1 and c.empresa_id = $2`,
    [id, empresaId],
  );

export const historicoDeAtendimentos = (id: string, empresaId: string) =>
  q<{ id: string; inicio: Date; status: string; preco_centavos: number; valor_coberto_centavos: number; servico: string; profissional: string; pago: number }>(
    `select a.id, a.inicio, a.status, a.preco_centavos, a.valor_coberto_centavos, s.nome as servico, p.nome as profissional,
              coalesce((select sum(valor_centavos) from pagamento pg where pg.agendamento_id = a.id and pg.status='pago'),0)::int as pago
       from agendamento a join servico s on s.id = a.servico_id join profissional p on p.id = a.profissional_id
       where a.cliente_id = $1 and a.empresa_id = $2 order by a.inicio desc limit 100`,
    [id, empresaId],
  );

/** Visitas, gasto (sem a parte coberta por plano), faltas, cancelamentos, último e próximo horário. */
export const indicadoresDoCliente = (id: string, empresaId: string) =>
  q<{ visitas: number; visitas_pagas: number; gasto: number; faltas: number; cancelados: number; ultimo: Date | null; proximo: Date | null }>(
    `select count(*) filter (where status='concluido')::int as visitas,
              count(*) filter (where status='concluido' and preco_centavos > valor_coberto_centavos)::int as visitas_pagas,
              coalesce(sum(preco_centavos - valor_coberto_centavos) filter (where status='concluido'),0)::int as gasto,
              count(*) filter (where status='faltou')::int as faltas,
              count(*) filter (where status='cancelado')::int as cancelados,
              max(inicio) filter (where inicio < now() and status in ('concluido','confirmado')) as ultimo,
              min(inicio) filter (where inicio >= now() and status in ('confirmado','pendente_pagamento')) as proximo
       from agendamento where cliente_id = $1 and empresa_id = $2`,
    [id, empresaId],
  );

export const servicosPreferidos = (id: string, empresaId: string) =>
  q<{ nome: string; qtd: number }>(
    `select s.nome, count(*)::int as qtd from agendamento a join servico s on s.id = a.servico_id
       where a.cliente_id = $1 and a.empresa_id = $2 and a.status in ('concluido','confirmado') group by s.nome order by qtd desc limit 3`,
    [id, empresaId],
  );
