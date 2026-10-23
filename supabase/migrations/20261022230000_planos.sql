-- =============================================================================
-- Agendou — planos mensais (módulo OPCIONAL)
-- Rode no SQL Editor do Supabase depois das migrations anteriores. Só adiciona:
-- nenhuma tabela ou coluna existente é removida ou alterada de forma destrutiva.
--
-- • plano / plano_servico     → o que a barbearia oferece (serviços incluídos, limite por ciclo, valor adicional)
-- • assinatura                → o cliente no plano; preço e período congelados na adesão
-- • assinatura_cobranca       → mensalidade de cada ciclo (pendente/paga/cancelada), uma por ciclo
-- • assinatura_uso            → atendimento coberto pelo plano (uso de benefício ≠ pagamento), um por agendamento
-- • agendamento.valor_coberto_centavos → parte do preço coberta pelo plano (0 = avulso)
--
-- Segurança: chaves compostas impedem misturar dados de barbearias diferentes.
-- Gestores editam planos; assinaturas, mensalidades e usos só mudam pelo servidor do
-- app (regras de ciclo e de não duplicidade), e ficam somente leitura pela API.
-- =============================================================================

alter table public.agendamento add column if not exists valor_coberto_centavos int not null default 0;
alter table public.agendamento drop constraint if exists agendamento_valor_coberto_ck;
alter table public.agendamento add constraint agendamento_valor_coberto_ck check (valor_coberto_centavos between 0 and preco_centavos);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agendamento_id_empresa_key') then
    alter table public.agendamento add constraint agendamento_id_empresa_key unique (id, empresa_id);
  end if;
end $$;

create table if not exists public.plano (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  nome           text not null check (length(trim(nome)) between 2 and 80),
  descricao      text,
  beneficios     text,
  preco_centavos int not null check (preco_centavos > 0),
  periodo_meses  int not null default 1 check (periodo_meses in (1,3,6,12)),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  unique (id, empresa_id)
);
create index if not exists plano_empresa on public.plano (empresa_id);

create table if not exists public.plano_servico (
  plano_id               uuid not null references public.plano(id) on delete cascade,
  servico_id             uuid not null references public.servico(id) on delete cascade,
  limite_por_ciclo       int check (limite_por_ciclo is null or limite_por_ciclo between 1 and 100),
  valor_cliente_centavos int not null default 0 check (valor_cliente_centavos >= 0),
  primary key (plano_id, servico_id)
);

create table if not exists public.assinatura (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresa(id) on delete cascade,
  cliente_id          uuid not null,
  plano_id            uuid not null,
  status              text not null default 'pendente' check (status in ('pendente','ativa','inadimplente','cancelada')),
  inicio              date not null,
  preco_centavos      int not null check (preco_centavos > 0),
  periodo_meses       int not null check (periodo_meses in (1,3,6,12)),
  ciclo_inicio        date not null,
  ciclo_fim           date not null check (ciclo_fim > ciclo_inicio),
  cancelada_em        timestamptz,
  motivo_cancelamento text,
  criado_em           timestamptz not null default now(),
  unique (id, empresa_id),
  foreign key (cliente_id, empresa_id) references public.cliente(id, empresa_id) on delete cascade,
  foreign key (plano_id, empresa_id)   references public.plano(id, empresa_id)
);
create index if not exists assinatura_empresa on public.assinatura (empresa_id, status);
create unique index if not exists assinatura_cliente_aberta on public.assinatura (cliente_id) where status <> 'cancelada';

create table if not exists public.assinatura_cobranca (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  assinatura_id  uuid not null,
  ciclo_inicio   date not null,
  ciclo_fim      date not null,
  vencimento     date not null,
  valor_centavos int not null check (valor_centavos > 0),
  status         text not null default 'pendente' check (status in ('pendente','paga','cancelada')),
  metodo         text check (metodo in ('pix','dinheiro','cartao','transferencia','outro')),
  pago_em        timestamptz,
  registrado_por uuid references public.usuario_painel(id) on delete set null,
  criado_em      timestamptz not null default now(),
  unique (assinatura_id, ciclo_inicio),
  check ((status = 'paga') = (pago_em is not null)),
  foreign key (assinatura_id, empresa_id) references public.assinatura(id, empresa_id) on delete cascade
);
create index if not exists assinatura_cobranca_empresa on public.assinatura_cobranca (empresa_id, status, vencimento);

create table if not exists public.assinatura_uso (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresa(id) on delete cascade,
  assinatura_id          uuid not null,
  agendamento_id         uuid not null unique,
  servico_id             uuid not null,
  ciclo_inicio           date not null,
  valor_coberto_centavos int not null check (valor_coberto_centavos >= 0),
  criado_em              timestamptz not null default now(),
  foreign key (assinatura_id, empresa_id)  references public.assinatura(id, empresa_id) on delete cascade,
  foreign key (agendamento_id, empresa_id) references public.agendamento(id, empresa_id) on delete cascade,
  foreign key (servico_id, empresa_id)     references public.servico(id, empresa_id)
);
create index if not exists assinatura_uso_ciclo on public.assinatura_uso (assinatura_id, ciclo_inicio);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.plano               enable row level security;
alter table public.plano_servico       enable row level security;
alter table public.assinatura          enable row level security;
alter table public.assinatura_cobranca enable row level security;
alter table public.assinatura_uso      enable row level security;

revoke all on public.plano, public.plano_servico, public.assinatura, public.assinatura_cobranca, public.assinatura_uso from anon, authenticated;
grant select, insert, update, delete on public.plano, public.plano_servico to authenticated;
grant select on public.assinatura, public.assinatura_cobranca, public.assinatura_uso to authenticated;

drop policy if exists rls_plano_ler on public.plano;
drop policy if exists rls_plano_escrever on public.plano;
create policy rls_plano_ler on public.plano for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));
create policy rls_plano_escrever on public.plano for all to authenticated
  using (public.e_gestor(empresa_id)) with check (public.e_gestor(empresa_id));

drop policy if exists rls_plano_servico_ler on public.plano_servico;
drop policy if exists rls_plano_servico_escrever on public.plano_servico;
create policy rls_plano_servico_ler on public.plano_servico for select to authenticated
  using (exists (select 1 from public.plano p where p.id = plano_id and p.empresa_id in (select public.minhas_empresas())));
create policy rls_plano_servico_escrever on public.plano_servico for all to authenticated
  using (exists (select 1 from public.plano p where p.id = plano_id and public.e_gestor(p.empresa_id)))
  with check (exists (select 1 from public.plano p join public.servico s on s.id = servico_id and s.empresa_id = p.empresa_id
                      where p.id = plano_id and public.e_gestor(p.empresa_id)));

do $$ declare t text; begin
  foreach t in array array['assinatura','assinatura_cobranca','assinatura_uso'] loop
    execute format('drop policy if exists rls_%1$s_ler on public.%1$I', t);
    execute format($f$create policy rls_%1$s_ler on public.%1$I for select to authenticated
                     using (empresa_id in (select public.minhas_empresas()))$f$, t);
  end loop;
end $$;
