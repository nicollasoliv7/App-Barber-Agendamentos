import { corpo, ok, rota } from "@/lib/api";
import { clienteLogado } from "@/lib/sessao";
import { pagarComCartao } from "@/lib/pagamentos";
import { ErroNegocio } from "@/lib/tipos";
import { isUuid } from "@/lib/validacao";

export async function POST(req: Request) {
  return rota(async () => {
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login para pagar com cartão salvo", 401);
    const b = await corpo<{ agendamento: string; cartao: string; tipo?: string }>(req);
    if (!isUuid(b.agendamento) || !isUuid(b.cartao)) throw new ErroNegocio("Dados inválidos");
    const r = await pagarComCartao(b.agendamento, b.cartao, b.tipo, c.id);
    if (!r.aprovado) throw new ErroNegocio(r.mensagem, 402);
    return ok(r);
  });
}
