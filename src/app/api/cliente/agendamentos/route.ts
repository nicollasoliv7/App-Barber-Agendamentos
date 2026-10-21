import { ok, rota } from "@/lib/api";
import { q } from "@/lib/db";
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
    const itens = await q(
      `select a.id, a.inicio, a.fim, a.status, a.preco_centavos, a.cancelado_por, a.expira_em, a.token_publico as token,
              s.nome as servico, p.nome as profissional, a.servico_id, a.profissional_id,
              coalesce((select sum(valor_centavos) from pagamento pg where pg.agendamento_id = a.id and pg.status = 'pago'), 0)::int as pago_centavos,
              (select json_build_object('id', pg.id, 'valor_centavos', pg.valor_centavos, 'expira_em', pg.expira_em)
                 from pagamento pg where pg.agendamento_id = a.id and pg.status = 'pendente' and pg.metodo = 'pix'
                 order by pg.criado_em desc limit 1) as pix_pendente
       from agendamento a join servico s on s.id = a.servico_id join profissional p on p.id = a.profissional_id
       where a.cliente_id = $1
       order by (a.inicio >= now() and a.status in ('confirmado','pendente_pagamento')) desc,
                case when a.inicio >= now() then a.inicio end asc, a.inicio desc
       limit $2 offset $3`,
      [c.id, limite + 1, pagina * limite],
    );
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
