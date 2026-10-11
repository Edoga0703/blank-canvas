-- Fase 1 Meta: activos formales, histórico de contenido, Stories y base para Meta Ads.
-- Migración versionada equivalente a docs/sql/20261011_meta_phase1_assets_content_history.sql.
-- Idempotente: segura en bases donde las tablas ya existen.
-- Los tokens NO se guardan aquí: siguen server-only en whatsapp_instances.instance_token.
-- La idempotencia de eventos de webhook (provider + external_event_id) ya existe en
-- messaging_inbox_events.unique(provider, external_event_id); no se duplica.

-- ───────────── A. Activos Meta ─────────────
create table if not exists public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  meta_user_id text,
  label text,
  status text not null default 'active' check (status in ('active','degraded','expired','revoked')),
  granted_scopes text[] not null default '{}',
  last_checked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists meta_connections_company_user_uidx
  on public.meta_connections (company_id, meta_user_id) where meta_user_id is not null;

create table if not exists public.meta_social_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  connection_id uuid references public.meta_connections(id) on delete set null,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  network text not null check (network in ('facebook','instagram')),
  provider text not null,
  external_id text not null,
  page_id text,
  ig_user_id text,
  linked_account_id uuid references public.meta_social_accounts(id) on delete set null,
  username text,
  display_name text,
  picture_url text,
  capabilities jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','degraded','expired','disconnected')),
  sync_cursor jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, network, external_id)
);
create index if not exists meta_social_accounts_instance_idx on public.meta_social_accounts (instance_id);
create index if not exists meta_social_accounts_page_idx on public.meta_social_accounts (company_id, page_id);

-- ───────────── B. Histórico de contenido ─────────────
create table if not exists public.meta_content_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  social_account_id uuid references public.meta_social_accounts(id) on delete set null,
  network text not null check (network in ('facebook','instagram')),
  external_post_id text not null,
  format text not null default 'other' check (format in ('photo','video','reel','story','carousel','text','link','other')),
  media_type text,
  media_product_type text,
  caption text,
  permalink text,
  media_url text,
  thumbnail_url text,
  archived_media_key text,
  archived_thumbnail_key text,
  published_at timestamptz,
  expires_at timestamptz,
  metrics_latest jsonb not null default '{}'::jsonb,
  raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, network, external_post_id)
);
create index if not exists meta_content_posts_account_pub_idx on public.meta_content_posts (social_account_id, published_at desc);
create index if not exists meta_content_posts_company_pub_idx on public.meta_content_posts (company_id, published_at desc);

create table if not exists public.meta_content_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  post_id uuid not null references public.meta_content_posts(id) on delete cascade,
  position integer not null default 0,
  external_media_id text,
  media_type text,
  media_url text,
  thumbnail_url text,
  storage_key text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, position)
);

create table if not exists public.meta_content_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  post_id uuid references public.meta_content_posts(id) on delete cascade,
  social_account_id uuid references public.meta_social_accounts(id) on delete set null,
  network text not null check (network in ('facebook','instagram')),
  external_comment_id text not null,
  external_post_id text,
  parent_external_id text,
  author_id text,
  author_name text,
  author_username text,
  text text,
  like_count integer,
  reply_count integer,
  is_hidden boolean,
  is_own boolean not null default false,
  status text not null default 'visible',
  commented_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, network, external_comment_id)
);
create index if not exists meta_content_comments_post_idx on public.meta_content_comments (post_id, commented_at);

create table if not exists public.meta_content_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  post_id uuid not null references public.meta_content_posts(id) on delete cascade,
  social_account_id uuid references public.meta_social_accounts(id) on delete set null,
  collected_date date not null,
  collected_at timestamptz not null default now(),
  likes integer, comments integer, shares integer, saves integer,
  reach integer, impressions integer, views integer, total_interactions integer,
  replies integer, avg_watch_time_ms bigint, total_watch_time_ms bigint,
  raw_metrics jsonb,
  unavailable jsonb,
  source text not null default 'sync',
  unique (post_id, collected_date)
);

create table if not exists public.meta_profile_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  social_account_id uuid not null references public.meta_social_accounts(id) on delete cascade,
  snapshot_date date not null,
  collected_at timestamptz not null default now(),
  followers integer, follows integer, media_count integer,
  reach integer, impressions integer, profile_views integer, accounts_engaged integer,
  raw jsonb,
  unavailable jsonb,
  unique (social_account_id, snapshot_date)
);

