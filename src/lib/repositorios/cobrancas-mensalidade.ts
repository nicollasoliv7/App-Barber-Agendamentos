import "server-only";
import { q, q1, type Executor } from "../db";
import type { DadosPix } from "../pix-brcode";

/**
 * Escrita na régua de cobrança automática de mensalidade.
 * Leituras ficam em src/lib/consultas/cobrancas-mensalidade.ts.
 */

// -------------------------------------------------------------------------
// Etapas de envio (idempotência)
// -------------------------------------------------------------------------

/** Registra uma etapa automática (antes/vencimento/depois). Silencioso em conflito. */
export async function registrarEtapaAutomatica(
  t: Executor,
  empresaId: string,
  cobrancaId: string,
  etapa: "antes" | "vencimento" | "depois",
  dia: string,
  notificacaoId: string,
) {
  await t.query(
    `insert into cobranca_mensalidade_etapa (empresa_id, cobranca_id, etapa, dia, notificacao_id)
     values ($1,$2,$3,$4::date,$5)
     on conflict (cobranca_id, etapa) where etapa <> 'manual' do nothing`,
    [empresaId, cobrancaId, etapa, dia, notificacaoId],
  );
}

/** Registra etapa manual ("Cobrar agora"): uma por cobrança por dia. Silencioso em conflito. */
export async function registrarEtapaManual(
  t: Executor,
  empresaId: string,
  cobrancaId: string,
  dia: string,
  notificacaoId: string,
) {
  await t.query(
    `insert into cobranca_mensalidade_etapa (empresa_id, cobranca_id, etapa, dia, notificacao_id)
     values ($1,$2,'manual',$3::date,$4)
     on conflict (cobranca_id, dia) where etapa = 'manual' do nothing`,
    [empresaId, cobrancaId, dia, notificacaoId],
  );
}

// -------------------------------------------------------------------------
// Opt-out de cobrança (R87)
// -------------------------------------------------------------------------

/** Registra opt-out de cobrança para o cliente na empresa. Silencioso se já existir. */
export async function registrarOptout(empresaId: string, clienteId: string) {
  await q(
    `insert into assinatura_optout_cobranca (empresa_id, cliente_id) values ($1,$2) on conflict do nothing`,
    [empresaId, clienteId],
  );
}

/** Remove opt-out (reativação manual pelo barbeiro). */
export async function removerOptout(empresaId: string, clienteId: string) {
  await q(`delete from assinatura_optout_cobranca where empresa_id = $1 and cliente_id = $2`, [empresaId, clienteId]);
}

/** Verifica se o cliente está com opt-out de cobrança nesta empresa. */
export async function optoutExiste(empresaId: string, clienteId: string): Promise<boolean> {
  const r = await q1(`select 1 from assinatura_optout_cobranca where empresa_id = $1 and cliente_id = $2`, [empresaId, clienteId]);
  return !!r;
}

// -------------------------------------------------------------------------
// Pausa por assinante
// -------------------------------------------------------------------------

export async function pausarCobrancaAssinante(empresaId: string, assinaturaId: string, pausar: boolean) {
  await q(`update assinatura set cobranca_pausada = $3 where id = $2 and empresa_id = $1`, [empresaId, assinaturaId, pausar]);
}

// -------------------------------------------------------------------------
// Configuração Pix da barbearia
// -------------------------------------------------------------------------

export async function salvarConfigPix(empresaId: string, d: DadosPix) {
  await q(
    `insert into config_pix (empresa_id, tipo, chave, recebedor, cidade, atualizado_em)
     values ($1,$2,$3,$4,$5,now())
     on conflict (empresa_id) do update
       set tipo = excluded.tipo, chave = excluded.chave,
           recebedor = excluded.recebedor, cidade = excluded.cidade,
           atualizado_em = now()`,
    [empresaId, d.tipo, d.chave.trim(), d.recebedor.trim(), d.cidade.trim()],
  );
}

export async function configPix(empresaId: string): Promise<DadosPix | null> {
  return q1<DadosPix>(`select tipo, chave, recebedor, cidade from config_pix where empresa_id = $1`, [empresaId]);
}

// -------------------------------------------------------------------------
// Opt-out por número de telefone (usado pelo webhook de mensagens recebidas)
// -------------------------------------------------------------------------

/**
 * Processa opt-out quando o cliente responde "PARAR".
 * phoneNumberId identifica a empresa; telefoneDe é o número que respondeu.
 */
export async function processarOptoutPorTelefone(phoneNumberId: string, telefoneDe: string) {
  const tel = telefoneDe.replace(/\D/g, "").replace(/^55/, ""); // remove código BR
  const empresa = await q1<{ empresa_id: string }>(
    `select empresa_id from whatsapp_conexao where phone_number_id = $1`,
    [phoneNumberId],
  );
  if (!empresa) return;
  const cliente = await q1<{ id: string }>(
    `select id from cliente where empresa_id = $1 and regexp_replace(telefone,'\\D','','g') like $2`,
    [empresa.empresa_id, `%${tel}`],
  );
  if (!cliente) return;
  await registrarOptout(empresa.empresa_id, cliente.id);
}
