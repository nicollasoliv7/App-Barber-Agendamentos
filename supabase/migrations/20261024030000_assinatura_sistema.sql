-- =============================================================================
-- Agendou — assinatura da PLATAFORMA (planos Gratuito, Mensal, Trimestral, Anual)
-- Rode no SQL Editor do Supabase depois das migrations anteriores. Só adiciona.
--
-- • assinatura_sistema → período pago de cada barbearia (sem linha ou vencido = Gratuito)
-- • cobranca_sistema   → cobrança avulsa de um período via AbacatePay (sem renovação automática)
-- • trigger em cliente → plano Gratuito aceita no máximo 15 clientes cadastrados
--
-- Não confundir com plano/assinatura (v5), que são os planos que a barbearia
-- vende aos PRÓPRIOS clientes.
--
-- Segurança: as duas tabelas só mudam pelo servidor do app (que confirma o
-- pagamento na API da AbacatePay). Pela API do Supabase, os usuários da
-- barbearia só leem as linhas da própria empresa.
-- =============================================================================

create table if not exists public.assinatura_sistema (
  empresa_id    uuid primary key references public.empresa(id) on delete cascade,
  plano         text not null check (plano in ('mensal','trimestral','anual')),
  valido_ate    timestamptz not null,
  origem        text not null default 'pagamento' check (origem in ('pagamento','cortesia')),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.cobranca_sistema (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  plano          text not null check (plano in ('mensal','trimestral','anual')),
  valor_centavos int not null check (valor_centavos > 0),
  provedor       text not null default 'abacatepay',
  provedor_id    text unique,
  url            text,
  status         text not null default 'pendente' check (status in ('pendente','pago','expirado','cancelado','estornado')),
  dev_mode       boolean not null default false,
  periodo_inicio timestamptz,
  periodo_fim    timestamptz,
  criado_por     uuid references public.usuario_painel(id) on delete set null,
  criado_em      timestamptz not null default now(),
  pago_em        timestamptz,
  atualizado_em  timestamptz not null default now(),
  check ((status in ('pago','estornado')) = (pago_em is not null)),
  check (periodo_fim is null or periodo_fim > periodo_inicio)
);
create index if not exists cobranca_sistema_empresa on public.cobranca_sistema (empresa_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- RLS: somente leitura para a própria empresa; escrita só pelo servidor (service_role)
-- ---------------------------------------------------------------------------
alter table public.assinatura_sistema enable row level security;
alter table public.cobranca_sistema   enable row level security;
revoke all on public.assinatura_sistema, public.cobranca_sistema from anon, authenticated;
grant select on public.assinatura_sistema, public.cobranca_sistema to authenticated;

drop policy if exists rls_assinatura_sistema_ler on public.assinatura_sistema;
create policy rls_assinatura_sistema_ler on public.assinatura_sistema for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));
drop policy if exists rls_cobranca_sistema_ler on public.cobranca_sistema;
create policy rls_cobranca_sistema_ler on public.cobranca_sistema for select to authenticated
  using (public.e_gestor(empresa_id));

-- ---------------------------------------------------------------------------
-- Limite do plano Gratuito: 15 clientes cadastrados por barbearia.
-- O app confere antes (com mensagem amigável); o trigger garante a regra
-- mesmo para inserções feitas direto pela API do Supabase.
-- ---------------------------------------------------------------------------
create or replace function public.conferir_limite_clientes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pago boolean; v_total int;
begin
  select exists (select 1 from public.assinatura_sistema a
                 where a.empresa_id = new.empresa_id and a.valido_ate > now())
    into v_pago;
  if v_pago then return new; end if;
  -- "insert ... on conflict do update" de um cliente que já existe não é cliente novo
  if exists (select 1 from public.cliente c where c.empresa_id = new.empresa_id and c.telefone = new.telefone) then
    return new;
  end if;
  perform 1 from public.empresa where id = new.empresa_id for update; -- serializa inserções da mesma barbearia
  select count(*) into v_total from public.cliente where empresa_id = new.empresa_id;
  if v_total >= 15 then
    raise exception 'Limite do plano Gratuito: até 15 clientes cadastrados' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.conferir_limite_clientes() from public, anon, authenticated;

drop trigger if exists cliente_limite_plano on public.cliente;
create trigger cliente_limite_plano before insert on public.cliente
  for each row execute function public.conferir_limite_clientes();
