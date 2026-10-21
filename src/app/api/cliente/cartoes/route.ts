import { corpo, ok, rota } from "@/lib/api";
import { q } from "@/lib/db";
import { clienteLogado } from "@/lib/sessao";
import { salvarCartao } from "@/lib/pagamentos";
import { ErroNegocio } from "@/lib/tipos";

export async function GET() {
  return rota(async () => {
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login", 401);
    const cartoes = await q(
      `select id, bandeira, ultimos4, validade_mes, validade_ano, favorito from cartao where cliente_id = $1 order by favorito desc, criado_em desc`,
      [c.id],
    );
    return ok({ cartoes });
  });
}

/** Sandbox: recebe o número só para validar e tokenizar; ele não é gravado (R20). */
export async function POST(req: Request) {
  return rota(async () => {
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login", 401);
    const b = await corpo<{ numero: string; mes: number; ano: number; cvv: string }>(req);
    const cartao = await salvarCartao(c.id, String(b.numero ?? ""), Number(b.mes), Number(b.ano), String(b.cvv ?? ""));
    return ok({ cartao }, 201);
  });
}
