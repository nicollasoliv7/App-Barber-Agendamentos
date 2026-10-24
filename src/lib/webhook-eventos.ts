import "server-only";
import { q, q1 } from "./db";

/**
 * Registro de eventos de webhook para não processar duas vezes o mesmo evento.
 * A AbacatePay manda o mesmo `id` em todas as retentativas de um evento.
 * O evento só conta como processado depois de concluído com sucesso: se o
 * processamento falhar, a próxima retentativa tenta de novo.
 */

const PROVEDOR = "abacatepay";

/** Registra o recebimento. Retorna true se este evento já foi processado antes. */
export async function eventoJaProcessado(eventoId: string, evento: string, devMode: boolean): Promise<boolean> {
  await q(
    `insert into webhook_evento (provedor, evento_id, evento, dev_mode) values ($1,$2,$3,$4)
     on conflict (provedor, evento_id) do nothing`,
    [PROVEDOR, eventoId, evento, devMode],
  );
  const r = await q1<{ processado_em: Date | null }>(
    `select processado_em from webhook_evento where provedor = $1 and evento_id = $2`,
    [PROVEDOR, eventoId],
  );
  return !!r?.processado_em;
}

export async function marcarEventoProcessado(eventoId: string, resultado: string): Promise<void> {
  await q(
    `update webhook_evento set processado_em = now(), resultado = $3
     where provedor = $1 and evento_id = $2 and processado_em is null`,
    [PROVEDOR, eventoId, resultado.slice(0, 200)],
  );
}
