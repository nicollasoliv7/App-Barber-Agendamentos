import "server-only";
import { db, type Executor } from "./db";
import { configAgendamento } from "./empresa";
import { diaLocal, diaSemana, instanteLocal, somarDias } from "./tempo";
import { ErroNegocio, type ConfigAgendamento } from "./tipos";

interface Opcoes {
  /** Painel: ignora antecedência mínima e janela máxima (R25). */
  ignorarAntecedencia?: boolean;
  /** Remarcação: o próprio agendamento não conta como conflito. */
  ignorarAgendamentoId?: string;
  agora?: Date;
}

interface Intervalo {
  inicio: number; // ms
  fim: number;
}

/** R18: expira cobranças Pix e agendamentos pendentes vencidos (execução preguiçosa). */
export async function expirarPendentes(t?: Executor) {
  const ex = t ?? (await db());
  await ex.query(`update pagamento set status = 'expirado' where status = 'pendente' and expira_em is not null and expira_em < now()`);
  const cancelados = await ex.query<{ id: string }>(
    `update agendamento set status = 'cancelado', cancelado_por = 'sistema'
     where status = 'pendente_pagamento' and expira_em is not null and expira_em < now()
     returning id`,
  );
  return cancelados.length;
}

async function carregarBase(t: Executor, empresaId: string, servicoId: string, profissionalId: string) {
  const [serv] = await t.query<{ duracao_min: number; ativo: boolean }>(
    `select duracao_min, ativo from servico where id = $1 and empresa_id = $2`,
    [servicoId, empresaId],
  );
  if (!serv) throw new ErroNegocio("Serviço não encontrado", 404);
  const [prof] = await t.query<{ ok: boolean }>(
    `select p.ativo and exists(select 1 from profissional_servico ps where ps.profissional_id = p.id and ps.servico_id = $2) as ok
     from profissional p where p.id = $1 and p.empresa_id = $3`,
    [profissionalId, servicoId, empresaId],
  );
  if (!prof?.ok) throw new ErroNegocio("Profissional não atende este serviço", 404);
  const faixas = await t.query<{ dia_semana: number; inicio_min: number; fim_min: number }>(
    `select dia_semana, inicio_min, fim_min from disponibilidade where profissional_id = $1 order by inicio_min`,
    [profissionalId],
  );
  return { duracao: serv.duracao_min, servicoAtivo: serv.ativo, faixas };
}

async function carregarOcupados(
  t: Executor,
  empresaId: string,
  profissionalId: string,
  de: Date,
  ate: Date,
  ignorarId?: string,
): Promise<Intervalo[]> {
  const ags = await t.query<{ inicio: Date; fim: Date }>(
    `select inicio, fim from agendamento
     where profissional_id = $1 and inicio < $3 and fim > $2
       and (status in ('confirmado','concluido') or (status = 'pendente_pagamento' and (expira_em is null or expira_em > now())))
       and ($4::uuid is null or id <> $4::uuid)`,
    [profissionalId, de, ate, ignorarId ?? null],
  );
  const bls = await t.query<{ inicio: Date; fim: Date }>(
    `select inicio, fim from bloqueio
     where empresa_id = $1 and (profissional_id is null or profissional_id = $2) and inicio < $4 and fim > $3`,
    [empresaId, profissionalId, de, ate],
  );
  return [...ags, ...bls].map((x) => ({ inicio: new Date(x.inicio).getTime(), fim: new Date(x.fim).getTime() }));
}

