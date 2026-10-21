import { corpo, ok, rota } from "@/lib/api";
import { clienteLogado } from "@/lib/sessao";
import { criarCobrancaPix } from "@/lib/pagamentos";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

/** Gera cobrança Pix SANDBOX. Autoriza pelo token do agendamento ou pela sessão do cliente. */
export async function POST(req: Request) {
  return rota(async () => {
    const b = await corpo<{ agendamento: string; token?: string; tipo?: string }>(req);
    if (!isUuid(b.agendamento)) throw new ErroNegocio("Agendamento inválido");
    const c = await clienteLogado();
    const p = await criarCobrancaPix(b.agendamento, b.tipo, { token: b.token, clienteId: c?.id });
    return ok({ pagamento: p }, 201);
  });
}