create table if not exists public.meta_sync_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  social_account_id uuid references public.meta_social_accounts(id) on delete set null,
  kind text not null default 'content',
  trigger text not null default 'manual',
  status text not null default 'running' check (status in ('running','ok','partial','failed')),
  counts jsonb not null default '{}'::jsonb,
  stages jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists meta_sync_runs_company_idx on public.meta_sync_runs (company_id, started_at desc);

create table if not exists public.meta_stories_sync_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running','ok','partial','failed','stale')),
  accounts_processed integer not null default 0,
  stories_found integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  snapshots integer not null default 0,
  archived integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
-- Una sola ejecución en curso a la vez (bloqueo de concurrencia).
create unique index if not exists meta_stories_sync_runs_single_running
  on public.meta_stories_sync_runs ((true)) where status = 'running';

-- ───────────── I. Preparación Meta Ads (fase 2) ─────────────
create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  connection_id uuid references public.meta_connections(id) on delete set null,
  external_id text not null,
  name text, currency text, timezone_name text, account_status integer,
  raw jsonb, last_synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, external_id)
);
create table if not exists public.meta_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  external_id text not null,
  name text, objective text, status text, effective_status text,
  daily_budget numeric, lifetime_budget numeric, start_time timestamptz, stop_time timestamptz,
  raw jsonb, last_synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, external_id)
);
create table if not exists public.meta_ad_sets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  campaign_id uuid not null references public.meta_ad_campaigns(id) on delete cascade,
  external_id text not null,
  name text, status text, optimization_goal text, billing_event text,
  daily_budget numeric, lifetime_budget numeric, targeting jsonb,
  raw jsonb, last_synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, external_id)
);
create table if not exists public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  ad_set_id uuid not null references public.meta_ad_sets(id) on delete cascade,
  external_id text not null,
  name text, status text, creative_id text, effective_object_story_id text,
  raw jsonb, last_synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, external_id)
);
create table if not exists public.meta_ad_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  level text not null check (level in ('account','campaign','adset','ad')),
  object_external_id text not null,
  snapshot_date date not null,
  spend numeric, impressions bigint, reach bigint, clicks bigint, ctr numeric, cpc numeric, cpm numeric,
  actions jsonb, raw jsonb,
  collected_at timestamptz not null default now(),
  unique (company_id, level, object_external_id, snapshot_date)
);
create table if not exists public.meta_ad_post_attributions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  ad_id uuid not null references public.meta_ads(id) on delete cascade,
  post_id uuid not null references public.meta_content_posts(id) on delete cascade,
  source text not null default 'effective_object_story_id',
  created_at timestamptz not null default now(),
  unique (ad_id, post_id)
);
create table if not exists public.meta_content_post_paid_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  post_id uuid not null references public.meta_content_posts(id) on delete cascade,
  snapshot_date date not null,
  spend numeric, paid_impressions bigint, paid_reach bigint, paid_clicks bigint, raw jsonb,
  collected_at timestamptz not null default now(),
  unique (post_id, snapshot_date)
);

-- ───────────── RLS: lectura por empresa, escritura solo servidor ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'meta_connections','meta_social_accounts','meta_content_posts','meta_content_media',
    'meta_content_comments','meta_content_metric_snapshots','meta_profile_metric_snapshots',
    'meta_sync_runs','meta_ad_accounts','meta_ad_campaigns','meta_ad_sets','meta_ads',
    'meta_ad_metric_snapshots','meta_ad_post_attributions','meta_content_post_paid_metrics'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_company_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.user_has_company(company_id))', t || '_company_select', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Ejecuciones globales del cron de Stories: solo servidor.
alter table public.meta_stories_sync_runs enable row level security;
grant all on public.meta_stories_sync_runs to service_role;

-- ───────────── Cron opcional (requiere pg_cron + pg_net y CRON_SECRET) ─────────────
-- select cron.schedule('meta-stories-capture', '0 */4 * * *', $cron$
--   select net.http_post(
--     url := 'https://capiconversa.com/api/public/hooks/meta-stories',
--     headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
--     body := '{}'::jsonb);
-- $cron$);
