import "server-only";
import { q, tx } from "../db";
import { avaliarCobertura, type Cobertura } from "../planos-cobertura";

/** Consultas da Agenda do dia e da lista de Agendamentos (painel). Sempre restritas à empresa. */

export type LinhaAgenda = {
  id: string;
  inicio: Date;
  fim: Date;
  status: string;
  origem: string;
  preco_centavos: number;
  cliente: string;
  telefone: string;
  servico: string;
  profissional_id: string;
  pago: number;
  cancelado_por: string | null;
  token_publico: string;
  valor_coberto_centavos: number;
  cliente_id: string;
  servico_id: string;
  empresa_id: string;
  observacao: string | null;
  tem_plano: boolean;
  plano: string | null;
};

export const servicosAtivosComDuracao = (empresaId: string) =>
  q<{ id: string; nome: string; duracao_min: number }>(`select id, nome, duracao_min from servico where empresa_id = $1 and ativo order by ordem, nome`, [empresaId]);

/** Atendimentos do intervalo [de, ate), com pagamento recebido e situação do plano do cliente. */
export const agendaDoPeriodo = (empresaId: string, de: Date, ate: Date) =>
  q<LinhaAgenda>(
    `select a.id, a.inicio, a.fim, a.status, a.origem, a.preco_centavos, a.profissional_id, a.cancelado_por, a.token_publico, a.valor_coberto_centavos, a.cliente_id, a.servico_id, a.empresa_id, a.observacao,
              exists (select 1 from assinatura s where s.cliente_id = a.cliente_id and s.status <> 'cancelada') as tem_plano,
              (select p.nome from assinatura_uso us join assinatura s on s.id = us.assinatura_id join plano p on p.id = s.plano_id where us.agendamento_id = a.id) as plano,
              c.nome as cliente, c.telefone, s.nome as servico,
              coalesce((select sum(valor_centavos) from pagamento p where p.agendamento_id = a.id and p.status='pago'),0)::int as pago
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
       where a.empresa_id = $1 and a.inicio >= $2 and a.inicio < $3 order by a.inicio`,
    [empresaId, de, ate],
  );

export const bloqueiosDoPeriodo = (empresaId: string, de: Date, ate: Date) =>
  q<{ profissional_id: string | null; inicio: Date; fim: Date; motivo: string | null }>(
    `select profissional_id, inicio, fim, motivo from bloqueio where empresa_id = $1 and inicio < $3 and fim > $2`,
    [empresaId, de, ate],
  );

/** Para cada atendimento candidato, se o plano do cliente cobre (sem gravar nada). */
export async function coberturasPossiveis(candidatos: LinhaAgenda[]): Promise<Map<string, Cobertura>> {
  const elegiveis = new Map<string, Cobertura>();
  if (candidatos.length)
    await tx(async (t) => {
      for (const a of candidatos) elegiveis.set(a.id, await avaliarCobertura(t, a));
    });
  return elegiveis;
}

export type LinhaAgendamento = {
  id: string;
  inicio: Date;
  status: string;
  origem: string;
  preco_centavos: number;
  pago: number;
  cliente_id: string;
  cliente: string;
  telefone: string;
  servico: string;
  profissional: string;
  token_publico: string;
  valor_coberto_centavos: number;
};

/** Página da lista de agendamentos (where/params vêm de whereAgendamentos, sempre com a empresa). */
export const agendamentosFiltrados = (where: string, params: unknown[], ordem: "a.inicio asc" | "a.inicio desc", limite: number, offset: number) =>
  q<LinhaAgendamento>(
    `select a.id, a.inicio, a.status, a.origem, a.preco_centavos, a.cliente_id, a.token_publico, a.valor_coberto_centavos,
              coalesce((select sum(valor_centavos) from pagamento p where p.agendamento_id = a.id and p.status='pago'),0)::int as pago,
              c.nome as cliente, c.telefone, s.nome as servico, pr.nome as profissional
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id join profissional pr on pr.id = a.profissional_id
       where ${where} order by ${ordem} limit ${limite} offset ${offset}`,
    params,
  );

export const totaisFiltrados = (where: string, params: unknown[]) =>
  q<{ n: number; valor: number }>(
    `select count(*)::int as n, coalesce(sum(a.preco_centavos - a.valor_coberto_centavos) filter (where a.status in ('confirmado','concluido')),0)::int as valor
       from agendamento a where ${where}`,
    params,
  );
