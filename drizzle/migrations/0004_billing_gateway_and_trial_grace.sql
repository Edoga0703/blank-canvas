alter table public.app_config add column if not exists gateway_padrao text not null default 'kiwify';
alter table public.app_config add column if not exists gateway_portal_url text;

create or replace function public.company_write_allowed(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or coalesce((
    select case
      when c.status_cobranca = 'ativo' then true
      when c.status_cobranca = 'trial' and c.trial_ate > now() then true
      else false
    end
    from public.company c
    where c.id = _company_id
  ), false);
$$;

grant execute on function public.company_write_allowed(uuid) to authenticated, service_role;

drop policy if exists crm_cards_access on public.crm_cards;

create policy crm_cards_select on public.crm_cards
for select to authenticated
using (is_super_admin() or has_company_access(company_id));

create policy crm_cards_insert on public.crm_cards
for insert to authenticated
with check ((is_super_admin() or has_company_access(company_id)) and public.company_write_allowed(company_id));

create policy crm_cards_update on public.crm_cards
for update to authenticated
using ((is_super_admin() or has_company_access(company_id)) and public.company_write_allowed(company_id))
with check ((is_super_admin() or has_company_access(company_id)) and public.company_write_allowed(company_id));

create policy crm_cards_delete on public.crm_cards
for delete to authenticated
using ((is_super_admin() or has_company_access(company_id)) and public.company_write_allowed(company_id));