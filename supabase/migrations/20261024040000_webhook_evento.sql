-- =============================================================================
-- Agendou — registro de eventos de webhook (AbacatePay). Rode depois de
-- 20261024030000_assinatura_sistema.sql. Só adiciona.
--
-- A AbacatePay reenvia o mesmo evento (mesmo "id") em até 7 tentativas. O app
-- grava cada id aqui e ignora repetições já processadas. Escrita e leitura só
-- pelo servidor do app (service_role): nenhum acesso pela API do Supabase.
-- =============================================================================
create table if not exists public.webhook_evento (
  provedor      text not null,
  evento_id     text not null,
  evento        text not null,
  dev_mode      boolean not null default false,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,
  resultado     text,
  primary key (provedor, evento_id)
);
alter table public.webhook_evento enable row level security;
revoke all on public.webhook_evento from anon, authenticated;
