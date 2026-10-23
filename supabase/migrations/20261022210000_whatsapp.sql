-- =============================================================================
-- Agendou — integração com o WhatsApp (API oficial da Meta / Cloud API)
-- Rode no SQL Editor do Supabase depois das migrations anteriores.
--
-- • whatsapp_conexao: UM número por barbearia (phone_number_id único).
--   Token e App Secret ficam criptografados pelo app (AES-256-GCM).
--   RLS ligada e SEM políticas: nem anon nem usuários logados leem pela API
--   do Supabase; só o servidor do app (conexão direta / service_role).
-- • notificacao: tipo, variáveis do modelo, id da mensagem na Meta, erro e
--   status reais (nao_enviado, aceito, enviado, entregue, lido, falhou).
-- =============================================================================

create table if not exists public.whatsapp_conexao (
  empresa_id                uuid primary key references public.empresa(id) on delete cascade,
  phone_number_id           text not null unique check (phone_number_id ~ '^[0-9]{5,25}$'),
  waba_id                   text not null check (waba_id ~ '^[0-9]{5,25}$'),
  numero_exibicao           text,
  nome_verificado           text,
  token_cifrado             text not null,
  app_secret_cifrado        text,
  idioma                    text not null default 'pt_BR',
  modelo_confirmacao        text,
  modelo_confirmacao_params int check (modelo_confirmacao_params between 0 and 6),
  modelo_lembrete           text,
  modelo_lembrete_params    int check (modelo_lembrete_params between 0 and 6),
  modelo_codigo             text,
  modelo_codigo_botao       boolean not null default false,
  lembretes_ativos          boolean not null default false,
  status                    text not null default 'conectado' check (status in ('conectado','erro')),
  ultimo_erro               text,
  verificado_em             timestamptz not null default now(),
  ultimo_webhook_em         timestamptz,
  criado_em                 timestamptz not null default now()
);

alter table public.whatsapp_conexao enable row level security;  -- sem políticas: só o servidor
revoke all on public.whatsapp_conexao from anon, authenticated;

alter table public.notificacao add column if not exists tipo text
  check (tipo in ('confirmacao','lembrete','codigo','cancelamento','remarcacao','aviso_empresa','teste'));
alter table public.notificacao add column if not exists parametros jsonb;
alter table public.notificacao add column if not exists provedor_msg_id text;
alter table public.notificacao add column if not exists erro text;
alter table public.notificacao add column if not exists atualizado_em timestamptz;
create unique index if not exists notificacao_provedor_msg_id_key on public.notificacao (provedor_msg_id);

alter table public.notificacao drop constraint if exists notificacao_status_check;
-- registros antigos marcados como "enviado" sem provedor nunca saíram de verdade
update public.notificacao set status = 'nao_enviado', erro = 'Registrada antes da integração com o WhatsApp (não enviada)'
 where status = 'enviado' and provedor_msg_id is null and tipo is null;
alter table public.notificacao add constraint notificacao_status_check
  check (status in ('pendente','nao_enviado','aceito','enviado','entregue','lido','falhou'));

-- as variáveis do modelo (que podem conter o código de verificação) não são lidas pela API do Supabase:
-- troca o SELECT da tabela inteira por SELECT só das colunas seguras
revoke select on public.notificacao from authenticated;
grant select (id, empresa_id, agendamento_id, canal, tipo, destino, mensagem, status, provedor_msg_id, erro,
              criado_em, enviado_em, atualizado_em)
  on public.notificacao to authenticated;
