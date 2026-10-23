import "server-only";
import { q } from "../db";

/** Consultas de histórico do painel: notificações enviadas e importações de clientes. */

export type NotificacaoLinha = { id: string; canal: string; tipo: string | null; destino: string; mensagem: string; status: string; erro: string | null; criado_em: Date };

export const notificacoesRecentes = (empresaId: string) =>
  q<NotificacaoLinha>(
    `select id, canal, tipo, destino, mensagem, status, erro, criado_em from notificacao where empresa_id = $1 order by criado_em desc limit 100`,
    [empresaId],
  );

export type ImportacaoLinha = {
  id: string;
  arquivo_nome: string | null;
  formato: string;
  status: string;
  total_linhas: number;
  resultado: { inseridos?: number; completados?: number; mantidos?: number; erros?: number } | null;
  criado_em: Date;
  autor: string | null;
};

/** Últimas importações concluídas ou canceladas (rascunhos não aparecem). */
export const importacoesRecentes = (empresaId: string) =>
  q<ImportacaoLinha>(
    `select i.id, i.arquivo_nome, i.formato, i.status, i.total_linhas, i.resultado, i.criado_em, up.nome as autor
     from importacao i left join usuario_painel up on up.id = i.usuario_id
     where i.empresa_id = $1 and i.status <> 'rascunho' order by i.criado_em desc limit 10`,
    [empresaId],
  );

/** Resultado dos envios de WhatsApp nos últimos 30 dias (status reais). */
export const estatisticasDeEnvio = (empresaId: string) =>
  q<{ aceitas: number; entregues: number; falhas: number; nao_enviadas: number }>(
    `select count(*) filter (where status in ('aceito','enviado','entregue','lido'))::int as aceitas,
              count(*) filter (where status in ('entregue','lido'))::int as entregues,
              count(*) filter (where status = 'falhou')::int as falhas,
              count(*) filter (where status = 'nao_enviado')::int as nao_enviadas
       from notificacao where empresa_id = $1 and criado_em > now() - interval '30 days'`,
    [empresaId],
  );
