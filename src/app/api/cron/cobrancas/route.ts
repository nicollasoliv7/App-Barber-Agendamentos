import { ok, rota } from "@/lib/api";
import { enviarCobrancas } from "@/lib/cobrancas-mensalidade";
import { ErroNegocio } from "@/lib/tipos";

/** Régua de cobrança automática de mensalidade (R84). Em produção Vercel Hobby, chame a cada 30–60 min com x-cron-secret. */
export async function POST(req: Request) {
  return rota(async () => {
    const segredo = process.env.CRON_SECRET;
    if (segredo && req.headers.get("x-cron-secret") !== segredo) throw new ErroNegocio("Não autorizado", 401);
    return ok({ enviados: await enviarCobrancas() });
  });
}
