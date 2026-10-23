import "server-only";
import { q } from "./db";
import { configAgendamento } from "./empresa";
import { diaLocal, instanteLocal, somarDias } from "./tempo";
import { isUuid } from "./validacao";

/** Cliente recorrente = 3+ atendimentos concluídos em 90 dias. Vale para todos, com ou sem plano. */
export const RECORRENTE_VISITAS = 3;

export const STATUS_VALIDOS = ["confirmado", "pendente_pagamento", "concluido", "cancelado", "faltou"] as const;

export interface Filtros {
  de: string;
  ate: string;
  periodo: string; // hoje | 7d | 30d | mes | mes_passado | personalizado
  servico: string | null;
  profissional: string | null;
  status: string | null;
  cliente: string | null; // id do cliente
  busca: string; // texto livre (nome/telefone do cliente)
}

const okData = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Lê os filtros da URL (searchParams). Período padrão: últimos 30 dias. */
export function lerFiltros(sp: Record<string, string | string[] | undefined>, fuso: string, padrao = "30d"): Filtros {
  const v = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const hoje = diaLocal(new Date(), fuso);
  const periodo = v("periodo") || (okData(v("de")) ? "personalizado" : padrao);
  let de = hoje;
  let ate = hoje;
  switch (periodo) {
    case "hoje":
      break;
    case "7d":
      de = somarDias(hoje, -6);
      break;
    case "mes":
      de = `${hoje.slice(0, 8)}01`;
      break;
    case "mes_passado": {
      const primeiro = `${hoje.slice(0, 8)}01`;
      ate = somarDias(primeiro, -1);
      de = `${ate.slice(0, 8)}01`;
      break;
    }
    case "proximos":
      ate = somarDias(hoje, 30);
      break;
    case "personalizado":
      de = okData(v("de")) ? v("de") : somarDias(hoje, -29);
      ate = okData(v("ate")) ? v("ate") : hoje;
      if (ate < de) [de, ate] = [ate, de];
      break;
    default:
      de = somarDias(hoje, -29);
  }
  return {
    de,
    ate,
    periodo,
    servico: isUuid(v("servico")) ? v("servico") : null,
    profissional: isUuid(v("profissional")) ? v("profissional") : null,
    status: (STATUS_VALIDOS as readonly string[]).includes(v("status")) ? v("status") : null,
    cliente: isUuid(v("cliente")) ? v("cliente") : null,
    busca: v("q").trim().slice(0, 80),
  };
}

export function filtrosParaQuery(f: Filtros, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.periodo === "personalizado") {
    p.set("de", f.de);
    p.set("ate", f.ate);
  } else p.set("periodo", f.periodo);
  if (f.servico) p.set("servico", f.servico);
  if (f.profissional) p.set("profissional", f.profissional);
  if (f.status) p.set("status", f.status);
  if (f.cliente) p.set("cliente", f.cliente);
  if (f.busca) p.set("q", f.busca);
  for (const [k, val] of Object.entries(extra)) p.set(k, val);
  return p.toString();
}

/** Monta o WHERE de agendamentos com todos os filtros. Sempre restrito à empresa. */
export function whereAgendamentos(empresaId: string, f: Filtros, inicio: Date, fim: Date, alias = "a") {
  const params: unknown[] = [empresaId, inicio, fim];
  const cond = [`${alias}.empresa_id = $1`, `${alias}.inicio >= $2`, `${alias}.inicio < $3`];
  if (f.servico) {
    params.push(f.servico);
    cond.push(`${alias}.servico_id = $${params.length}`);
  }
  if (f.profissional) {
    params.push(f.profissional);
    cond.push(`${alias}.profissional_id = $${params.length}`);
  }
  if (f.status) {
    params.push(f.status);
    cond.push(`${alias}.status = $${params.length}`);
  }
  if (f.cliente) {
    params.push(f.cliente);
    cond.push(`${alias}.cliente_id = $${params.length}`);
  }
  if (f.busca) {
    params.push(f.busca);
    const n = params.length;
    cond.push(
      `exists (select 1 from cliente cb where cb.id = ${alias}.cliente_id and (cb.nome ilike '%' || $${n} || '%' or cb.telefone like '%' || nullif(regexp_replace($${n}, '\\D', '', 'g'), '') || '%'))`,
    );
  }
  return { where: cond.join(" and "), params };
}

