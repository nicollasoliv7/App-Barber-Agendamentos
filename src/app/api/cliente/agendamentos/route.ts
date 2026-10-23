import { ok, rota } from "@/lib/api";
import { historicoDoCliente } from "@/lib/consultas/cliente";
import { clienteLogado } from "@/lib/sessao";
import { expirarPendentes } from "@/lib/disponibilidade";
import { configAgendamento } from "@/lib/empresa";
import { ErroNegocio } from "@/lib/tipos";

/** Histórico do cliente logado, com paginação ("ver mais"). */
export async function GET(req: Request) {
  return rota(async () => {
    const c = await clienteLogado();
    if (!c) throw new ErroNegocio("Faça login para ver seu histórico", 401);
    await expirarPendentes();
    const sp = new URL(req.url).searchParams;
    const limite = Math.min(50, Math.max(1, Number(sp.get("limite") ?? 10)));
    const pagina = Math.max(0, Number(sp.get("pagina") ?? 0));
    const cfg = await configAgendamento(c.empresa_id);
    const itens = await historicoDoCliente(c.id, limite + 1, pagina * limite);
    const agora = Date.now();
    return ok({
      cliente: { nome: c.nome, telefone: c.telefone },
      regras: { cancelamento_ate_min: cfg.cancelamento_ate_min, remarcacao_ate_min: cfg.remarcacao_ate_min, pagamento_modo: cfg.pagamento_modo },
      temMais: itens.length > limite,
      agendamentos: itens.slice(0, limite).map((a) => {
        const ini = new Date(a.inicio as string).getTime();
        const aberto = ["confirmado", "pendente_pagamento"].includes(a.status as string);
        return {
          ...a,
          pode_cancelar: aberto && ini - agora >= cfg.cancelamento_ate_min * 60000,
          pode_remarcar: aberto && ini - agora >= cfg.remarcacao_ate_min * 60000,
        };
      }),
    });
  });
}
