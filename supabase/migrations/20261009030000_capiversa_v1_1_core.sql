-- Capiversa v1.1
-- Núcleo reproducible para la beta de CuentasTuPana.
-- Mantiene los nombres principales del código heredado para permitir una
-- migración gradual hacia contratos neutrales.

create extension if not exists pgcrypto;

do $$ begin
  create type public.tenant_role as enum ('owner', 'admin', 'atendente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stage_tipo as enum ('normal', 'ganho', 'perda');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.whatsapp_billing_status as enum ('free', 'pending_payment', 'active', 'past_due', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.whatsapp_provider_type as enum (
    'lovable_whatsapp', 'meta_direct', 'evolution', 'uazapi', 'oficial_meta', 'wablast'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.company (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  logo_url text,
  primary_color text not null default '#2563EB',
  segmento text,
  telefone text,
  email_corporativo text,
  site text,
  onboarding_completed boolean not null default false,
  onboarding_step integer not null default 0,
  atendimento_operacional boolean not null default true,
  dashboard_individual boolean not null default false,
  funcoes_individuais boolean not null default false,
  distribuicao_manual boolean not null default false,
  grupos_ativos boolean not null default false,
  selected_plan_slug text default 'beta',
  status_cobranca text not null default 'beta',
  trial_ate timestamptz not null default (now() + interval '365 days'),
  wa_provider text not null default 'lovable_whatsapp',
  creditos_saldo integer not null default 0,
  creditos_origem text not null default 'beta',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  nome_completo text,
  email text,
  telefone text,
  avatar_url text,
  cargo text,
  assinatura_ativa boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_user (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_role not null default 'atendente',
  ativo boolean not null default true,
  forcar_troca_senha boolean not null default false,
  max_chats integer not null default 4 check (max_chats > 0),
  is_in_distribution boolean not null default true,
  distribution_order integer,
  last_assigned_at timestamptz,
  last_login_at timestamptz,
  horarios jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  instance_name text not null unique,
  display_name text,
  numero text,
  provider text not null default 'lovable_whatsapp',
  provider_type public.whatsapp_provider_type not null default 'lovable_whatsapp',
  external_connection_id text,
  instance_token text,
  phone_number_id text,
  waba_id text,
  status text not null default 'pending',
  paused boolean not null default false,
  messaging_tier text,
  webhook_token uuid not null default gen_random_uuid(),
  webhook_configured_at timestamptz,
  last_state_at timestamptz,
  billing_status public.whatsapp_billing_status not null default 'free',
  monthly_price_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider, external_connection_id)
);

create table if not exists public.company_user_instance (
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id, instance_id)
);

create table if not exists public.messaging_inbox_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.company(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  external_connection_id text,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  raw_payload jsonb not null,
  normalized_count integer not null default 0,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_event_id)
);