function slotsDoDia(
  dia: string,
  base: Awaited<ReturnType<typeof carregarBase>>,
  ocupados: Intervalo[],
  cfg: ConfigAgendamento,
  limiteInicio: number,
): number[] {
  const dow = diaSemana(dia);
  const out: number[] = [];
  for (const f of base.faixas.filter((x) => x.dia_semana === dow)) {
    for (let m = f.inicio_min; m + base.duracao <= f.fim_min; m += cfg.intervalo_slots_min) {
      const ini = instanteLocal(dia, m, cfg.fuso_horario).getTime();
      const fim = ini + base.duracao * 60000;
      if (ini < limiteInicio) continue; // R4
      if (ocupados.some((o) => o.inicio < fim && o.fim > ini)) continue; // R3
      if (!out.includes(m)) out.push(m);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Horários livres (minutos locais) num dia. R1–R4, R8. */
export async function horariosLivres(
  empresaId: string,
  servicoId: string,
  profissionalId: string,
  dia: string,
  opcoes: Opcoes = {},
  t?: Executor,
): Promise<number[]> {
  const ex = t ?? (await db());
  if (!t) await expirarPendentes(ex);
  const cfg = await configAgendamento(empresaId, ex);
  const base = await carregarBase(ex, empresaId, servicoId, profissionalId);
  const agora = opcoes.agora ?? new Date();
  const hoje = diaLocal(agora, cfg.fuso_horario);
  if (!opcoes.ignorarAntecedencia) {
    if (dia < hoje || dia > somarDias(hoje, cfg.janela_max_dias)) return []; // R5
  }
  const de = instanteLocal(dia, 0, cfg.fuso_horario);
  const ate = instanteLocal(somarDias(dia, 1), 0, cfg.fuso_horario);
  const ocupados = await carregarOcupados(ex, empresaId, profissionalId, de, ate, opcoes.ignorarAgendamentoId);
  const limite = opcoes.ignorarAntecedencia ? -Infinity : agora.getTime() + cfg.antecedencia_min_min * 60000;
  return slotsDoDia(dia, base, ocupados, cfg, limite);
}

/** Dias com pelo menos um horário livre (R6), dentro da janela (R5). */
export async function diasDisponiveis(
  empresaId: string,
  servicoId: string,
  profissionalId: string,
  opcoes: Opcoes & { de?: string; quantidade?: number } = {},
): Promise<string[]> {
  const ex = await db();
  await expirarPendentes(ex);
  const cfg = await configAgendamento(empresaId, ex);
  const base = await carregarBase(ex, empresaId, servicoId, profissionalId);
  const agora = opcoes.agora ?? new Date();
  const hoje = diaLocal(agora, cfg.fuso_horario);
  const inicio = opcoes.de && opcoes.de > hoje ? opcoes.de : hoje;
  const ultimo = somarDias(hoje, cfg.janela_max_dias);
  const qtd = opcoes.quantidade ?? cfg.janela_max_dias + 1;
  const dias: string[] = [];
  for (let i = 0; i < qtd; i++) {
    const d = somarDias(inicio, i);
    if (d > ultimo) break;
    dias.push(d);
  }
  if (!dias.length) return [];
  const de = instanteLocal(dias[0], 0, cfg.fuso_horario);
  const ate = instanteLocal(somarDias(dias[dias.length - 1], 1), 0, cfg.fuso_horario);
  const ocupados = await carregarOcupados(ex, empresaId, profissionalId, de, ate, opcoes.ignorarAgendamentoId);
  const limite = agora.getTime() + cfg.antecedencia_min_min * 60000;
  return dias.filter((d) => slotsDoDia(d, base, ocupados, cfg, limite).length > 0);
}

/** Profissionais ativos que fazem o serviço (e atendem na unidade, se informada). R7, R7b */
export async function profissionaisElegiveis(
  ex: Executor,
  empresaId: string,
  servicoId: string,
  unidadeId: string | null,
): Promise<{ id: string; nome: string }[]> {
  return ex.query<{ id: string; nome: string }>(
    `select p.id, p.nome from profissional p join profissional_servico ps on ps.profissional_id = p.id
     where p.empresa_id = $1 and p.ativo and ps.servico_id = $2
       and ($3::uuid is null or p.unidade_id is null or p.unidade_id = $3::uuid)
     order by p.nome`,
    [empresaId, servicoId, unidadeId],
  );
}

/** "Sem preferência": dias em que QUALQUER profissional elegível tem horário. */
export async function diasDisponiveisQualquer(empresaId: string, servicoId: string, unidadeId: string | null): Promise<string[]> {
  const ex = await db();
  const profs = await profissionaisElegiveis(ex, empresaId, servicoId, unidadeId);
  const todos = new Set<string>();
  for (const p of profs) for (const d of await diasDisponiveis(empresaId, servicoId, p.id)) todos.add(d);
  return [...todos].sort();
}

/** "Sem preferência": união dos horários livres dos profissionais elegíveis. */
export async function horariosLivresQualquer(empresaId: string, servicoId: string, dia: string, unidadeId: string | null): Promise<number[]> {
  const ex = await db();
  const profs = await profissionaisElegiveis(ex, empresaId, servicoId, unidadeId);
  const todos = new Set<number>();
  for (const p of profs) for (const m of await horariosLivres(empresaId, servicoId, p.id, dia)) todos.add(m);
  return [...todos].sort((a, b) => a - b);
}