/** Valor do atendimento que a barbearia recebe (preço menos a parte coberta por plano mensal). */
export const VALOR = (alias = "a") => `(${alias}.preco_centavos - ${alias}.valor_coberto_centavos)`;
/** Saldo ainda não recebido de um atendimento (nunca negativo). */
export const SALDO = (alias = "a") =>
  `greatest(${VALOR(alias)} - coalesce((select sum(pg.valor_centavos) from pagamento pg where pg.agendamento_id = ${alias}.id and pg.status = 'pago'),0), 0)`;

interface Totais {
  agendamentos: number;
  concluidos: number;
  concluidos_pagos: number;
  cancelados: number;
  faltas: number;
  realizado: number;
  previsto: number;
  clientes_unicos: number;
  atendidos: number;
  a_receber: number;
  cobertos: number;
  valor_coberto: number;
}

async function totais(empresaId: string, f: Filtros, ini: Date, fim: Date): Promise<Totais> {
  const { where, params } = whereAgendamentos(empresaId, f, ini, fim);
  const [t] = await q<Totais>(
    `select count(*) filter (where a.status not in ('cancelado'))::int as agendamentos,
            count(*) filter (where a.status = 'concluido')::int as concluidos,
            count(*) filter (where a.status = 'concluido' and a.preco_centavos > a.valor_coberto_centavos)::int as concluidos_pagos,
            count(*) filter (where a.status = 'cancelado')::int as cancelados,
            count(*) filter (where a.status = 'faltou')::int as faltas,
            coalesce(sum(${VALOR()}) filter (where a.status = 'concluido'),0)::int as realizado,
            coalesce(sum(${VALOR()}) filter (where a.status in ('confirmado','concluido')),0)::int as previsto,
            count(distinct a.cliente_id) filter (where a.status not in ('cancelado'))::int as clientes_unicos,
            count(distinct a.cliente_id) filter (where a.status = 'concluido')::int as atendidos,
            coalesce(sum(${SALDO()}) filter (where a.status = 'concluido'),0)::int as a_receber,
            count(*) filter (where a.valor_coberto_centavos > 0 and a.status <> 'cancelado')::int as cobertos,
            coalesce(sum(a.valor_coberto_centavos) filter (where a.status <> 'cancelado'),0)::int as valor_coberto
     from agendamento a where ${where}`,
    params,
  );
  return t;
}

/** Variação % vs. período anterior; null quando não há base de comparação (anterior = 0). */
const variacao = (atual: number, anterior: number): number | null =>
  anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 100);

