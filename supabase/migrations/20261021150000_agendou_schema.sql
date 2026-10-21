-- =============================================================================
-- Agendou — schema completo para Supabase (Postgres 15+)
-- Tabelas, relacionamentos, índices, restrições de negócio e RLS multi-empresa.
--
-- Como usar: cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- É idempotente o bastante para rodar num projeto novo; não apaga dados existentes.
--
-- Modelo de segurança
--   • Cada usuário do painel (auth.users) é ligado à sua empresa pela
--     tabela usuario_painel (coluna auth_user_id). As políticas RLS só liberam
--     linhas das empresas desse usuário.
--   • Papéis: dono e admin (gestores) leem e escrevem; profissional lê a
--     empresa e só altera os próprios agendamentos.
--   • anon (visitante sem login) NÃO acessa nenhuma tabela. A página pública e o
--     cliente final passam pelo servidor do app (rotas /api/*), que usa a
--     conexão do banco (DATABASE_URL) ou a service_role — ambas ignoram a RLS.
--   • Colunas sensíveis (senhas, tokens de cartão, token público) não podem ser
--     lidas pela API do Supabase nem por usuários logados.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.empresa (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (length(trim(nome)) between 2 and 120),
  slug              text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$' and slug not in ('api','painel','_next')),
  telefone_whatsapp text check (telefone_whatsapp ~ '^\d{10,13}$'),
  endereco          text,
  maps_url          text,
  logo_url          text,
  multiunidade      boolean not null default false,
  pixel_campanha    text,
  criado_em         timestamptz not null default now()
);
comment on table public.empresa is 'Assinante da plataforma (barbearia/salão). Raiz do isolamento multi-empresa.';

create table if not exists public.unidade (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  nome       text not null,
  endereco   text,
  maps_url   text,
  ativo      boolean not null default true,
  unique (id, empresa_id)
);

create table if not exists public.config_tema (
  empresa_id     uuid primary key references public.empresa(id) on delete cascade,
  cor_primaria   text not null default '#0f766e' check (cor_primaria   ~ '^#[0-9a-fA-F]{6}$'),
  cor_secundaria text not null default '#f59e0b' check (cor_secundaria ~ '^#[0-9a-fA-F]{6}$'),
  cor_fundo      text not null default '#0b1215' check (cor_fundo      ~ '^#[0-9a-fA-F]{6}$'),
  cor_texto      text not null default '#f1f5f9' check (cor_texto      ~ '^#[0-9a-fA-F]{6}$'),
  modo           text not null default 'escuro' check (modo in ('claro','escuro'))
);

create table if not exists public.config_agendamento (
  empresa_id           uuid primary key references public.empresa(id) on delete cascade,
  intervalo_slots_min  int  not null default 10  check (intervalo_slots_min between 5 and 120),   -- R2
  antecedencia_min_min int  not null default 60  check (antecedencia_min_min >= 0),              -- R4
  janela_max_dias      int  not null default 30  check (janela_max_dias between 1 and 365),      -- R5
  cancelamento_ate_min int  not null default 120 check (cancelamento_ate_min >= 0),              -- R22
  remarcacao_ate_min   int  not null default 120 check (remarcacao_ate_min >= 0),                -- R23
  pagamento_modo       text not null default 'opcional' check (pagamento_modo in ('desativado','opcional','obrigatorio')),   -- R15
  pagamento_tipo       text not null default 'cliente_escolhe' check (pagamento_tipo in ('minimo','integral','cliente_escolhe')), -- R16
  pagamento_minimo_pct int  not null default 30  check (pagamento_minimo_pct between 1 and 100), -- R16
  pix_expiracao_min    int  not null default 5   check (pix_expiracao_min between 1 and 60),     -- R17
  fuso_horario         text not null default 'America/Sao_Paulo'                                 -- R8
);

create table if not exists public.campo_personalizado (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresa(id) on delete cascade,
  chave       text not null check (chave ~ '^[a-z0-9_]{1,40}$'),
  rotulo      text not null,
  tipo        text not null check (tipo in ('texto','cpf','cnpj','data','textarea')),
  obrigatorio boolean not null default false,
  ordem       int not null default 0,
  ativo       boolean not null default true,
  unique (empresa_id, chave)
);

create table if not exists public.profissional (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresa(id) on delete cascade,
  unidade_id   uuid,
  nome         text not null,
  foto_url     text,
  telefone     text,
  comissao_pct int not null default 40 check (comissao_pct between 0 and 100), -- R27
  ativo        boolean not null default true,
  unique (id, empresa_id),
  -- a unidade precisa ser da mesma empresa (R7b); ao apagar a unidade, só unidade_id vira null
  foreign key (unidade_id, empresa_id) references public.unidade(id, empresa_id) on delete set null (unidade_id)
);

create table if not exists public.servico (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  nome           text not null,
  descricao      text,
  observacao     text,
  preco_centavos int  not null check (preco_centavos >= 0),
  duracao_min    int  not null check (duracao_min between 5 and 600),
  imagem_url     text,
  ativo          boolean not null default true,
  ordem          int not null default 0,
  unique (id, empresa_id)
);

create table if not exists public.profissional_servico (
  profissional_id uuid not null references public.profissional(id) on delete cascade,
  servico_id      uuid not null references public.servico(id) on delete cascade,
  primary key (profissional_id, servico_id)
);

create table if not exists public.disponibilidade (                   -- R1: expediente semanal
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissional(id) on delete cascade,
  dia_semana      int not null check (dia_semana between 0 and 6),   -- 0 = domingo
  inicio_min      int not null check (inicio_min between 0 and 1440),
  fim_min         int not null check (fim_min between 0 and 1440),
  check (fim_min > inicio_min)
);

create table if not exists public.bloqueio (                          -- R3: folgas e fechamentos
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  profissional_id uuid,                                              -- null = empresa inteira
  inicio          timestamptz not null,
  fim             timestamptz not null,
  motivo          text,
  check (fim > inicio),
  foreign key (profissional_id, empresa_id) references public.profissional(id, empresa_id) on delete cascade
);

create table if not exists public.usuario_painel (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  auth_user_id    uuid references auth.users(id) on delete cascade,  -- login pelo Supabase Auth
  nome            text not null,
  email           text not null unique,
  senha_hash      text,                                              -- login próprio do app (scrypt); null se usar Supabase Auth
  papel           text not null default 'dono' check (papel in ('dono','admin','profissional')),
  profissional_id uuid,
  ativo           boolean not null default true,
  unique (auth_user_id, empresa_id),
  foreign key (profissional_id, empresa_id) references public.profissional(id, empresa_id) on delete set null (profissional_id)
);

create table if not exists public.cliente (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresa(id) on delete cascade,
  nome                text not null,
  telefone            text not null check (telefone ~ '^\d{10,11}$'),   -- R9: só dígitos com DDD
  email               text,
  senha_hash          text,                                             -- R32
  telefone_verificado boolean not null default false,
  dados_extras        jsonb not null default '{}'::jsonb,               -- R12: campos personalizados
  criado_em           timestamptz not null default now(),
  unique (empresa_id, telefone),
  unique (id, empresa_id)
);

create table if not exists public.agendamento (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresa(id) on delete cascade,
  cliente_id          uuid not null,
  profissional_id     uuid not null,
  servico_id          uuid not null,
  inicio              timestamptz not null,
  fim                 timestamptz not null,
  preco_centavos      int  not null check (preco_centavos >= 0),        -- R11: preço congelado
  status              text not null check (status in ('pendente_pagamento','confirmado','concluido','cancelado','faltou')),
  origem              text not null default 'publico' check (origem in ('publico','painel')),
  cancelado_por       text check (cancelado_por in ('cliente','empresa','sistema')),
  expira_em           timestamptz,                                      -- R13/R18: prazo do Pix obrigatório
  remarcado_de        uuid references public.agendamento(id) on delete set null,
  token_publico       text not null default replace(gen_random_uuid()::text, '-', ''),
  observacao          text,
  lembrete_enviado_em timestamptz,                                      -- R14b
  criado_em           timestamptz not null default now(),
  check (fim > inicio),
  check (status <> 'pendente_pagamento' or expira_em is not null),
  check ((status = 'cancelado') = (cancelado_por is not null)),
  -- cliente, profissional e serviço precisam ser da MESMA empresa do agendamento
  foreign key (cliente_id, empresa_id)      references public.cliente(id, empresa_id)      on delete cascade,
  foreign key (profissional_id, empresa_id) references public.profissional(id, empresa_id),
  foreign key (servico_id, empresa_id)      references public.servico(id, empresa_id)
);

-- R10: dois agendamentos ativos do mesmo profissional nunca se sobrepõem (garantido pelo banco)
do $$ begin
  alter table public.agendamento add constraint agendamento_sem_conflito
    exclude using gist (profissional_id with =, tstzrange(inicio, fim) with &&)
    where (status in ('pendente_pagamento','confirmado','concluido'));
exception when duplicate_object or duplicate_table then null; end $$;

create table if not exists public.pagamento (
  id             uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamento(id) on delete cascade,
  metodo         text not null check (metodo in ('pix','cartao','local')),
  tipo           text not null check (tipo in ('minimo','integral')),
  valor_centavos int  not null check (valor_centavos > 0),
  status         text not null check (status in ('pendente','pago','expirado','cancelado','estornado')),
  provedor       text not null default 'sandbox',
  provedor_ref   text,
  pix_copia_cola text,
  expira_em      timestamptz,
  pago_em        timestamptz,
  criado_em      timestamptz not null default now(),
  check (status <> 'pago' or pago_em is not null)
);

create table if not exists public.cartao (                             -- R20: só token, nunca o número
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.cliente(id) on delete cascade,
  bandeira       text not null,
  ultimos4       text not null check (ultimos4 ~ '^\d{4}$'),
  validade_mes   int  not null check (validade_mes between 1 and 12),
  validade_ano   int  not null check (validade_ano between 2000 and 2100),
  token_provedor text not null,
  favorito       boolean not null default false,
  criado_em      timestamptz not null default now()
);

create table if not exists public.sessao (                             -- R32: sessões do login próprio
  id         text primary key,                                         -- sha256 do token do cookie
  tipo       text not null check (tipo in ('cliente','painel')),
  cliente_id uuid references public.cliente(id) on delete cascade,
  usuario_id uuid references public.usuario_painel(id) on delete cascade,
  expira_em  timestamptz not null,
  check ((tipo = 'cliente') = (cliente_id is not null) and (tipo = 'painel') = (usuario_id is not null))
);

create table if not exists public.codigo_verificacao (                 -- R30
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresa(id) on delete cascade,
  telefone    text not null,
  codigo_hash text not null,
  expira_em   timestamptz not null,
  tentativas  int not null default 0,
  usado       boolean not null default false,
  criado_em   timestamptz not null default now()
);

create table if not exists public.notificacao (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  agendamento_id uuid references public.agendamento(id) on delete set null,
  canal          text not null check (canal in ('whatsapp','sms','email')),
  destino        text not null,
  mensagem       text not null,
  status         text not null default 'pendente' check (status in ('pendente','enviado','falhou')),
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz
);

-- -----------------------------------------------------------------------------
-- 2. Integridade entre empresas em tabelas sem empresa_id
-- -----------------------------------------------------------------------------

-- profissional_servico: profissional e serviço da mesma empresa
create or replace function public.checar_profissional_servico() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select empresa_id from public.profissional where id = new.profissional_id)
     is distinct from (select empresa_id from public.servico where id = new.servico_id) then
    raise exception 'Profissional e serviço pertencem a empresas diferentes';
  end if;
  return new;
end $$;
drop trigger if exists profissional_servico_mesma_empresa on public.profissional_servico;
create trigger profissional_servico_mesma_empresa before insert or update on public.profissional_servico
  for each row execute function public.checar_profissional_servico();

-- disponibilidade: faixas do mesmo profissional/dia não se sobrepõem
create or replace function public.checar_disponibilidade() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.disponibilidade d
             where d.profissional_id = new.profissional_id and d.dia_semana = new.dia_semana
               and d.id <> new.id and d.inicio_min < new.fim_min and d.fim_min > new.inicio_min) then
    raise exception 'Faixa de horário sobreposta a outra já cadastrada';
  end if;
  return new;
end $$;
drop trigger if exists disponibilidade_sem_sobreposicao on public.disponibilidade;
create trigger disponibilidade_sem_sobreposicao before insert or update on public.disponibilidade
  for each row execute function public.checar_disponibilidade();

-- cartao: um favorito por cliente (R20)
create unique index if not exists cartao_um_favorito on public.cartao (cliente_id) where favorito;

-- -----------------------------------------------------------------------------
-- 3. Índices (consultas do app + colunas usadas nas políticas RLS)
-- -----------------------------------------------------------------------------
create index if not exists unidade_empresa                 on public.unidade (empresa_id);
create index if not exists campo_personalizado_empresa     on public.campo_personalizado (empresa_id, ordem);
create index if not exists profissional_empresa            on public.profissional (empresa_id) where ativo;
create index if not exists profissional_unidade            on public.profissional (unidade_id);
create index if not exists servico_empresa                 on public.servico (empresa_id, ordem) where ativo;
create index if not exists profissional_servico_servico    on public.profissional_servico (servico_id);
create index if not exists disponibilidade_prof_dia        on public.disponibilidade (profissional_id, dia_semana);
create index if not exists bloqueio_empresa_periodo        on public.bloqueio (empresa_id, inicio, fim);
create index if not exists bloqueio_prof_periodo           on public.bloqueio (profissional_id, inicio);
create index if not exists usuario_painel_auth             on public.usuario_painel (auth_user_id) where ativo;
create index if not exists usuario_painel_empresa          on public.usuario_painel (empresa_id);
create index if not exists usuario_painel_email_lower      on public.usuario_painel (lower(email));
create index if not exists cliente_empresa_nome            on public.cliente (empresa_id, nome);
create index if not exists agendamento_prof_inicio         on public.agendamento (profissional_id, inicio);
create index if not exists agendamento_cliente             on public.agendamento (cliente_id, inicio desc);
create index if not exists agendamento_empresa_inicio      on public.agendamento (empresa_id, inicio);
create index if not exists agendamento_servico             on public.agendamento (servico_id);
create index if not exists agendamento_pendentes_expira    on public.agendamento (expira_em) where status = 'pendente_pagamento';   -- R18
create index if not exists agendamento_lembrete            on public.agendamento (inicio) where status = 'confirmado' and lembrete_enviado_em is null; -- R14b
create index if not exists pagamento_agendamento           on public.pagamento (agendamento_id);
create index if not exists pagamento_pendentes_expira      on public.pagamento (expira_em) where status = 'pendente';               -- R18
create index if not exists pagamento_pago_em               on public.pagamento (pago_em) where status = 'pago';
create index if not exists cartao_cliente                  on public.cartao (cliente_id);
create index if not exists sessao_expira                   on public.sessao (expira_em);
create index if not exists codigo_verificacao_telefone     on public.codigo_verificacao (empresa_id, telefone, criado_em desc);
create index if not exists notificacao_empresa_data        on public.notificacao (empresa_id, criado_em desc);
create index if not exists notificacao_agendamento         on public.notificacao (agendamento_id);

-- -----------------------------------------------------------------------------
-- 4. Funções de apoio à RLS
--    SECURITY DEFINER para ler usuario_painel sem recursão de políticas.
--    search_path vazio + nomes qualificados = sem sequestro de função.
-- -----------------------------------------------------------------------------
create or replace function public.minhas_empresas() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.empresa_id from public.usuario_painel u
  where u.auth_user_id = auth.uid() and u.ativo
$$;

create or replace function public.e_gestor(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuario_painel u
                 where u.auth_user_id = auth.uid() and u.ativo
                   and u.empresa_id = p_empresa and u.papel in ('dono','admin'))
$$;

create or replace function public.meu_profissional(p_empresa uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.profissional_id from public.usuario_painel u
  where u.auth_user_id = auth.uid() and u.ativo and u.empresa_id = p_empresa and u.papel = 'profissional'
  limit 1
$$;

revoke all on function public.minhas_empresas(), public.e_gestor(uuid), public.meu_profissional(uuid) from public, anon;
grant execute on function public.minhas_empresas(), public.e_gestor(uuid), public.meu_profissional(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Privilégios
--    anon: nada. authenticated: tabelas de negócio, sem colunas sensíveis.
--    Tabelas internas (sessao, codigo_verificacao): só o servidor.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select, insert, update, delete on
  public.empresa, public.unidade, public.config_tema, public.config_agendamento,
  public.campo_personalizado, public.profissional, public.servico, public.profissional_servico,
  public.disponibilidade, public.bloqueio, public.pagamento, public.notificacao
to authenticated;

-- usuario_painel: sem senha_hash
grant select (id, empresa_id, auth_user_id, nome, email, papel, profissional_id, ativo),
      insert (empresa_id, auth_user_id, nome, email, papel, profissional_id, ativo),
      update (nome, email, papel, profissional_id, ativo)
  on public.usuario_painel to authenticated;
grant delete on public.usuario_painel to authenticated;

-- cliente: sem senha_hash
grant select (id, empresa_id, nome, telefone, email, telefone_verificado, dados_extras, criado_em),
      insert (empresa_id, nome, telefone, email, dados_extras),
      update (nome, telefone, email, dados_extras)
  on public.cliente to authenticated;
grant delete on public.cliente to authenticated;

-- agendamento: sem token_publico (ele autoriza pagar sem login)
grant select (id, empresa_id, cliente_id, profissional_id, servico_id, inicio, fim, preco_centavos, status, origem,
              cancelado_por, expira_em, remarcado_de, observacao, lembrete_enviado_em, criado_em),
      insert (empresa_id, cliente_id, profissional_id, servico_id, inicio, fim, preco_centavos, status, origem,
              cancelado_por, expira_em, observacao),
      update (inicio, fim, status, cancelado_por, expira_em, observacao)
  on public.agendamento to authenticated;

-- cartao: a empresa vê bandeira/final; o token do provedor nunca sai do servidor
grant select (id, cliente_id, bandeira, ultimos4, validade_mes, validade_ano, favorito, criado_em)
  on public.cartao to authenticated;

-- objetos criados no futuro também não ficam abertos para anon
alter default privileges in schema public revoke all on tables from anon;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.empresa              enable row level security;
alter table public.unidade              enable row level security;
alter table public.config_tema          enable row level security;
alter table public.config_agendamento   enable row level security;
alter table public.campo_personalizado  enable row level security;
alter table public.profissional         enable row level security;
alter table public.servico              enable row level security;
alter table public.profissional_servico enable row level security;
alter table public.disponibilidade      enable row level security;
alter table public.bloqueio             enable row level security;
alter table public.usuario_painel       enable row level security;
alter table public.cliente              enable row level security;
alter table public.agendamento          enable row level security;
alter table public.pagamento            enable row level security;
alter table public.cartao               enable row level security;
alter table public.sessao               enable row level security;  -- sem políticas: só o servidor
alter table public.codigo_verificacao   enable row level security;  -- sem políticas: só o servidor
alter table public.notificacao          enable row level security;

-- Recria as políticas de forma idempotente
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'rls_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- empresa: membros leem; gestores editam (criar empresa nova = onboarding pelo servidor)
create policy rls_empresa_ler    on public.empresa for select to authenticated
  using (id in (select public.minhas_empresas()));
create policy rls_empresa_editar on public.empresa for update to authenticated
  using (public.e_gestor(id)) with check (public.e_gestor(id));

-- Tabelas com empresa_id: membros leem, gestores escrevem
do $$ declare t text; begin
  foreach t in array array['unidade','config_tema','config_agendamento','campo_personalizado',
                           'profissional','servico','bloqueio','cliente'] loop
    execute format($f$create policy rls_%1$s_ler on public.%1$I for select to authenticated
                     using (empresa_id in (select public.minhas_empresas()))$f$, t);
    execute format($f$create policy rls_%1$s_inserir on public.%1$I for insert to authenticated
                     with check (public.e_gestor(empresa_id))$f$, t);
    execute format($f$create policy rls_%1$s_editar on public.%1$I for update to authenticated
                     using (public.e_gestor(empresa_id)) with check (public.e_gestor(empresa_id))$f$, t);
    execute format($f$create policy rls_%1$s_apagar on public.%1$I for delete to authenticated
                     using (public.e_gestor(empresa_id))$f$, t);
  end loop;
end $$;

-- usuario_painel: membros veem a equipe; gestores gerenciam
create policy rls_usuario_painel_ler on public.usuario_painel for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));
create policy rls_usuario_painel_inserir on public.usuario_painel for insert to authenticated
  with check (public.e_gestor(empresa_id));
create policy rls_usuario_painel_editar on public.usuario_painel for update to authenticated
  using (public.e_gestor(empresa_id)) with check (public.e_gestor(empresa_id));
create policy rls_usuario_painel_apagar on public.usuario_painel for delete to authenticated
  using (public.e_gestor(empresa_id) and auth_user_id is distinct from auth.uid()); -- ninguém se remove sozinho

-- Tabelas filhas do profissional
create policy rls_profissional_servico_ler on public.profissional_servico for select to authenticated
  using (exists (select 1 from public.profissional p where p.id = profissional_id
                 and p.empresa_id in (select public.minhas_empresas())));
create policy rls_profissional_servico_escrever on public.profissional_servico for all to authenticated
  using (exists (select 1 from public.profissional p where p.id = profissional_id and public.e_gestor(p.empresa_id)))
  with check (exists (select 1 from public.profissional p where p.id = profissional_id and public.e_gestor(p.empresa_id)));

create policy rls_disponibilidade_ler on public.disponibilidade for select to authenticated
  using (exists (select 1 from public.profissional p where p.id = profissional_id
                 and p.empresa_id in (select public.minhas_empresas())));
create policy rls_disponibilidade_escrever on public.disponibilidade for all to authenticated
  using (exists (select 1 from public.profissional p where p.id = profissional_id and public.e_gestor(p.empresa_id)))
  with check (exists (select 1 from public.profissional p where p.id = profissional_id and public.e_gestor(p.empresa_id)));

-- agendamento: membros leem; gestores criam/editam/apagam; profissional altera só os próprios
create policy rls_agendamento_ler on public.agendamento for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));
create policy rls_agendamento_inserir on public.agendamento for insert to authenticated
  with check (public.e_gestor(empresa_id));
create policy rls_agendamento_editar on public.agendamento for update to authenticated
  using (public.e_gestor(empresa_id) or profissional_id = public.meu_profissional(empresa_id))
  with check (public.e_gestor(empresa_id) or profissional_id = public.meu_profissional(empresa_id));
create policy rls_agendamento_apagar on public.agendamento for delete to authenticated
  using (public.e_gestor(empresa_id));

-- pagamento: via agendamento
create policy rls_pagamento_ler on public.pagamento for select to authenticated
  using (exists (select 1 from public.agendamento a where a.id = agendamento_id
                 and a.empresa_id in (select public.minhas_empresas())));
create policy rls_pagamento_escrever on public.pagamento for all to authenticated
  using (exists (select 1 from public.agendamento a where a.id = agendamento_id and public.e_gestor(a.empresa_id)))
  with check (exists (select 1 from public.agendamento a where a.id = agendamento_id and public.e_gestor(a.empresa_id)));

-- cartao: só leitura para gestores (os dados do cartão são do cliente)
create policy rls_cartao_ler on public.cartao for select to authenticated
  using (exists (select 1 from public.cliente c where c.id = cliente_id and public.e_gestor(c.empresa_id)));

-- notificacao: membros leem; gestores podem registrar envio manual
create policy rls_notificacao_ler on public.notificacao for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));
create policy rls_notificacao_inserir on public.notificacao for insert to authenticated
  with check (public.e_gestor(empresa_id));

-- -----------------------------------------------------------------------------
-- 7. Onboarding: cria uma empresa já com as configurações padrão e o dono logado
--    Uso pelo app (usuário autenticado): select public.criar_empresa('Minha Barbearia', 'minha-barbearia');
-- -----------------------------------------------------------------------------
create or replace function public.criar_empresa(p_nome text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.empresa (nome, slug) values (p_nome, lower(p_slug)) returning id into v_id;
  insert into public.config_tema (empresa_id) values (v_id);
  insert into public.config_agendamento (empresa_id) values (v_id);
  insert into public.usuario_painel (empresa_id, auth_user_id, nome, email, papel)
    values (v_id, auth.uid(), coalesce(split_part(v_email, '@', 1), 'Dono'), coalesce(v_email, auth.uid()::text), 'dono');
  return v_id;
end $$;
revoke all on function public.criar_empresa(text, text) from public, anon;
grant execute on function public.criar_empresa(text, text) to authenticated;
