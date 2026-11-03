-- =============================================================================
-- Agendou — Notificações Push Web (R88–R91)
-- VAPID + Web Push API: uma inscrição por aparelho, por usuário do painel.
-- Canal 'push' adicionado à tabela notificacao.
--
-- • push_inscricao: endpoint, chaves e label do aparelho. RLS ligada, sem
--   políticas: só o servidor lê e escreve.
-- • A notificacao.canal check é estendida para incluir 'push'.
-- • Endpoints expirados (404/410) são removidos automaticamente pelo servidor.
-- =============================================================================

-- 1. Nova tabela de inscrições push
create table if not exists public.push_inscricao (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresa(id) on delete cascade,
  usuario_id  uuid not null references public.usuario_painel(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  aparelho    text,
  criado_em   timestamptz not null default now()
);
alter table public.push_inscricao enable row level security;
revoke all on public.push_inscricao from anon, authenticated;
create index if not exists push_inscricao_empresa_idx on public.push_inscricao (empresa_id);

-- 2. Adiciona 'push' ao CHECK de canal da notificacao (DROP todos os checks de canal e recria)
do $$ declare r record; begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.notificacao'::regclass and conname like '%canal%'
  loop
    execute 'alter table public.notificacao drop constraint ' || r.conname;
  end loop;
end $$;
alter table public.notificacao
  add constraint notificacao_canal_check
  check (canal in ('whatsapp','sms','email','push'));

-- 3. Garante que 'push' aparece nas colunas seguras que authenticated pode SELECT
-- (a migration de WhatsApp já fez revoke/grant; só garante que 'canal' e 'destino' estão na lista)
-- A lista completa abaixo cobre todas as colunas não-sensíveis incluindo as de push:
revoke select on public.notificacao from authenticated;
grant select (id, empresa_id, agendamento_id, canal, tipo, destino, mensagem, status,
              provedor_msg_id, erro, criado_em, enviado_em, atualizado_em)
  on public.notificacao to authenticated;
