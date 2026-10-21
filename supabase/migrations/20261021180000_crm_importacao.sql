-- =============================================================================
-- Agendou — CRM e importação de clientes (CSV/Excel)
-- Rode DEPOIS de 20261021150000_agendou_schema.sql. Idempotente.
-- =============================================================================

create table if not exists public.importacao (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresa(id) on delete cascade,
  usuario_id          uuid references public.usuario_painel(id) on delete set null,
  fonte               text not null default 'arquivo',            -- 'arquivo' hoje; futuras integrações via API usam o id do conector
  formato             text not null check (formato in ('csv','xlsx','api')),
  arquivo_nome        text,
  status              text not null default 'rascunho' check (status in ('rascunho','concluida','cancelada')),
  total_linhas        int  not null default 0 check (total_linhas >= 0),
  colunas             jsonb not null default '[]'::jsonb,
  linhas              jsonb,                                      -- dados brutos só enquanto rascunho; apagados ao concluir/cancelar
  mapeamento          jsonb,
  politica_duplicados text check (politica_duplicados in ('manter','completar')),
  resultado           jsonb,                                      -- contagens + erros por linha (sem dados pessoais completos)
  criado_em           timestamptz not null default now(),
  concluido_em        timestamptz,
  check (status = 'rascunho' or linhas is null)
);
comment on table public.importacao is 'Lotes de importação de clientes (auditoria). Dados brutos são descartados ao concluir.';

alter table public.cliente add column if not exists observacoes text;
alter table public.cliente add column if not exists origem text not null default 'agendamento';
alter table public.cliente add column if not exists importacao_id uuid references public.importacao(id) on delete set null;
do $$ begin
  alter table public.cliente add constraint cliente_origem_valida check (origem in ('agendamento','painel','importacao'));
exception when duplicate_object then null; end $$;

create index if not exists importacao_empresa on public.importacao (empresa_id, criado_em desc);
create index if not exists cliente_importacao on public.cliente (importacao_id) where importacao_id is not null;
create index if not exists cliente_empresa_origem on public.cliente (empresa_id, origem);

-- Privilégios: gestores veem o histórico; dados brutos (linhas) nunca saem pela API
revoke all on public.importacao from anon, authenticated;
grant select (id, empresa_id, usuario_id, fonte, formato, arquivo_nome, status, total_linhas, colunas,
              mapeamento, politica_duplicados, resultado, criado_em, concluido_em)
  on public.importacao to authenticated;
grant select (observacoes, origem, importacao_id), insert (observacoes), update (observacoes)
  on public.cliente to authenticated;

alter table public.importacao enable row level security;
drop policy if exists rls_importacao_ler on public.importacao;
create policy rls_importacao_ler on public.importacao for select to authenticated
  using (public.e_gestor(empresa_id));

-- Novos padrões para empresas criadas a partir de agora (não altera empresas existentes):
-- tema quente do Agendou e pagamento online desligado até existir um provedor real conectado.
alter table public.config_tema alter column cor_primaria set default '#ff5a3c';
alter table public.config_tema alter column cor_fundo set default '#07080a';
alter table public.config_tema alter column cor_texto set default '#f5f5f5';
alter table public.config_agendamento alter column pagamento_modo set default 'desativado';
