import "server-only";
import { q } from "./db";
import { configAgendamento } from "./empresa";
import { diaLocal, instanteLocal, somarDias } from "./tempo";
import { isUuid } from "./validacao";

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

interface Totais {
  agendamentos: number;
  concluidos: number;
  cancelados: number;
  faltas: number;
  realizado: number;
  previsto: number;
  clientes_unicos: number;
}

async function totais(empresaId: string, f: Filtros, ini: Date, fim: Date): Promise<Totais> {
  const { where, params } = whereAgendamentos(empresaId, f, ini, fim);
  const [t] = await q<Totais>(
    `select count(*) filter (where a.status not in ('cancelado'))::int as agendamentos,
            count(*) filter (where a.status = 'concluido')::int as concluidos,
            count(*) filter (where a.status = 'cancelado')::int as cancelados,
            count(*) filter (where a.status = 'faltou')::int as faltas,
            coalesce(sum(a.preco_centavos) filter (where a.status = 'concluido'),0)::int as realizado,
            coalesce(sum(a.preco_centavos) filter (where a.status in ('confirmado','concluido')),0)::int as previsto,
            count(distinct a.cliente_id) filter (where a.status not in ('cancelado'))::int as clientes_unicos
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
              coalesce(sum(a.preco_centavos) filter (where a.status in ('confirmado','concluido')),0)::int as valor,
              count(*) filter (where a.status not in ('cancelado'))::int as qtd
       from agendamento a where ${where} group by 1 order by 1`,
      [...params, fuso],
    ),
    q<{ id: string; nome: string; qtd: number; valor: number }>(
      `select s.id, s.nome, count(*)::int as qtd, coalesce(sum(a.preco_centavos) filter (where a.status in ('confirmado','concluido')),0)::int as valor
       from agendamento a join servico s on s.id = a.servico_id
       where ${where} and a.status not in ('cancelado') group by s.id, s.nome order by qtd desc, valor desc limit 6`,
      params,
    ),
    q<{ id: string; nome: string; telefone: string; visitas: number; valor: number }>(
      `select c.id, c.nome, c.telefone, count(*)::int as visitas,
              coalesce(sum(a.preco_centavos) filter (where a.status in ('confirmado','concluido')),0)::int as valor
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

  const ticket = atual.concluidos ? Math.round(atual.realizado / atual.concluidos) : 0;
  const ticketAnt = anterior.concluidos ? Math.round(anterior.realizado / anterior.concluidos) : 0;
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
      taxaPerda,
    },
    serie: serieCompleta,
    topServicos,
    topClientes,
    porStatus: Object.fromEntries(porStatus.map((s) => [s.status, s.qtd])) as Record<string, number>,
    proximos,
  };
}
