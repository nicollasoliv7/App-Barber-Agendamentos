-- =============================================================================
-- Agendou — login do painel por telefone (celular com DDD) em vez de e-mail
-- Rode no SQL Editor do Supabase depois das migrations anteriores.
-- =============================================================================

alter table public.usuario_painel add column if not exists telefone text;
alter table public.usuario_painel alter column email drop not null;

-- só dígitos, 10 ou 11 (DDD + número)
alter table public.usuario_painel drop constraint if exists usuario_painel_telefone_formato;
alter table public.usuario_painel add constraint usuario_painel_telefone_formato
  check (telefone is null or telefone ~ '^[0-9]{10,11}$');

create unique index if not exists usuario_painel_telefone_key on public.usuario_painel (telefone);

-- Usuários já cadastrados: preencha o telefone de cada um antes de usar o novo login, ex.:
-- update public.usuario_painel set telefone = '11999999999' where email = 'voce@exemplo.com';
