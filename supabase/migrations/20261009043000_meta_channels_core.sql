-- Capiversa v1.1 - sesion temporal para OAuth de Instagram/Messenger.
-- La tabla no expone politicas a usuarios finales: solo las funciones de
-- servidor con service role pueden crear, leer o consumir estas sesiones.

create extension if not exists pgcrypto;

create table if not exists public.meta_oauth_session (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_token text not null,
  consumed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists meta_oauth_session_expiry_idx
  on public.meta_oauth_session (expires_at);

create index if not exists meta_oauth_session_owner_idx
  on public.meta_oauth_session (user_id, company_id);

alter table public.meta_oauth_session enable row level security;

-- No se crean policies para authenticated/anon. El service role omite RLS.
revoke all on table public.meta_oauth_session from anon, authenticated;

comment on table public.meta_oauth_session is
  'Sesion temporal server-only para completar Meta OAuth; se elimina al consumirla.';
