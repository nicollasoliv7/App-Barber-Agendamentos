-- Agendou — schema PostgreSQL (PGlite local / Supabase)
-- Dinheiro em centavos; horários semanais em minutos desde 00:00.

create table if not exists empresa (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  telefone_whatsapp text,
  endereco text,
  maps_url text,
  logo_url text,
  multiunidade boolean not null default false,
  pixel_campanha text,
  criado_em timestamptz not null default now()
);

create table if not exists unidade (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  nome text not null,
  endereco text,
  maps_url text,
  ativo boolean not null default true
);

create table if not exists config_tema (
  empresa_id uuid primary key references empresa(id) on delete cascade,
  cor_primaria text not null default '#ff5a3c',
  cor_secundaria text not null default '#f59e0b',
  cor_fundo text not null default '#07080a',
  cor_texto text not null default '#f5f5f5',
  modo text not null default 'escuro' check (modo in ('claro','escuro'))
);

create table if not exists config_agendamento (
  empresa_id uuid primary key references empresa(id) on delete cascade,
  intervalo_slots_min int not null default 10 check (intervalo_slots_min between 5 and 120),
  antecedencia_min_min int not null default 60 check (antecedencia_min_min >= 0),
  janela_max_dias int not null default 30 check (janela_max_dias between 1 and 365),
  cancelamento_ate_min int not null default 120 check (cancelamento_ate_min >= 0),
  remarcacao_ate_min int not null default 120 check (remarcacao_ate_min >= 0),
  pagamento_modo text not null default 'desativado' check (pagamento_modo in ('desativado','opcional','obrigatorio')),
  pagamento_tipo text not null default 'cliente_escolhe' check (pagamento_tipo in ('minimo','integral','cliente_escolhe')),
  pagamento_minimo_pct int not null default 30 check (pagamento_minimo_pct between 1 and 100),
  pix_expiracao_min int not null default 5 check (pix_expiracao_min between 1 and 60),
  fuso_horario text not null default 'America/Sao_Paulo'
);

create table if not exists campo_personalizado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  chave text not null,
  rotulo text not null,
  tipo text not null check (tipo in ('texto','cpf','cnpj','data','textarea')),
  obrigatorio boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (empresa_id, chave)
);

create table if not exists profissional (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  unidade_id uuid references unidade(id) on delete set null,
  nome text not null,
  foto_url text,
  telefone text,
  comissao_pct int not null default 40 check (comissao_pct between 0 and 100),
  ativo boolean not null default true
);

create table if not exists servico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  observacao text,
  preco_centavos int not null check (preco_centavos >= 0),
  duracao_min int not null check (duracao_min between 5 and 600),
  imagem_url text,
  ativo boolean not null default true,
  ordem int not null default 0
);

create table if not exists profissional_servico (
  profissional_id uuid not null references profissional(id) on delete cascade,
  servico_id uuid not null references servico(id) on delete cascade,
  primary key (profissional_id, servico_id)
);

create table if not exists disponibilidade (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references profissional(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  inicio_min int not null check (inicio_min between 0 and 1440),
  fim_min int not null check (fim_min between 0 and 1440),
  check (fim_min > inicio_min)
);

create table if not exists bloqueio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  profissional_id uuid references profissional(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text,
  check (fim > inicio)
);

create table if not exists usuario_painel (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  nome text not null,
  telefone text unique, -- login do painel (só dígitos, com DDD)
  email text unique,
  senha_hash text not null,
  papel text not null default 'dono' check (papel in ('dono','admin','profissional')),
  profissional_id uuid references profissional(id) on delete set null,
  ativo boolean not null default true
);
-- bancos criados antes do login por telefone
alter table usuario_painel add column if not exists telefone text;
alter table usuario_painel alter column email drop not null;
create unique index if not exists usuario_painel_telefone_key on usuario_painel (telefone);
update usuario_painel set telefone = '11900000001' where email = 'dono@agendou.dev' and telefone is null; -- acesso fictício de exemplo

create table if not exists cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  nome text not null,
  telefone text not null,
  email text,
  senha_hash text,
  telefone_verificado boolean not null default false,
  dados_extras jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  unique (empresa_id, telefone)
);

create table if not exists agendamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  profissional_id uuid not null references profissional(id),
  servico_id uuid not null references servico(id),
  inicio timestamptz not null,
  fim timestamptz not null,
  preco_centavos int not null,
  status text not null check (status in ('pendente_pagamento','confirmado','concluido','cancelado','faltou')),
  origem text not null default 'publico' check (origem in ('publico','painel')),
  cancelado_por text check (cancelado_por in ('cliente','empresa','sistema')),
  expira_em timestamptz,
  remarcado_de uuid,
  token_publico text not null default md5(random()::text || clock_timestamp()::text),
  observacao text,
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists agendamento_prof_inicio on agendamento (profissional_id, inicio);
create index if not exists agendamento_cliente on agendamento (cliente_id, inicio desc);
create index if not exists agendamento_empresa_inicio on agendamento (empresa_id, inicio);

create table if not exists pagamento (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references agendamento(id) on delete cascade,
  metodo text not null check (metodo in ('pix','cartao','local')),
  tipo text not null check (tipo in ('minimo','integral')),
  valor_centavos int not null check (valor_centavos > 0),
  status text not null check (status in ('pendente','pago','expirado','cancelado','estornado')),
  provedor text not null default 'sandbox',
  provedor_ref text,
  pix_copia_cola text,
  expira_em timestamptz,
  pago_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists pagamento_agendamento on pagamento (agendamento_id);

create table if not exists cartao (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id) on delete cascade,
  bandeira text not null,
  ultimos4 text not null,
  validade_mes int not null,
  validade_ano int not null,
  token_provedor text not null,
  favorito boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists sessao (
  id text primary key, -- sha256 do token
  tipo text not null check (tipo in ('cliente','painel')),
  cliente_id uuid references cliente(id) on delete cascade,
  usuario_id uuid references usuario_painel(id) on delete cascade,
  expira_em timestamptz not null
);

create table if not exists codigo_verificacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  telefone text not null,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas int not null default 0,
  usado boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists notificacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  agendamento_id uuid references agendamento(id) on delete set null,
  canal text not null check (canal in ('whatsapp','sms','email')),
  destino text not null,
  mensagem text not null,
  status text not null default 'pendente' check (status in ('pendente','enviado','falhou')),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

-- v2: lembretes automáticos
alter table agendamento add column if not exists lembrete_enviado_em timestamptz;

-- v3: CRM e importação de clientes
create table if not exists importacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  usuario_id uuid references usuario_painel(id) on delete set null,
  fonte text not null default 'arquivo',
  formato text not null check (formato in ('csv','xlsx','api')),
  arquivo_nome text,
  status text not null default 'rascunho' check (status in ('rascunho','concluida','cancelada')),
  total_linhas int not null default 0,
  colunas jsonb not null default '[]'::jsonb,
  linhas jsonb,
  mapeamento jsonb,
  politica_duplicados text,
  resultado jsonb,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists importacao_empresa on importacao (empresa_id, criado_em desc);
alter table cliente add column if not exists observacoes text;
alter table cliente add column if not exists origem text not null default 'agendamento';
alter table cliente add column if not exists importacao_id uuid references importacao(id) on delete set null;
create index if not exists cliente_empresa_nome on cliente (empresa_id, nome);
