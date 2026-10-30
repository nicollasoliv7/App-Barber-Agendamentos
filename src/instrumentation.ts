import { log } from "./lib/log";

/**
 * Rotinas em segundo plano quando o app roda como servidor único (local ou VPS):
 * a cada minuto expira Pix vencidos (R18) e envia lembretes (R14b).
 * Em ambiente serverless, desligue com ROTINAS_INTERNAS=0 e use as rotas /api/cron/*.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ROTINAS_INTERNAS === "0") return;
  if (process.env.VERCEL && process.env.ROTINAS_INTERNAS !== "1") return; // serverless: use /api/cron/*
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const g = globalThis as unknown as { __agendouRotinas?: NodeJS.Timeout };
  if (g.__agendouRotinas) return;
  const rodar = async () => {
    try {
      const { expirarPendentes } = await import("./lib/disponibilidade");
      const { enviarLembretes } = await import("./lib/lembretes");
      const { enviarCobrancas } = await import("./lib/cobrancas-mensalidade");
      await expirarPendentes();
      await enviarLembretes();
      await enviarCobrancas();
    } catch (e) {
      log.erro("[agendou] rotina falhou:", e);
    }
  };
  g.__agendouRotinas = setInterval(rodar, 60_000);
  setTimeout(rodar, 5_000);
}
