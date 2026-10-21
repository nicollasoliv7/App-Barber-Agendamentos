import { ok, rota } from "@/lib/api";
import { expirarPendentes } from "@/lib/disponibilidade";
import { ErroNegocio } from "@/lib/tipos";

/** Varredura de expiração (R18). Em produção, chame a cada minuto com o header x-cron-secret. */
export async function POST(req: Request) {
  return rota(async () => {
    const segredo = process.env.CRON_SECRET;
    if (segredo && req.headers.get("x-cron-secret") !== segredo) throw new ErroNegocio("Não autorizado", 401);
    return ok({ cancelados: await expirarPendentes() });
  });
}