export async function dashboard(empresaId: string, f: Filtros) {
  const cfg = await configAgendamento(empresaId);
  const fuso = cfg.fuso_horario;
  const ini = instanteLocal(f.de, 0, fuso);
  const fim = instanteLocal(somarDias(f.ate, 1), 0, fuso);
  const dias = Math.round((fim.getTime() - ini.getTime()) / 86400000);
  const iniAnt = instanteLocal(somarDias(f.de, -dias), 0, fuso);

  const { where, params } = whereAgendamentos(empresaId, f, ini, fim);
  const [atual, anterior, serie, topServicos, topClientes, porStatus, novosClientes, novosAnt, proximos] = await Promise.all([
    totais(empresaId, f, ini, fim),
    totais(empresaId, f, iniAnt, ini),
    q<{ dia: string; valor: number; qtd: number }>(
      `select to_char(a.inicio at time zone $${params.length + 1}, 'YYYY-MM-DD') as dia,
              coalesce(sum(${VALOR()}) filter (where a.status in ('confirmado','concluido')),0)::int as valor,
              count(*) filter (where a.status not in ('cancelado'))::int as qtd
       from agendamento a where ${where} group by 1 order by 1`,
      [...params, fuso],
    ),
    q<{ id: string; nome: string; qtd: number; valor: number }>(
      `select s.id, s.nome, count(*)::int as qtd, coalesce(sum(${VALOR()}) filter (where a.status in ('confirmado','concluido')),0)::int as valor
       from agendamento a join servico s on s.id = a.servico_id
       where ${where} and a.status not in ('cancelado') group by s.id, s.nome order by qtd desc, valor desc limit 6`,
      params,
    ),
    q<{ id: string; nome: string; telefone: string; visitas: number; valor: number }>(
      `select c.id, c.nome, c.telefone, count(*)::int as visitas,
              coalesce(sum(${VALOR()}) filter (where a.status in ('confirmado','concluido')),0)::int as valor
       from agendamento a join cliente c on c.id = a.cliente_id
       where ${where} and a.status not in ('cancelado','faltou') group by c.id order by valor desc, visitas desc limit 5`,
      params,
    ),
    q<{ status: string; qtd: number }>(`select a.status, count(*)::int as qtd from agendamento a where ${where} group by 1`, params),
    q<{ n: number }>(`select count(*)::int as n from cliente where empresa_id = $1 and criado_em >= $2 and criado_em < $3`, [empresaId, ini, fim]),
    q<{ n: number }>(`select count(*)::int as n from cliente where empresa_id = $1 and criado_em >= $2 and criado_em < $3`, [
      empresaId,
      iniAnt,
      ini,
    ]),
    q<{ id: string; inicio: Date; status: string; cliente: string; servico: string; profissional: string }>(
      `select a.id, a.inicio, a.status, c.nome as cliente, s.nome as servico, p.nome as profissional
       from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id join profissional p on p.id = a.profissional_id
       where a.empresa_id = $1 and a.inicio >= now() and a.status in ('confirmado','pendente_pagamento')
         and ($2::uuid is null or a.profissional_id = $2::uuid) and ($3::uuid is null or a.servico_id = $3::uuid)
       order by a.inicio limit 6`,
      [empresaId, f.profissional, f.servico],
    ),
  ]);

  // série completa (dias sem movimento = 0) para o gráfico não "pular" datas
  const mapa = new Map(serie.map((s) => [s.dia, s]));
  const serieCompleta: { dia: string; valor: number; qtd: number }[] = [];
  for (let d = f.de; d <= f.ate; d = somarDias(d, 1)) serieCompleta.push(mapa.get(d) ?? { dia: d, valor: 0, qtd: 0 });

  // recorrentes: 3+ visitas concluídas nos últimos 90 dias (não depende de plano)
  const [{ recorrentes }] = await q<{ recorrentes: number }>(
    `select count(*)::int as recorrentes from (
       select cliente_id from agendamento where empresa_id = $1 and status = 'concluido' and inicio >= now() - interval '90 days' and inicio <= now()
       group by cliente_id having count(*) >= ${RECORRENTE_VISITAS}) x`,
    [empresaId],
  );
  // ticket médio só sobre atendimentos com valor a receber (cobertos 100% pelo plano não entram)
  const ticket = atual.concluidos_pagos ? Math.round(atual.realizado / atual.concluidos_pagos) : 0;
  const ticketAnt = anterior.concluidos_pagos ? Math.round(anterior.realizado / anterior.concluidos_pagos) : 0;
  const base = atual.agendamentos + atual.cancelados;
  const taxaPerda = base ? Math.round(((atual.cancelados + atual.faltas) / base) * 100) : 0;

  return {
    fuso,
    dias,
    atual,
    kpis: {
      realizado: { valor: atual.realizado, var: variacao(atual.realizado, anterior.realizado) },
      previsto: { valor: atual.previsto, var: variacao(atual.previsto, anterior.previsto) },
      agendamentos: { valor: atual.agendamentos, var: variacao(atual.agendamentos, anterior.agendamentos) },
      ticket: { valor: ticket, var: variacao(ticket, ticketAnt) },
      novosClientes: { valor: novosClientes[0].n, var: variacao(novosClientes[0].n, novosAnt[0].n) },
      atendidos: { valor: atual.atendidos, var: variacao(atual.atendidos, anterior.atendidos) },
      aReceber: atual.a_receber,
      recorrentes,
      taxaPerda,
    },
    serie: serieCompleta,
    topServicos,
    topClientes,
    porStatus: Object.fromEntries(porStatus.map((s) => [s.status, s.qtd])) as Record<string, number>,
    proximos,
  };
}

/** Linhas do CSV de agendamentos (usa o WHERE de whereAgendamentos, sempre restrito à empresa). */
export const linhasExportacao = (where: string, params: unknown[]) =>
  q<Record<string, unknown>>(
    `select a.inicio, c.nome as cliente, c.telefone, s.nome as servico, pr.nome as profissional, a.preco_centavos, a.valor_coberto_centavos, a.status, a.origem,
            coalesce((select sum(valor_centavos) from pagamento p where p.agendamento_id = a.id and p.status='pago'),0)::int as pago
     from agendamento a join cliente c on c.id = a.cliente_id join servico s on s.id = a.servico_id join profissional pr on pr.id = a.profissional_id
     where ${where} order by a.inicio limit 20000`,
    params,
  );
