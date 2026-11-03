import "server-only";
import { q, q1, type Executor } from "./db";
import { log } from "./log";

/**
 * Notificações Push (Web Push / VAPID) para o barbeiro.
 *
 * 1. `notificarPushEmpresa()` grava em `notificacao` (canal='push') DENTRO da transação.
 * 2. Depois do commit, `despacharPush()` envia para todos os aparelhos inscritos
 *    daquela empresa via Web Push. Falha nunca bloqueia o agendamento (R88 / R56).
 * 3. Endpoints que retornam 404/410 são removidos de `push_inscricao` automaticamente (R89).
 */

export function vapidPublico(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

export async function notificarPushEmpresa(
  t: Executor,
  n: {
    empresaId: string;
    agendamentoId?: string | null;
    titulo: string;
    corpo: string;
    tipo?: string;
  },
): Promise<void> {
  const tipo = n.tipo ?? "aviso_empresa";
  const [row] = await t.query<{ id: string }>(
    `insert into notificacao (empresa_id, agendamento_id, canal, destino, mensagem, tipo)
     values ($1,$2,'push','push',$3,$4) returning id`,
    [n.empresaId, n.agendamentoId ?? null, n.corpo, tipo],
  );
  const payload = JSON.stringify({ title: n.titulo, body: n.corpo, url: "/painel/agenda", agendamentoId: n.agendamentoId ?? null, tipo });
  if (t.depois) t.depois(() => despacharPush(row.id, payload));
  else await despacharPush(row.id, payload);
}

async function despacharPush(notificacaoId: string, payload: string): Promise<void> {
  // "trava" a linha: só quem muda de pendente → atualizado_em segue (evita envio duplicado)
  const n = await q1<{ id: string; empresa_id: string }>(
    `update notificacao set atualizado_em = now()
     where id = $1 and status = 'pendente' and canal = 'push'
       and (atualizado_em is null or atualizado_em < now() - interval '2 minutes')
     returning id, empresa_id`,
    [notificacaoId],
  );
  if (!n) return;

  const inscricoes = await q<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    `select id, endpoint, p256dh, auth from push_inscricao where empresa_id = $1`,
    [n.empresa_id],
  );

  if (!inscricoes.length) {
    await q(
      `update notificacao set status = 'nao_enviado', erro = 'Nenhum aparelho inscrito', atualizado_em = now() where id = $1`,
      [notificacaoId],
    );
    return;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    await q(
      `update notificacao set status = 'nao_enviado', erro = 'Chaves VAPID não configuradas (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)', atualizado_em = now() where id = $1`,
      [notificacaoId],
    );
    return;
  }

  const subject = process.env.VAPID_SUBJECT ?? process.env.APP_URL ?? "mailto:suporte@agendou.app";
  const webpush = await import("web-push");
  webpush.setVapidDetails(subject, publicKey, privateKey);

  let enviados = 0;
  const erros: string[] = [];

  await Promise.all(
    inscricoes.map(async (ins) => {
      try {
        await webpush.sendNotification({ endpoint: ins.endpoint, keys: { p256dh: ins.p256dh, auth: ins.auth } }, payload);
        enviados++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode ?? 0;
        if (code === 404 || code === 410) {
          await q(`delete from push_inscricao where id = $1`, [ins.id]);
        } else {
          erros.push(e instanceof Error ? e.message : "erro desconhecido");
          log.erro("[push] envio falhou:", e);
        }
      }
    }),
  );

  if (enviados > 0) {
    await q(`update notificacao set status = 'aceito', atualizado_em = now() where id = $1`, [notificacaoId]);
  } else if (erros.length > 0) {
    await q(
      `update notificacao set status = 'falhou', erro = $2, atualizado_em = now() where id = $1`,
      [notificacaoId, erros[0]],
    );
  } else {
    await q(
      `update notificacao set status = 'nao_enviado', erro = 'Inscrições removidas (endpoint expirado)', atualizado_em = now() where id = $1`,
      [notificacaoId],
    );
  }
}
