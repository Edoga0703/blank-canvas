-- Notificações de conteúdo Meta usam identificadores compostos
-- (por exemplo: meta:comment:<id>). O campo precisa aceitar texto, não UUID.
do $$
begin
  if to_regclass('public.notificacao') is not null then
    alter table public.notificacao
      alter column ref_id type text using ref_id::text;

    alter table public.notificacao
      drop constraint if exists notificacao_tipo_check;

    alter table public.notificacao
      add constraint notificacao_tipo_check check (
        tipo = any (array[
          'geral',
          'lead_novo',
          'conexao_caiu',
          'campanha_finalizada',
          'chamado_respondido',
          'agendamento_proximo',
          'comentario_meta',
          'mencion_meta',
          'reacao_meta'
        ])
      );
  end if;
end $$;

-- Remove a assinatura UUID criada por uma migração anterior para evitar
-- sobrecarga ambígua e aceita referências textuais compostas.
drop function if exists public.push_notificacao(uuid, text, text, text, text, uuid, uuid);
drop function if exists public.push_notificacao(uuid, text, text, text, text, text);

create or replace function public.push_notificacao(
  _company_id uuid,
  _tipo text default 'geral',
  _titulo text default '',
  _descricao text default null,
  _link text default null,
  _ref_id text default null,
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

revoke all on function public.push_notificacao(uuid, text, text, text, text, text, uuid) from public;
grant execute on function public.push_notificacao(uuid, text, text, text, text, text, uuid) to authenticated, service_role;