create table if not exists public.crm_pipeline (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  nome text not null,
  tipo text not null default 'vendas',
  ordem integer not null default 0,
  ativo boolean not null default true,
  entrada boolean not null default false,
  oculto boolean not null default false,
  sistema boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_stage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  pipeline_id uuid references public.crm_pipeline(id) on delete cascade,
  nome text not null,
  cor text not null default '#64748B',
  ordem integer not null default 0,
  tipo public.stage_tipo not null default 'normal',
  modo_atendimento text not null default 'manual',
  mensagem_tipo text not null default 'nenhuma',
  mensagem_texto text,
  mensagem_prompt text,
  mensagem_midia_url text,
  mensagem_midia_tipo text,
  mensagem_midia_mime text,
  mensagem_midia_nome text,
  delay_valor integer not null default 0,
  delay_unidade text not null default 'minutos',
  hora_do_dia time,
  regua_ativa boolean not null default false,
  parar_se_humano boolean not null default true,
  parar_se_responder boolean not null default true,
  move_se_respondeu_para uuid,
  move_se_sem_resposta_para uuid,
  move_se_sem_resposta_dias integer,
  move_se_positivo_para uuid,
  move_se_negativo_para uuid,
  move_apos_qualificar_para uuid,
  sla_horas integer,
  entrada_formulario boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  pipeline_id uuid references public.crm_pipeline(id) on delete set null,
  stage_id uuid references public.crm_stage(id) on delete set null,
  numero text not null,
  nome text,
  email text,
  empresa text,
  cpf_cnpj text,
  endereco text,
  foto_url text,
  observacao text,
  origem text,
  canal_entrada text,
  canal_chat text,
  canal_custom text,
  status text not null default 'aberto',
  tags text[] not null default '{}',
  valor numeric(14,2) not null default 0,
  campos_extras jsonb not null default '{}',
  ultima_mensagem text,
  ultima_direcao text not null default 'entrada',
  ultima_em timestamptz not null default now(),
  primeiro_contato_em timestamptz,
  entrou_stage_em timestamptz not null default now(),
  stage_entrou_em timestamptz,
  transfer_status text,
  transfer_de_user_id uuid,
  transfer_para_user_id uuid,
  transfer_em timestamptz,
  regua_status text not null default 'inativa',
  regua_ultimo_disparo_em timestamptz,
  proxima_acao timestamptz,
  perdido_em timestamptz,
  reativado_em timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ctwa_clid text,
  gclid text,
  fbclid text,
  meta_lead_id text,
  meta_form_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, numero)
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  numero text not null,
  contato_nome text,
  direcao text not null check (direcao in ('entrada', 'saida')),
  autor text not null check (autor in ('ia', 'humano', 'contato', 'telefone', 'sistema')),
  texto text not null default '',
  texto_original text,
  provider text not null default 'lovable_whatsapp',
  whatsapp_message_id text,
  provider_timestamp timestamptz,
  reply_to_id uuid references public.mensagens(id) on delete set null,
  midia_url text,
  midia_tipo text,
  midia_mime text,
  midia_nome text,
  status_envio text not null default 'recebido',
  raw_payload jsonb,
  editado_em timestamptz,
  deletado_em timestamptz,
  reacao text,
  created_at timestamptz not null default now(),
  unique (company_id, provider, whatsapp_message_id)
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  attachment_key text not null,
  provider_attachment_id text,
  kind text not null,
  provider_url text,
  storage_key text,
  storage_url text,
  mime_type text,
  file_name text,
  size_bytes bigint,
  sha256 text,
  created_at timestamptz not null default now(),
  unique (mensagem_id, attachment_key)
);

create table if not exists public.message_status_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  mensagem_id uuid references public.mensagens(id) on delete cascade,
  external_message_id text not null,
  status text not null check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  error_message text,
  raw_payload jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, external_message_id, status, occurred_at)
);

create table if not exists public.contact_pause (
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  numero text not null,
  pausado boolean not null default false,
  pausado_por text,
  pausado_em timestamptz,
  updated_at timestamptz not null default now(),
  primary key (company_id, numero)
);

create table if not exists public.message_hsm_template (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  nome text not null,
  idioma text not null default 'pt_BR',
  categoria text not null default 'UTILITY',
  corpo text not null,
  header_tipo text not null default 'NONE',
  header_conteudo text,
  rodape text,
  botoes jsonb not null default '[]',
  variaveis jsonb not null default '[]',
  status text not null default 'PENDING',
  meta_template_id text,
  meta_ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, nome, idioma)
);

create table if not exists public.outbound_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  mensagem_id uuid references public.mensagens(id) on delete set null,
  kind text not null,
  payload jsonb not null,
  status text not null default 'pending',
  tentativas integer not null default 0,
  max_tentativas integer not null default 5,
  proxima_em timestamptz not null default now(),
  ultimo_erro text,
  idempotency_key text unique default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  acao text not null,
  recurso text,
  detalhes jsonb,
  actor_email text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists mensagens_thread_idx on public.mensagens(company_id, numero, created_at desc);
