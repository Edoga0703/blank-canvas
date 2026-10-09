-- RPC functions and auxiliary tables for Capiversa v1.1

-- 1. Table notificacao
create table if not exists public.notificacao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  tipo text not null default 'geral',
  titulo text not null,
  descricao text,
  link text,
  ref_id uuid,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notificacao enable row level security;

drop policy if exists notificacao_company_access on public.notificacao;
create policy notificacao_company_access on public.notificacao
for all using (public.user_has_company(company_id))
with check (public.user_has_company(company_id));

-- 2. Procedure push_notificacao
create or replace function public.push_notificacao(
  _company_id uuid,
  _tipo text default 'geral',
  _titulo text default '',
  _descricao text default null,
  _link text default null,
  _ref_id uuid default null,
  _user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notificacao (company_id, user_id, tipo, titulo, descricao, link, ref_id)
  values (_company_id, _user_id, _tipo, _titulo, _descricao, _link, _ref_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- 3. Function has_company_access
create or replace function public.has_company_access(_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_user
    where company_id = _company_id and user_id = auth.uid() and ativo = true
  ) or public.is_super_admin(auth.uid());
$$;

-- 4. Function current_company_id
create or replace function public.current_company_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select company_id from public.company_user
  where user_id = auth.uid() and ativo = true
  order by created_at asc
  limit 1;
$$;

-- 5. Function has_company_role
create or replace function public.has_company_role(_company_id uuid, _roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_user
    where company_id = _company_id
      and user_id = auth.uid()
      and ativo = true
      and role::text = any(_roles)
  );
$$;

-- 6. Function get_infra_stats
create or replace function public.get_infra_stats()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'db_connections', (select count(*) from pg_stat_activity)
  );
$$;

-- 7. Procedure provision_company_atomic
create or replace function public.provision_company_atomic(
  _user_id uuid,
  _nome text,
  _slug text,
  _trial_ate timestamptz default (now() + interval '7 days'),
  _plan_slug text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_pipeline_id uuid;
  v_plan_id uuid;
begin
  -- Check if user already has an active company
  select company_id into v_company_id
  from public.company_user
  where user_id = _user_id and ativo = true
  limit 1;

  if v_company_id is not null then
    return v_company_id;
  end if;

  -- Create company
  insert into public.company (
    nome,
    slug,
    created_by,
    status_cobranca,
    trial_ate,
    selected_plan_slug,
    onboarding_completed,
    wa_provider
  ) values (
    trim(_nome),
    lower(trim(_slug)),
    _user_id,
    'trial',
    _trial_ate,
    _plan_slug,
    false,
    'lovable_whatsapp'
  )
  returning id into v_company_id;

  -- Ensure profile exists
  insert into public.profiles (user_id, email, nome)
  select _user_id, email, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1))
  from auth.users where id = _user_id
  on conflict (user_id) do update set
    nome = coalesce(excluded.nome, profiles.nome);

  -- Link user as owner
  insert into public.company_user (company_id, user_id, role, ativo, max_chats)
  values (v_company_id, _user_id, 'owner', true, 4)
  on conflict (company_id, user_id) do nothing;

  -- Link plan / subscription if plan_slug provided
  if _plan_slug is not null then
    select id into v_plan_id from public.plan where slug = _plan_slug limit 1;
  end if;

  insert into public.subscription (
    company_id,
    plan_id,
    status,
    provider,
    ciclo,
    cortesia,
    metadata
  ) values (
    v_company_id,
    v_plan_id,
    'trialing',
    'manual',
    'month',
    false,
    jsonb_build_object('plan_slug', _plan_slug)
  )
  on conflict (company_id) do nothing;

  -- Create default CRM pipeline
  insert into public.crm_pipeline (company_id, nome, tipo, entrada, sistema)
  values (v_company_id, 'Atención y ventas', 'vendas', true, true)
  returning id into v_pipeline_id;

  -- Create default CRM stages
  insert into public.crm_stage (company_id, pipeline_id, nome, cor, ordem, tipo, modo_atendimento)
  values
    (v_company_id, v_pipeline_id, 'Nuevo contacto', '#3B82F6', 0, 'normal', 'ia'),
    (v_company_id, v_pipeline_id, 'Atención humana', '#F59E0B', 1, 'normal', 'manual'),
    (v_company_id, v_pipeline_id, 'Seguimiento', '#8B5CF6', 2, 'normal', 'manual'),
    (v_company_id, v_pipeline_id, 'Ganado', '#10B981', 3, 'ganho', 'manual'),
    (v_company_id, v_pipeline_id, 'Perdido', '#EF4444', 4, 'perda', 'manual');

  return v_company_id;
end;
$$;

-- 8. Missing auxiliary tables
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  delta integer not null default 0,
  saldo_apos integer,
  motivo text not null,
  ref_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.credit_ledger enable row level security;
drop policy if exists credit_ledger_access on public.credit_ledger;
create policy credit_ledger_access on public.credit_ledger for all using (public.user_has_company(company_id));

create table if not exists public.billing_event_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'manual',
  event_type text,
  processed boolean not null default false,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.billing_event_log enable row level security;
drop policy if exists billing_event_log_access on public.billing_event_log;
create policy billing_event_log_access on public.billing_event_log for all using (public.is_super_admin());

create table if not exists public.mensagem_agendada (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  numero text not null,
  mensagem text not null,
  agendado_para timestamptz not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);
alter table public.mensagem_agendada enable row level security;
drop policy if exists mensagem_agendada_access on public.mensagem_agendada;
create policy mensagem_agendada_access on public.mensagem_agendada for all using (public.user_has_company(company_id));
