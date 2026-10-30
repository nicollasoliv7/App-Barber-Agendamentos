-- =============================================================================
-- Agendou — Cobrança automática de mensalidade via WhatsApp (R76–R87)
-- NÃO aplicar em produção sem revisar: aplique manualmente após conferir.
--
-- Novas tabelas: config_pix, cobranca_mensalidade_etapa, assinatura_optout_cobranca
-- Colunas novas: whatsapp_conexao (modelo_cobranca, cobrancas_ativas, dias_antes/depois)
--               assinatura (cobranca_pausada)
-- Unique composto aditivo: assinatura_cobranca(id, empresa_id), cliente(id, empresa_id)
-- Atualiza CHECK de notificacao.tipo para incluir 'cobranca_mensalidade'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Atualiza o CHECK de notificacao.tipo para aceitar cobranca_mensalidade
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.notificacao'::regclass and conname like '%tipo%'
  loop
    execute 'alter table public.notificacao drop constraint ' || r.conname;
  end loop;
end $$;
alter table public.notificacao
  add constraint notificacao_tipo_check
  check (tipo in (
    'confirmacao','lembrete','codigo',
    'cancelamento','remarcacao','aviso_empresa','teste',
    'cobranca_mensalidade'
  ));

-- ---------------------------------------------------------------------------
-- 2. config_pix — chave Pix da barbearia para geração do BR Code
-- ---------------------------------------------------------------------------
create table if not exists public.config_pix (
  empresa_id   uuid primary key references public.empresa(id) on delete cascade,
  tipo         text not null check (tipo in ('cpf','cnpj','telefone','email','aleatoria')),
  chave        text not null,
  recebedor    text not null check (char_length(recebedor) between 1 and 25),
  cidade       text not null check (char_length(cidade) between 1 and 15),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.config_pix enable row level security;
revoke all on public.config_pix from anon, authenticated;
grant select on public.config_pix to authenticated;
grant all on public.config_pix to service_role;

create policy rls_config_pix_select on public.config_pix
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy rls_config_pix_gestor on public.config_pix
  for all to authenticated
  using (public.e_gestor(empresa_id))
  with check (public.e_gestor(empresa_id));

-- ---------------------------------------------------------------------------
-- 3. Unique composto aditivo em assinatura_cobranca (para FK composta)
-- ---------------------------------------------------------------------------
do $$ begin
  alter table public.assinatura_cobranca
    add constraint assinatura_cobranca_id_empresa_key unique (id, empresa_id);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 4. cobranca_mensalidade_etapa — idempotência por (cobrança × etapa)
--    Índices parciais:
--      - automáticas: (cobranca_id, etapa)    WHERE etapa <> 'manual'
--      - manual:      (cobranca_id, dia)       WHERE etapa = 'manual'
-- ---------------------------------------------------------------------------
create table if not exists public.cobranca_mensalidade_etapa (
  id             uuid not null default gen_random_uuid() primary key,
  empresa_id     uuid not null,
  cobranca_id    uuid not null,
  etapa          text not null check (etapa in ('antes','vencimento','depois','manual')),
  dia            date not null,
  notificacao_id uuid references public.notificacao(id) on delete set null,
  criado_em      timestamptz not null default now(),
  foreign key (cobranca_id, empresa_id)
    references public.assinatura_cobranca (id, empresa_id) on delete cascade
);

create unique index if not exists cobranca_etapa_auto_uq
  on public.cobranca_mensalidade_etapa (cobranca_id, etapa)
  where etapa <> 'manual';

create unique index if not exists cobranca_etapa_manual_dia_uq
  on public.cobranca_mensalidade_etapa (cobranca_id, dia)
  where etapa = 'manual';

create index if not exists cobranca_etapa_empresa
  on public.cobranca_mensalidade_etapa (empresa_id, criado_em desc);

alter table public.cobranca_mensalidade_etapa enable row level security;
revoke all on public.cobranca_mensalidade_etapa from anon, authenticated;
grant select on public.cobranca_mensalidade_etapa to authenticated;
grant all on public.cobranca_mensalidade_etapa to service_role;

create policy rls_cobranca_etapa_select on public.cobranca_mensalidade_etapa
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

-- ---------------------------------------------------------------------------
-- 5. Unique composto aditivo em cliente (para FK composta de optout)
-- ---------------------------------------------------------------------------
do $$ begin
  alter table public.cliente
    add constraint cliente_id_empresa_key unique (id, empresa_id);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 6. assinatura_optout_cobranca — opt-out por cliente (persiste entre assinaturas)
-- ---------------------------------------------------------------------------
create table if not exists public.assinatura_optout_cobranca (
  empresa_id  uuid not null,
  cliente_id  uuid not null,
  criado_em   timestamptz not null default now(),
  primary key (empresa_id, cliente_id),
  foreign key (cliente_id, empresa_id)
    references public.cliente (id, empresa_id) on delete cascade
);

alter table public.assinatura_optout_cobranca enable row level security;
revoke all on public.assinatura_optout_cobranca from anon, authenticated;
grant select on public.assinatura_optout_cobranca to authenticated;
grant all on public.assinatura_optout_cobranca to service_role;

create policy rls_optout_cobranca_select on public.assinatura_optout_cobranca
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

-- ---------------------------------------------------------------------------
-- 7. whatsapp_conexao — novos campos de cobrança automática
-- ---------------------------------------------------------------------------
alter table public.whatsapp_conexao
  add column if not exists modelo_cobranca        text,
  add column if not exists modelo_cobranca_params int check (modelo_cobranca_params between 0 and 10),
  add column if not exists cobrancas_ativas       boolean not null default false,
  add column if not exists cobranca_dias_antes    int not null default 3
    check (cobranca_dias_antes between 1 and 30),
  add column if not exists cobranca_dias_depois   int not null default 3
    check (cobranca_dias_depois between 1 and 30);

-- ---------------------------------------------------------------------------
-- 8. assinatura — pausa individual da régua por assinante
-- ---------------------------------------------------------------------------
alter table public.assinatura
  add column if not exists cobranca_pausada boolean not null default false;
