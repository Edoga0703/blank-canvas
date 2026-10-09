-- Complementary modules for Capiversa v1.1
-- Ensures user_roles, company_role, quick_reply, company_tag, plan, subscription, app_config, agendamento, csat_response are available

-- 1. App role enum
do $$ begin
  create type public.app_role as enum ('super_admin', 'user');
exception when duplicate_object then null; end $$;

-- 2. user_roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.is_super_admin(lookup_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = lookup_user_id and role = 'super_admin'
  );
$$;

drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles
for select using (
  user_id = auth.uid() or public.is_super_admin()
);

drop policy if exists user_roles_admin on public.user_roles;
drop policy if exists user_roles_manage on public.user_roles;
create policy user_roles_manage on public.user_roles
for all using (
  public.is_super_admin()
) with check (
  public.is_super_admin()
);

-- 3. company_role
create table if not exists public.company_role (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  nome text not null,
  descricao text,
  cor text not null default '#3B82F6',
  base_role public.tenant_role not null default 'atendente',
  permissions jsonb not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.company_role enable row level security;

drop policy if exists company_role_company_access on public.company_role;
create policy company_role_company_access on public.company_role for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));

-- Add custom_role_id a company_user
do $$ begin
  alter table public.company_user add column if not exists custom_role_id uuid references public.company_role(id) on delete set null;
exception when others then null; end $$;

-- Foreign key constraint a profiles para que PostgREST pueda resolver profiles:profiles(*)
do $$ begin
  alter table public.company_user drop constraint if exists company_user_user_id_profiles_fkey;
  alter table public.company_user add constraint company_user_user_id_profiles_fkey foreign key (user_id) references public.profiles(user_id) on delete cascade;
exception when others then null; end $$;

-- 4. quick_reply
create table if not exists public.quick_reply (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  titulo text,
  atalho text not null,
  categoria text not null default 'geral',
  tipo text not null default 'texto',
  texto text,
  media_url text,
  media_mime text,
  media_nome text,
  favorito boolean not null default false,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quick_reply enable row level security;

drop policy if exists quick_reply_company_access on public.quick_reply;
create policy quick_reply_company_access on public.quick_reply for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));

-- 5. company_tag
create table if not exists public.company_tag (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  nome text not null,
  cor text default '#3B82F6',
  created_at timestamptz not null default now(),
  unique (company_id, nome)
);
alter table public.company_tag enable row level security;

drop policy if exists company_tag_company_access on public.company_tag;
create policy company_tag_company_access on public.company_tag for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));

-- 6. plan
create table if not exists public.plan (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  descricao text,
  preco_cents integer not null default 0,
  moeda text not null default 'BRL',
  intervalo text not null default 'month',
  limite_usuarios integer not null default 5,
  limite_instancias integer not null default 1,
  limite_mensagens integer not null default 10000,
  limite_contatos integer not null default 5000,
  creditos_mensais integer not null default 0,
  creditos_trial integer not null default 0,
  trial_days integer not null default 7,
  features jsonb not null default '{}',
  ativo boolean not null default true,
  destaque boolean not null default false,
  ordem integer not null default 0,
  stripe_product_id text,
  stripe_price_id text,
  paddle_product_id text,
  paddle_price_id text,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.plan enable row level security;

drop policy if exists plan_read on public.plan;
create policy plan_read on public.plan for select using (true);

-- 7. subscription
create table if not exists public.subscription (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade unique,
  plan_id uuid references public.plan(id) on delete set null,
  status text not null default 'trialing',
  provider text not null default 'manual',
  ciclo text not null default 'month',
  valor_customizado_cents integer,
  cortesia boolean not null default false,
  extra_usuarios integer not null default 0,
  extra_conexoes integer not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscription enable row level security;

drop policy if exists subscription_company_access on public.subscription;
create policy subscription_company_access on public.subscription for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));

-- 8. app_config
create table if not exists public.app_config (
  id boolean primary key default true,
  gateway_padrao text not null default 'manual',
  gateway_portal_url text,
  provider_capacity jsonb not null default '{}',
  emissor jsonb not null default '{}',
  super_admin_emails text[] not null default array['cuentastupana@gmail.com'],
  updated_at timestamptz not null default now(),
  check (id = true)
);
alter table public.app_config enable row level security;

drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select using (true);

-- 9. agendamento
create table if not exists public.agendamento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  card_id uuid references public.crm_cards(id) on delete set null,
  titulo text not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'pendente',
  google_event_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.agendamento enable row level security;

drop policy if exists agendamento_company_access on public.agendamento;
create policy agendamento_company_access on public.agendamento for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));

-- 10. csat_response
create table if not exists public.csat_response (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  token text not null unique default gen_random_uuid()::text,
  numero text not null,
  contato_nome text,
  score integer,
  comentario text,
  canal text not null default 'whatsapp',
  estado text default 'pendente',
  enviado_em timestamptz not null default now(),
  enviado_por text,
  respondido_em timestamptz,
  expira_em timestamptz,
  tentativas integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.csat_response enable row level security;

drop policy if exists csat_company_access on public.csat_response;
create policy csat_company_access on public.csat_response for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));
