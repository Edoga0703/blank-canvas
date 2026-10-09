-- Full supplementary tables and views for Capiversa CRM v1.1

create or replace view public.team_profiles as
select user_id, nome, avatar_url from public.profiles;

create table if not exists public.department (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  nome text not null,
  cor text default '#3B82F6',
  descricao text,
  ativo boolean not null default true,
  pipeline_id uuid references public.crm_pipeline(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.department enable row level security;
drop policy if exists department_company_access on public.department;
create policy department_company_access on public.department
for all using (public.user_has_company(company_id))
with check (public.user_has_company(company_id));

create table if not exists public.agent_config (
  agendamento_ativo boolean not null default false,
  ai_model text not null default '',
  ai_provider text not null default '',
  antecedencia_min text not null default '',
  apresentacao text not null default '',
  assinar_mensagens boolean,
  avatar_prompt text,
  avatar_traits jsonb,
  avatar_url text,
  chamar_por_nome boolean,
  como_vender text not null default '',
  company_id uuid not null,
  cupom text not null default '',
  descricao_negocio text not null default '',
  diferenciais text not null default '',
  duracao_padrao text not null default '',
  emoji_intensidade text,
  estilo_comunicacao text not null default '',
  evitar_palavras text,
  exemplos_few_shot jsonb not null default '{}'::jsonb,
  faq text not null default '',
  foco_atendimento text,
  formalidade numeric not null default 0,
  formas_pagamento text not null default '',
  handoff_mode text not null default '',
  handoff_rr_index numeric not null default 0,
  handoff_user_ids text[] not null default array[]::text[],
  horarios_atendimento jsonb not null default '{}'::jsonb,
  horarios_disponiveis text not null default '',
  id uuid primary key default gen_random_uuid(),
  idioma text,
  is_default boolean not null default false,
  knowledge_files jsonb,
  mensagem_fora_horario text not null default '',
  menu_setores_ativo boolean not null default false,
  menu_setores_opcoes jsonb not null default '{}'::jsonb,
  menu_setores_texto text not null default '',
  nao_pode_fazer text not null default '',
  nome text not null default '',
  nome_agente text not null default '',
  nome_empresa text not null default '',
  objecoes text not null default '',
  ofertas text not null default '',
  olist_catalogo boolean not null default false,
  olist_pedido_auto boolean not null default false,
  palavra_despausar text not null default '',
  palavra_pausar text not null default '',
  papel_objetivo text not null default '',
  pedir_avaliacao boolean not null default false,
  perguntar_uma_por_vez boolean,
  personalidade text,
  pode_brincar boolean,
  pode_fazer text not null default '',
  politicas text not null default '',
  posvenda_msg text not null default '',
  proatividade numeric,
  produtos_servicos text not null default '',
  publico_alvo text not null default '',
  reativar_cliente boolean not null default false,
  regiao_horario text not null default '',
  regras_rigidas text,
  responder_em_partes boolean not null default false,
  segmento text not null default '',
  segundos_buffer numeric not null default 0,
  servicos_agendaveis text not null default '',
  sistema boolean not null default false,
  sobre_empresa text not null default '',
  tamanho_resposta text not null default '',
  telefone_transferencia text not null default '',
  ticket_medio text not null default '',
  tipo text not null default '',
  tom numeric not null default 0,
  updated_at timestamptz not null default now(),
  usar_emojis boolean not null default false,
  usar_girias boolean,
  user_id uuid not null,
  velocidade_resposta text
);
alter table public.agent_config enable row level security;
drop policy if exists agent_config_company_access on public.agent_config;
create policy agent_config_company_access on public.agent_config for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.crm_distribution_queues (
  ativo boolean not null default false,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  department_id uuid,
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  strategy text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.crm_distribution_queues enable row level security;
drop policy if exists crm_distribution_queues_company_access on public.crm_distribution_queues;
create policy crm_distribution_queues_company_access on public.crm_distribution_queues for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.crm_queue_members (
  ativo boolean not null default false,
  company_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  last_assigned_at timestamptz,
  leads_count numeric not null default 0,
  ordem numeric not null default 0,
  queue_id uuid not null,
  user_id uuid not null
);
alter table public.crm_queue_members enable row level security;
drop policy if exists crm_queue_members_company_access on public.crm_queue_members;
create policy crm_queue_members_company_access on public.crm_queue_members for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.company_user_pipeline (
  company_id uuid not null,
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null,
  user_id uuid not null
);
alter table public.company_user_pipeline enable row level security;
drop policy if exists company_user_pipeline_company_access on public.company_user_pipeline;
create policy company_user_pipeline_company_access on public.company_user_pipeline for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.department_member (
  created_at timestamptz not null default now(),
  department_id uuid not null,
  user_id uuid not null
);
alter table public.department_member enable row level security;
drop policy if exists department_member_read on public.department_member;
create policy department_member_read on public.department_member for select using (true);
drop policy if exists department_member_admin_manage on public.department_member;
create policy department_member_admin_manage on public.department_member for all using (public.is_super_admin()) with check (public.is_super_admin());


create table if not exists public.department_menu_session (
  agent_config_id uuid not null,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  department_id uuid,
  id uuid primary key default gen_random_uuid(),
  last_inbound_message_id uuid,
  last_menu_at timestamptz,
  numero text not null default '',
  resolved_at timestamptz,
  status text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.department_menu_session enable row level security;
drop policy if exists department_menu_session_company_access on public.department_menu_session;
create policy department_menu_session_company_access on public.department_menu_session for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.crm_goals (
  company_id uuid not null,
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  user_id uuid,
  value_cents numeric not null default 0,
  year_month text not null default ''
);
alter table public.crm_goals enable row level security;
drop policy if exists crm_goals_company_access on public.crm_goals;
create policy crm_goals_company_access on public.crm_goals for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.crm_card_stage_history (
  card_id uuid not null,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  moved_by text,
  pipeline_id uuid,
  stage_from text,
  stage_from_nome text,
  stage_to text,
  stage_to_nome text,
  tempo_na_etapa_seg numeric
);
alter table public.crm_card_stage_history enable row level security;
drop policy if exists crm_card_stage_history_company_access on public.crm_card_stage_history;
create policy crm_card_stage_history_company_access on public.crm_card_stage_history for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.crm_venda (
  canal text,
  card_id uuid,
  company_id uuid not null,
  contato_nome text,
  contato_numero text,
  created_at timestamptz not null default now(),
  created_by text,
  custo_lead_cents numeric,
  descricao text,
  fin_lancamento_id uuid,
  id uuid primary key default gen_random_uuid(),
  item_id uuid,
  item_nome text,
  item_tipo text,
  metodo_pagamento text,
  observacao text,
  olist_pedido_id uuid,
  olist_situacao text,
  owner_id uuid,
  pipeline_id uuid,
  stage_id uuid,
  updated_at timestamptz not null default now(),
  valor_cents numeric not null default 0,
  vendido_em timestamptz
);
alter table public.crm_venda enable row level security;
drop policy if exists crm_venda_company_access on public.crm_venda;
create policy crm_venda_company_access on public.crm_venda for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.produto (
  agendavel boolean not null default false,
  ativo boolean not null default false,
  categoria text,
  company_id uuid not null,
  cor text,
  created_at timestamptz not null default now(),
  descricao text,
  duracao_min numeric,
  foto_url text,
  id uuid primary key default gen_random_uuid(),
  legacy_servico_id uuid,
  nome text not null default '',
  olist_id uuid,
  ordem numeric not null default 0,
  preco numeric not null default 0,
  sku text,
  tipo text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.produto enable row level security;
drop policy if exists produto_company_access on public.produto;
create policy produto_company_access on public.produto for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.servico (
  ativo boolean not null default false,
  company_id uuid not null,
  cor text,
  created_at timestamptz not null default now(),
  duracao_min numeric not null default 0,
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  updated_at timestamptz not null default now(),
  valor_cents numeric not null default 0
);
alter table public.servico enable row level security;
drop policy if exists servico_company_access on public.servico;
create policy servico_company_access on public.servico for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.campaign (
  agendado_para text,
  aquecimento_ativo boolean not null default false,
  aquecimento_dia_inicio text,
  checar_numero boolean not null default false,
  company_id uuid not null,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  custom_targets jsonb not null default '{}'::jsonb,
  descricao text,
  enviados_hoje numeric not null default 0,
  enviados_hoje_data text,
  filtro_tags text[] not null default array[]::text[],
  id uuid primary key default gen_random_uuid(),
  iniciado_em timestamptz,
  intervalo_max_seg numeric not null default 0,
  intervalo_min_seg numeric not null default 0,
  janela_dias text not null default '',
  janela_hora_fim text not null default '',
  janela_hora_ini text not null default '',
  limite_diario numeric not null default 0,
  media_url text,
  mensagem text not null default '',
  midia_nome text,
  midia_tipo text,
  midia_url_v2 text,
  nome text not null default '',
  origem_destinatarios text not null default '',
  pausa_apos_envios numeric not null default 0,
  pausa_duracao_min numeric not null default 0,
  provider text not null default '',
  proximo_envio_em timestamptz,
  pular_ativos_dias numeric not null default 0,
  simular_digitacao boolean not null default false,
  status text not null default '',
  timezone text not null default '',
  total_destinatarios numeric not null default 0,
  total_entregues numeric not null default 0,
  total_enviados numeric not null default 0,
  total_falhas numeric not null default 0,
  total_lidas numeric not null default 0,
  updated_at timestamptz not null default now(),
  velocidade_msg_seg numeric not null default 0,
  whatsapp_instance_id uuid
);
alter table public.campaign enable row level security;
drop policy if exists campaign_company_access on public.campaign;
create policy campaign_company_access on public.campaign for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.campaign_target (
  campaign_id uuid not null,
  company_id uuid not null,
  contato_nome text,
  contato_numero text not null default '',
  created_at timestamptz not null default now(),
  enviado_em timestamptz,
  erro text,
  id uuid primary key default gen_random_uuid(),
  max_tentativas numeric not null default 0,
  proxima_em timestamptz,
  status text not null default '',
  tentativas numeric not null default 0
);
alter table public.campaign_target enable row level security;
drop policy if exists campaign_target_company_access on public.campaign_target;
create policy campaign_target_company_access on public.campaign_target for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.campaign_blocklist (
  company_id uuid not null,
  created_at timestamptz not null default now(),
  created_by text,
  id uuid primary key default gen_random_uuid(),
  motivo text,
  numero text not null default ''
);
alter table public.campaign_blocklist enable row level security;
drop policy if exists campaign_blocklist_company_access on public.campaign_blocklist;
create policy campaign_blocklist_company_access on public.campaign_blocklist for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.campaign_optout (
  company_id uuid not null,
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  motivo text,
  numero text not null default '',
  origem text not null default ''
);
alter table public.campaign_optout enable row level security;
drop policy if exists campaign_optout_company_access on public.campaign_optout;
create policy campaign_optout_company_access on public.campaign_optout for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.integracao_chave (
  auto_envio boolean not null default false,
  company_id uuid not null,
  conectado boolean not null default false,
  created_at timestamptz not null default now(),
  credencial text not null default '',
  extra jsonb not null default '{}'::jsonb,
  id uuid primary key default gen_random_uuid(),
  servico text not null default '',
  ultima_sync text,
  ultimo_resultado text,
  updated_at timestamptz not null default now()
);
alter table public.integracao_chave enable row level security;
drop policy if exists integracao_chave_company_access on public.integracao_chave;
create policy integracao_chave_company_access on public.integracao_chave for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.google_integration (
  access_token text,
  calendar_id uuid,
  channel_expira_em timestamptz,
  channel_id uuid,
  channel_token text,
  company_id uuid not null,
  conectado boolean not null default false,
  email text,
  expiry text,
  precisa_reconectar boolean not null default false,
  refresh_token text,
  resource_id uuid,
  sync_token text,
  ultima_sync_em timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.google_integration enable row level security;
drop policy if exists google_integration_company_access on public.google_integration;
create policy google_integration_company_access on public.google_integration for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.olist_integration (
  auto_pedido boolean not null default false,
  company_id uuid not null,
  conectado boolean not null default false,
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  token text not null default '',
  ultima_sync text,
  ultimo_resultado text,
  updated_at timestamptz not null default now()
);
alter table public.olist_integration enable row level security;
drop policy if exists olist_integration_company_access on public.olist_integration;
create policy olist_integration_company_access on public.olist_integration for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.prospeccao_lead (
  abordagem_analise text,
  abordagem_em timestamptz,
  abordagem_foco text,
  abordagem_texto text,
  avaliacoes numeric,
  busca text,
  card_id uuid,
  categoria text,
  cidade text,
  cnpj text,
  company_id uuid,
  created_at timestamptz not null default now(),
  criado_por text,
  dados jsonb not null default '{}'::jsonb,
  disparo_em timestamptz,
  disparo_por text,
  email text,
  endereco text,
  fonte text not null default '',
  id uuid primary key default gen_random_uuid(),
  lote_em timestamptz,
  lote_id uuid,
  nome text not null default '',
  place_id uuid,
  rating numeric,
  site text,
  site_dados jsonb not null default '{}'::jsonb,
  site_diagnostico text,
  site_nota numeric,
  site_oportunidades text,
  site_status text,
  site_verificado_em timestamptz,
  status text not null default '',
  telefone text,
  uf text
);
alter table public.prospeccao_lead enable row level security;
drop policy if exists prospeccao_lead_company_access on public.prospeccao_lead;
create policy prospeccao_lead_company_access on public.prospeccao_lead for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.lead_nota (
  autor_id uuid,
  card_id uuid not null,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  texto text not null default ''
);
alter table public.lead_nota enable row level security;
drop policy if exists lead_nota_company_access on public.lead_nota;
create policy lead_nota_company_access on public.lead_nota for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.lead_evento (
  card_id uuid not null,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  descricao text,
  id uuid primary key default gen_random_uuid(),
  tipo text not null default ''
);
alter table public.lead_evento enable row level security;
drop policy if exists lead_evento_company_access on public.lead_evento;
create policy lead_evento_company_access on public.lead_evento for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.lead_form (
  ativo boolean not null default false,
  campos jsonb not null default '{}'::jsonb,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  distribution_queue_id uuid,
  id uuid primary key default gen_random_uuid(),
  mensagem_sucesso text not null default '',
  nome text not null default '',
  owner_id uuid,
  owner_mode text not null default '',
  pipeline_id uuid,
  pos_envio text not null default '',
  redirect_url text,
  slug text not null default '',
  stage_id uuid,
  submits numeric not null default 0,
  tags text[] not null default array[]::text[],
  theme jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  valor_padrao numeric,
  views numeric not null default 0,
  wa_auto_enviar boolean not null default false,
  wa_mensagem text
);
alter table public.lead_form enable row level security;
drop policy if exists lead_form_company_access on public.lead_form;
create policy lead_form_company_access on public.lead_form for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));


create table if not exists public.plugin (
  auth_tipo text not null default '',
  banner_subtitulo text,
  banner_titulo text,
  banner_url text,
  capa_url text,
  capacidade_slug text,
  categoria text not null default '',
  checkout_url text,
  config_schema jsonb not null default '{}'::jsonb,
  cor_fundo text,
  created_at timestamptz not null default now(),
  descricao text,
  descricao_longa text,
  destaque boolean not null default false,
  docs_url text,
  external_product_id uuid,
  gratuito boolean not null default false,
  icone text,
  id uuid primary key default gen_random_uuid(),
  modulo_rota text,
  nome text not null default '',
  ordem numeric not null default 0,
  plano_minimo text not null default '',
  preco_mensal numeric not null default 0,
  screenshots jsonb not null default '{}'::jsonb,
  slug text not null default '',
  status text not null default '',
  tagline text,
  tipo_efeito text not null default '',
  updated_at timestamptz not null default now(),
  visivel_para_clientes boolean not null default false
);
alter table public.plugin enable row level security;
drop policy if exists plugin_read on public.plugin;
create policy plugin_read on public.plugin for select using (true);
drop policy if exists plugin_admin_manage on public.plugin;
create policy plugin_admin_manage on public.plugin for all using (public.is_super_admin()) with check (public.is_super_admin());


create table if not exists public.company_plugin (
  assinatura_status text not null default '',
  ativo boolean not null default false,
  canceled_at timestamptz,
  company_id uuid not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  current_period_end text,
  id uuid primary key default gen_random_uuid(),
  instalado boolean not null default false,
  plugin_id uuid not null,
  preco_cents numeric not null default 0,
  status text not null default '',
  trial_ends_at timestamptz,
  ultimo_erro text,
  updated_at timestamptz not null default now()
);
alter table public.company_plugin enable row level security;
drop policy if exists company_plugin_company_access on public.company_plugin;
create policy company_plugin_company_access on public.company_plugin for all using (public.user_has_company(company_id)) with check (public.user_has_company(company_id));

