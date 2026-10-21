import "server-only";
import type { Executor } from "./db";

/**
 * Notificações: gravamos na tabela `notificacao` e "enviamos".
 * Sem provedor configurado (WHATSAPP_API_URL), o envio é simulado no console,
 * e a mensagem fica visível no painel em Notificações.
 */
export async function notificar(
  t: Executor,
  n: { empresaId: string; agendamentoId?: string | null; canal?: "whatsapp" | "sms"; destino: string; mensagem: string },
) {
  const [row] = await t.query<{ id: string }>(
    `insert into notificacao (empresa_id, agendamento_id, canal, destino, mensagem) values ($1,$2,$3,$4,$5) returning id`,
    [n.empresaId, n.agendamentoId ?? null, n.canal ?? "whatsapp", n.destino, n.mensagem],
  );
  const url = process.env.WHATSAPP_API_URL;
  if (!url) {
    console.log(`[notificação ${n.canal ?? "whatsapp"} → ${n.destino}] ${n.mensagem}`);
    await t.query(`update notificacao set status = 'enviado', enviado_em = now() where id = $1`, [row.id]);
    return;
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN ?? ""}` },
      body: JSON.stringify({ to: n.destino, message: n.mensagem }),
    });
    await t.query(`update notificacao set status = $2, enviado_em = now() where id = $1`, [row.id, r.ok ? "enviado" : "falhou"]);
  } catch {
    await t.query(`update notificacao set status = 'falhou' where id = $1`, [row.id]);
  }
}
