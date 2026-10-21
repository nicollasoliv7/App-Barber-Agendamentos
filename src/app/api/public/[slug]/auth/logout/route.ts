import { ok, rota } from "@/lib/api";
import { encerrarSessao } from "@/lib/sessao";

export async function POST() {
  return rota(async () => {
    await encerrarSessao("cliente");
    return ok({ ok: true });
  });
}
