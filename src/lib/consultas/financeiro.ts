import "server-only";
import { q } from "../db";
import { SALDO, VALOR } from "../relatorios";

/** Consultas da tela Financeiro. Período [ini, fim); sempre restritas à empresa. */

/** Totais dos atendimentos do período (valores sem a parte coberta por plano). */
export const totaisAtendimentos = (empresaId: string, ini: Date, fim: Date) =>
  q<{ total: number; concluidos: number; cancelados: number; faltas: number; previsto: number; realizado: number; a_receber: number; cobertos: number; valor_coberto: number }>(
    `select count(*)::int as total,
              count(*) filter (where status='concluido')::int as concluidos,
              count(*) filter (where status='cancelado')::int as cancelados,
              count(*) filter (where status='faltou')::int as faltas,
              coalesce(sum(${VALOR()}) filter (where status in ('confirmado','concluido')),0)::int as previsto,
              coalesce(sum(${VALOR()}) filter (where status='concluido'),0)::int as realizado,
              coalesce(sum(${SALDO()}) filter (where status='concluido'),0)::int as a_receber,
              count(*) filter (where valor_coberto_centavos > 0 and status <> 'cancelado')::int as cobertos,
              coalesce(sum(valor_coberto_centavos) filter (where status <> 'cancelado'),0)::int as valor_coberto
       from agendamento a where empresa_id=$1 and inicio >= $2 and inicio < $3`,
    [empresaId, ini, fim],
  );

/** Recebimentos reais: pagamentos de atendimentos + mensalidades pagas (fontes separadas; uso de benefício não entra). */
export const recebimentosPorForma = (empresaId: string, ini: Date, fim: Date) =>
  q<{ metodo: string; atendimentos: number; planos: number }>(
    `select metodo, sum(atend)::int as atendimentos, sum(plano)::int as planos from (
         select case when p.metodo = 'local' then 'local' else p.metodo end as metodo, p.valor_centavos as atend, 0 as plano
         from pagamento p join agendamento a on a.id = p.agendamento_id
         where a.empresa_id=$1 and p.status='pago' and p.pago_em >= $2 and p.pago_em < $3
         union all
         select ac.metodo, 0, ac.valor_centavos from assinatura_cobranca ac
         where ac.empresa_id=$1 and ac.status='paga' and ac.pago_em >= $2 and ac.pago_em < $3
       ) x group by metodo order by sum(atend + plano) desc`,
    [empresaId, ini, fim],
  );

/** Comissão sobre o valor dos serviços concluídos (inclui os cobertos por plano). */
export const comissoesDoPeriodo = (empresaId: string, ini: Date, fim: Date) =>
  q<{ nome: string; pct: number; atendimentos: number; bruto: number }>(
    `select pr.nome, pr.comissao_pct as pct, count(a.id)::int as atendimentos, coalesce(sum(a.preco_centavos),0)::int as bruto
       from profissional pr left join agendamento a on a.profissional_id = pr.id and a.status='concluido' and a.inicio >= $2 and a.inicio < $3
       where pr.empresa_id=$1 group by pr.id order by bruto desc`,
    [empresaId, ini, fim],
  );

/** Serviços agendados no período (confirmados + concluídos). */
export const servicosDoPeriodo = (empresaId: string, ini: Date, fim: Date) =>
  q<{ nome: string; qtd: number; valor: number }>(
    `select s.nome, count(*)::int as qtd, sum(${VALOR()})::int as valor from agendamento a join servico s on s.id = a.servico_id
       where a.empresa_id=$1 and a.inicio >= $2 and a.inicio < $3 and a.status in ('confirmado','concluido') group by s.nome order by valor desc`,
    [empresaId, ini, fim],
  );

/** Atendimentos concluídos no período com saldo a receber. */
export const atendimentosAReceber = (empresaId: string, ini: Date, fim: Date) =>
  q<{ id: string; inicio: Date; cliente: string; servico: string; saldo: number }>(
    `select a.id, a.inicio, c.nome as cliente, s.nome as servico, ${SALDO()}::int as saldo
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id
       where a.empresa_id=$1 and a.inicio >= $2 and a.inicio < $3 and a.status = 'concluido' and ${SALDO()} > 0
       order by a.inicio desc limit 15`,
    [empresaId, ini, fim],
  );

/** Mensalidades de planos ainda pendentes (atrasada = vencimento antes de hoje). */
export const mensalidadesEmAberto = (empresaId: string, hoje: string) =>
  q<{ id: string; vencimento: string; valor_centavos: number; cliente: string; cliente_id: string; plano: string; atrasada: boolean }>(
    `select ac.id, ac.vencimento::text as vencimento, ac.valor_centavos, c.nome as cliente, c.id as cliente_id, p.nome as plano,
                  ac.vencimento < $2::date as atrasada
           from assinatura_cobranca ac join assinatura a on a.id = ac.assinatura_id join cliente c on c.id = a.cliente_id join plano p on p.id = a.plano_id
           where ac.empresa_id = $1 and ac.status = 'pendente' order by ac.vencimento limit 30`,
    [empresaId, hoje],
  );
