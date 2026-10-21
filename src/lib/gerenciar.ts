import "server-only";
import { q1 } from "./db";
import { configAgendamento } from "./empresa";
import { expirarPendentes } from "./disponibilidade";
import { ErroNegocio } from "./tipos";

export interface AgendamentoPublico {
  id: string;
  status: string;
  inicio: string;
  fim: string;
  preco_centavos: number;
  pago_centavos: number;
  servico: string;
  profissional: string;
  cliente_nome: string;
  empresa: { nome: string; slug: string; endereco: string | null; maps_url: string | null; telefone_whatsapp: string | null };
  pode_cancelar: boolean;
  pode_remarcar: boolean;
  limite_cancelamento_h: number;
}

/**
 * Agendamento acessado pelo LINK SECRETO (token de 36 caracteres), sem login.
 * O token só autoriza este agendamento, e só dentro da empresa do slug.
 */
export async function buscarPorToken(slug: string, id: string, token: string): Promise<AgendamentoPublico> {
  if (!token || token.length < 20) throw new ErroNegocio("Link inválido ou incompleto", 403);
  await expirarPendentes();
  const a = await q1<{
    id: string;
    status: string;
    inicio: Date;
    fim: Date;
    preco_centavos: number;
    pago: number;
    servico: string;
    profissional: string;
    cliente_nome: string;
    empresa_id: string;
    e_nome: string;
    e_slug: string;
    e_endereco: string | null;
    e_maps: string | null;
    e_whats: string | null;
  }>(
    `select a.id, a.status, a.inicio, a.fim, a.preco_centavos, a.empresa_id,
            coalesce((select sum(valor_centavos) from pagamento p where p.agendamento_id = a.id and p.status = 'pago'),0)::int as pago,
            s.nome as servico, pr.nome as profissional, c.nome as cliente_nome,
            e.nome as e_nome, e.slug as e_slug, e.endereco as e_endereco, e.maps_url as e_maps, e.telefone_whatsapp as e_whats
     from agendamento a join empresa e on e.id = a.empresa_id join servico s on s.id = a.servico_id
     join profissional pr on pr.id = a.profissional_id join cliente c on c.id = a.cliente_id
     where a.id = $1 and a.token_publico = $2 and e.slug = $3`,
    [id, token, slug],
  );
  if (!a) throw new ErroNegocio("Agendamento não encontrado. Confira se o link está completo.", 404);
  const cfg = await configAgendamento(a.empresa_id);
  const falta = new Date(a.inicio).getTime() - Date.now();
  const aberto = a.status === "confirmado" || a.status === "pendente_pagamento";
  return {
    id: a.id,
    status: a.status,
    inicio: new Date(a.inicio).toISOString(),
    fim: new Date(a.fim).toISOString(),
    preco_centavos: a.preco_centavos,
    pago_centavos: a.pago,
    servico: a.servico,
    profissional: a.profissional,
    cliente_nome: a.cliente_nome,
    empresa: { nome: a.e_nome, slug: a.e_slug, endereco: a.e_endereco, maps_url: a.e_maps, telefone_whatsapp: a.e_whats },
    pode_cancelar: aberto && falta >= cfg.cancelamento_ate_min * 60000,
    pode_remarcar: aberto && falta >= cfg.remarcacao_ate_min * 60000,
    limite_cancelamento_h: cfg.cancelamento_ate_min / 60,
  };
}
