import { ok, rota } from "@/lib/api";
import { enviarLembretes } from "@/lib/lembretes";
import { ErroNegocio } from "@/lib/tipos";

/** Lembretes antes do horário (R14b). Em produção, chame a cada 5–10 min com o header x-cron-secret. */
export async function POST(req: Request) {
  return rota(async () => {
    const segredo = process.env.CRON_SECRET;
    if (segredo && req.headers.get("x-cron-secret") !== segredo) throw new ErroNegocio("Não autorizado", 401);
    return ok({ enviados: await enviarLembretes() });
  });
}
