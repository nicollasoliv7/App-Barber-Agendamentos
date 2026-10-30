import "server-only";
import { q, q1 } from "../db";

/**
 * Consultas somente-leitura da régua de cobrança automática.
 * Escrita fica em src/lib/repositorios/cobrancas-mensalidade.ts.
 */

// -------------------------------------------------------------------------
// Empresas e cobranças para o cron
// -------------------------------------------------------------------------

export interface EmpresaParaCobranca {
  empresa_id: string;
  fuso_horario: string;
  cobranca_dias_antes: number;
  cobranca_dias_depois: number;
}

/** Empresas elegíveis para a régua nesta execução do cron. */
export async function empresasParaCobranca(): Promise<EmpresaParaCobranca[]> {
  return q<EmpresaParaCobranca>(
    `select wc.empresa_id, ca.fuso_horario, wc.cobranca_dias_antes, wc.cobranca_dias_depois
     from whatsapp_conexao wc
     join config_agendamento ca on ca.empresa_id = wc.empresa_id
     where wc.cobrancas_ativas = true
       and wc.modelo_cobranca is not null
       and wc.status = 'conectado'
       and exists (select 1 from config_pix cp where cp.empresa_id = wc.empresa_id)`,
    [],
  );
}

export interface CobrancaParaRegua {
  cobranca_id: string;
  empresa_id: string;
  assinatura_id: string;
  vencimento: string; // YYYY-MM-DD
  valor_centavos: number;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone: string;
  plano_nome: string;
  cobranca_pausada: boolean;
}

/**
 * Cobranças pendentes de uma empresa prontas para régua (LIMIT 50).
 * Já exclui assinaturas canceladas; opt-out e pausa são checados no loop.
 */
export async function cobrancasPendentesParaRegua(empresaId: string): Promise<CobrancaParaRegua[]> {
  return q<CobrancaParaRegua>(
    `select ac.id as cobranca_id, ac.empresa_id, ac.assinatura_id,
            ac.vencimento::text as vencimento, ac.valor_centavos,
            a.cliente_id, a.cobranca_pausada,
            c.nome as cliente_nome, c.telefone as cliente_telefone,
            p.nome as plano_nome
     from assinatura_cobranca ac
     join assinatura a  on a.id = ac.assinatura_id and a.empresa_id = ac.empresa_id
     join cliente c     on c.id = a.cliente_id    and c.empresa_id = ac.empresa_id
     join plano p       on p.id = a.plano_id      and p.empresa_id = ac.empresa_id
     where ac.empresa_id = $1
       and ac.status = 'pendente'
       and a.status <> 'cancelada'
     order by ac.vencimento asc
     limit 50`,
    [empresaId],
  );
}

/** Verifica se uma etapa automática já foi registrada para esta cobrança. */
export async function etapaJaRegistrada(cobrancaId: string, etapa: "antes" | "vencimento" | "depois"): Promise<boolean> {
  const r = await q1(
    `select 1 from cobranca_mensalidade_etapa where cobranca_id = $1 and etapa = $2`,
    [cobrancaId, etapa],
  );
  return !!r;
}

/** Verifica se a etapa manual já foi enviada hoje para esta cobrança. */
export async function etapaManualHojeJaRegistrada(cobrancaId: string, dia: string): Promise<boolean> {
  const r = await q1(
    `select 1 from cobranca_mensalidade_etapa where cobranca_id = $1 and dia = $2::date and etapa = 'manual'`,
    [cobrancaId, dia],
  );
  return !!r;
}

// -------------------------------------------------------------------------
// UI: próximos envios e histórico
// -------------------------------------------------------------------------

export interface ProximoEnvio {
  cobranca_id: string;
  assinatura_id: string;
  cliente_nome: string;
  plano_nome: string;
  vencimento: string;
  valor_centavos: number;
  etapas_enviadas: string[];
}

/** Próximos envios da régua para a empresa (até 30 dias à frente). */
export async function proximosEnvios(empresaId: string): Promise<ProximoEnvio[]> {
  return q<ProximoEnvio>(
    `select ac.id as cobranca_id, ac.assinatura_id, c.nome as cliente_nome,
            p.nome as plano_nome, ac.vencimento::text as vencimento, ac.valor_centavos,
            coalesce(array_agg(ce.etapa order by ce.criado_em) filter (where ce.etapa is not null), '{}') as etapas_enviadas
     from assinatura_cobranca ac
     join assinatura a   on a.id = ac.assinatura_id and a.empresa_id = ac.empresa_id
     join cliente c      on c.id = a.cliente_id    and c.empresa_id = ac.empresa_id
     join plano p        on p.id = a.plano_id      and p.empresa_id = ac.empresa_id
     left join cobranca_mensalidade_etapa ce on ce.cobranca_id = ac.id
     where ac.empresa_id = $1
       and ac.status = 'pendente'
       and a.status <> 'cancelada'
       and ac.vencimento <= current_date + 30
     group by ac.id, ac.assinatura_id, c.nome, p.nome, ac.vencimento, ac.valor_centavos
     order by ac.vencimento asc
     limit 100`,
    [empresaId],
  );
}

export interface HistoricoEtapa {
  etapa: string;
  dia: string;
  status: string | null;
  criado_em: string;
}

/** Histórico de etapas enviadas para uma mensalidade específica. */
export async function historicoEtapas(cobrancaId: string, empresaId: string): Promise<HistoricoEtapa[]> {
  return q<HistoricoEtapa>(
    `select ce.etapa, ce.dia::text as dia,
            n.status, ce.criado_em::text as criado_em
     from cobranca_mensalidade_etapa ce
     left join notificacao n on n.id = ce.notificacao_id
     where ce.cobranca_id = $1 and ce.empresa_id = $2
     order by ce.criado_em desc`,
    [cobrancaId, empresaId],
  );
}

/** Verifica se o cliente tem opt-out de cobrança nesta empresa. */
export async function clienteTemOptout(empresaId: string, clienteId: string): Promise<boolean> {
  const r = await q1(
    `select 1 from assinatura_optout_cobranca where empresa_id = $1 and cliente_id = $2`,
    [empresaId, clienteId],
  );
  return !!r;
}
