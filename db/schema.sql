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

-- v4: WhatsApp pela API oficial da Meta (Cloud API) — uma conexão (um número) por barbearia
create table if not exists whatsapp_conexao (
  empresa_id uuid primary key references empresa(id) on delete cascade,
  phone_number_id text not null unique,          -- um número só pode estar ligado a UMA barbearia
  waba_id text not null,
  numero_exibicao text,
  nome_verificado text,
  token_cifrado text not null,                   -- AES-256-GCM (chave em WHATSAPP_CHAVE_CRIPTO); nunca vai ao navegador
  app_secret_cifrado text,                       -- opcional: só se a barbearia usa um app próprio da Meta
  idioma text not null default 'pt_BR',
  modelo_confirmacao text,
  modelo_confirmacao_params int,
  modelo_lembrete text,
  modelo_lembrete_params int,
  modelo_codigo text,
  modelo_codigo_botao boolean not null default false,
  lembretes_ativos boolean not null default false,
  status text not null default 'conectado' check (status in ('conectado','erro')),
  ultimo_erro text,
  verificado_em timestamptz not null default now(),
  ultimo_webhook_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table notificacao add column if not exists tipo text;
alter table notificacao add column if not exists parametros jsonb;
alter table notificacao add column if not exists provedor_msg_id text;
alter table notificacao add column if not exists erro text;
alter table notificacao add column if not exists atualizado_em timestamptz;
create unique index if not exists notificacao_provedor_msg_id_key on notificacao (provedor_msg_id);
create index if not exists notificacao_empresa_data on notificacao (empresa_id, criado_em desc);
alter table notificacao drop constraint if exists notificacao_status_check;
-- registros antigos marcados como "enviado" sem provedor nunca saíram de verdade
update notificacao set status = 'nao_enviado', erro = 'Registrada antes da integração com o WhatsApp (não enviada)'
 where status = 'enviado' and provedor_msg_id is null and tipo is null;
alter table notificacao add constraint notificacao_status_check
  check (status in ('pendente','nao_enviado','aceito','enviado','entregue','lido','falhou'));

-- v5: planos mensais (módulo opcional). Nada aqui é obrigatório para usar a agenda e o financeiro.
create table if not exists plano (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  descricao text,
  beneficios text,                                   -- benefícios extras em texto (ex.: 10% em produtos)
  preco_centavos int not null check (preco_centavos > 0),
  periodo_meses int not null default 1 check (periodo_meses in (1,3,6,12)),
  ativo boolean not null default true,               -- inativo: não aceita novas assinaturas; as atuais continuam
  criado_em timestamptz not null default now()
);
create index if not exists plano_empresa on plano (empresa_id);

-- serviços incluídos: limite de usos por ciclo (null = sem limite) e quanto o cliente ainda paga por uso (0 = 100% coberto)
create table if not exists plano_servico (
  plano_id uuid not null references plano(id) on delete cascade,
  servico_id uuid not null references servico(id) on delete cascade,
  limite_por_ciclo int check (limite_por_ciclo is null or limite_por_ciclo between 1 and 100),
  valor_cliente_centavos int not null default 0 check (valor_cliente_centavos >= 0),
  primary key (plano_id, servico_id)
);

-- a assinatura guarda preço e período do momento da adesão: mudar o plano não altera o que já foi combinado
create table if not exists assinatura (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  plano_id uuid not null references plano(id),
  status text not null default 'pendente' check (status in ('pendente','ativa','inadimplente','cancelada')),
  inicio date not null,
  preco_centavos int not null check (preco_centavos > 0),
  periodo_meses int not null check (periodo_meses in (1,3,6,12)),
  ciclo_inicio date not null,                        -- início do ciclo atual
  ciclo_fim date not null,                           -- fim (exclusivo) do ciclo atual = próxima renovação
  cancelada_em timestamptz,
  motivo_cancelamento text,
  criado_em timestamptz not null default now()
);
create index if not exists assinatura_empresa on assinatura (empresa_id, status);
-- no máximo UMA assinatura em andamento por cliente
create unique index if not exists assinatura_cliente_aberta on assinatura (cliente_id) where status <> 'cancelada';

-- cobrança da mensalidade: uma por ciclo. Status da COBRANÇA ≠ status da ASSINATURA.
create table if not exists assinatura_cobranca (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  assinatura_id uuid not null references assinatura(id) on delete cascade,
  ciclo_inicio date not null,
  ciclo_fim date not null,
  vencimento date not null,
  valor_centavos int not null check (valor_centavos > 0),
  status text not null default 'pendente' check (status in ('pendente','paga','cancelada')),
  metodo text check (metodo in ('pix','dinheiro','cartao','transferencia','outro')),
  pago_em timestamptz,
  registrado_por uuid references usuario_painel(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (assinatura_id, ciclo_inicio),
  check ((status = 'paga') = (pago_em is not null))
);
create index if not exists assinatura_cobranca_empresa on assinatura_cobranca (empresa_id, status, vencimento);

-- uso do benefício: um atendimento coberto pelo plano. Não é pagamento nem receita.
create table if not exists assinatura_uso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  assinatura_id uuid not null references assinatura(id) on delete cascade,
  agendamento_id uuid not null unique references agendamento(id) on delete cascade,   -- 1 uso por atendimento
  servico_id uuid not null references servico(id),
  ciclo_inicio date not null,
  valor_coberto_centavos int not null check (valor_coberto_centavos >= 0),
  criado_em timestamptz not null default now()
);
create index if not exists assinatura_uso_ciclo on assinatura_uso (assinatura_id, ciclo_inicio);

-- parte do preço do atendimento coberta pelo plano (0 = atendimento avulso). Mantida junto com assinatura_uso.
alter table agendamento add column if not exists valor_coberto_centavos int not null default 0;