create index if not exists mensagens_external_idx on public.mensagens(provider, whatsapp_message_id);
create index if not exists cards_stage_idx on public.crm_cards(company_id, pipeline_id, stage_id, ultima_em desc);
create index if not exists outbound_ready_idx on public.outbound_queue(status, proxima_em);
create index if not exists status_external_idx on public.message_status_events(company_id, external_message_id, occurred_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['company','profiles','company_user','whatsapp_instances','crm_pipeline','crm_cards','contact_pause','message_hsm_template','outbound_queue'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create or replace function public.user_has_company(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_user cu
    where cu.company_id = target_company
      and cu.user_id = auth.uid()
      and cu.ativo = true
  );
$$;

create or replace function public.user_company_role(target_company uuid)
returns public.tenant_role
language sql
stable
security definer
set search_path = public
as $$
  select cu.role from public.company_user cu
  where cu.company_id = target_company
    and cu.user_id = auth.uid()
    and cu.ativo = true
  limit 1;
$$;

alter table public.company enable row level security;
alter table public.profiles enable row level security;
alter table public.company_user enable row level security;
alter table public.whatsapp_instances enable row level security;
alter table public.company_user_instance enable row level security;
alter table public.messaging_inbox_events enable row level security;
alter table public.crm_pipeline enable row level security;
alter table public.crm_stage enable row level security;
alter table public.crm_cards enable row level security;
alter table public.mensagens enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_status_events enable row level security;
alter table public.contact_pause enable row level security;
alter table public.message_hsm_template enable row level security;
alter table public.outbound_queue enable row level security;
alter table public.audit_log enable row level security;

create policy company_member_select on public.company for select using (public.user_has_company(id));
create policy company_admin_update on public.company for update using (public.user_company_role(id) in ('owner','admin')) with check (public.user_company_role(id) in ('owner','admin'));
create policy profiles_self_select on public.profiles for select using (user_id = auth.uid());
create policy profiles_self_insert on public.profiles for insert with check (user_id = auth.uid());
create policy profiles_self_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy company_user_member_select on public.company_user for select using (public.user_has_company(company_id));
create policy company_user_admin_write on public.company_user for all using (public.user_company_role(company_id) in ('owner','admin')) with check (public.user_company_role(company_id) in ('owner','admin'));
create policy company_user_instance_access on public.company_user_instance for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));

do $$
declare t text;
begin
  foreach t in array array[
    'whatsapp_instances','crm_pipeline','crm_stage','crm_cards','mensagens',
    'message_attachments','message_status_events','contact_pause',
    'message_hsm_template','outbound_queue'
  ] loop
    execute format(
      'create policy %I on public.%I for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id))',
      t || '_company_access', t
    );
  end loop;
end $$;

create policy audit_member_insert on public.audit_log for insert with check (public.user_has_company(company_id));
create policy audit_admin_select on public.audit_log for select using (public.user_company_role(company_id) in ('owner','admin'));

create or replace function public.bootstrap_capiversa_company(company_name text, company_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  company_id uuid;
  pipeline_id uuid;
begin
  if uid is null then raise exception 'Autenticación requerida'; end if;
  if exists (select 1 from public.company_user where user_id = uid) then
    raise exception 'El usuario ya pertenece a una empresa';
  end if;

  insert into public.company(nome, slug, created_by, onboarding_completed, wa_provider)
  values (trim(company_name), lower(trim(company_slug)), uid, true, 'lovable_whatsapp')
  returning id into company_id;

  insert into public.profiles(user_id, email, nome)
  select uid, email, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
  from auth.users where id = uid
  on conflict (user_id) do nothing;

  insert into public.company_user(company_id, user_id, role, max_chats)
  values (company_id, uid, 'owner', 4);

  insert into public.crm_pipeline(company_id, nome, tipo, entrada, sistema)
  values (company_id, 'Atención y ventas', 'vendas', true, true)
  returning id into pipeline_id;

  insert into public.crm_stage(company_id, pipeline_id, nome, cor, ordem, tipo, modo_atendimento)
  values
    (company_id, pipeline_id, 'Nuevo contacto', '#3B82F6', 0, 'normal', 'ia'),
    (company_id, pipeline_id, 'Atención humana', '#F59E0B', 1, 'normal', 'manual'),
    (company_id, pipeline_id, 'Seguimiento', '#8B5CF6', 2, 'normal', 'manual'),
    (company_id, pipeline_id, 'Ganado', '#10B981', 3, 'ganho', 'manual'),
    (company_id, pipeline_id, 'Perdido', '#EF4444', 4, 'perda', 'manual');

  insert into public.audit_log(company_id, user_id, acao, recurso, detalhes)
  values (company_id, uid, 'company.bootstrap', 'company', jsonb_build_object('version', '1.1.0'));

  return company_id;
end;
$$;

revoke all on function public.bootstrap_capiversa_company(text, text) from public;
grant execute on function public.bootstrap_capiversa_company(text, text) to authenticated;
