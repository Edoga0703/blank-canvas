-- Migration: Full 119 Tables Parity (from Lovable project a57fce3f-039f-43e6-86c3-453ef60a866f)
-- Generated automatically for Supabase project llnfjhqdeeuscyqzoqfz

SET check_function_bodies = false;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. BASE DDL (11 ENUMS, 118 TABLES, CONSTRAINTS & INDEXES)
-- ============================================================
-- Capi Conversa — DDL completo del esquema public (118 tablas, 11 enums)
-- Solo estructura: sin datos, RLS, funciones ni triggers.
SET check_function_bodies = false;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'super_admin'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: campaign_status; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.campaign_status AS ENUM (
    'rascunho',
    'agendada',
    'enviando',
    'pausada',
    'concluida',
    'cancelada'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: campaign_target_status; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.campaign_target_status AS ENUM (
    'pendente',
    'enviado',
    'falhou',
    'pulado'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: feature_rollout; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.feature_rollout AS ENUM (
    'interno',
    'beta',
    'publico'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: fin_forma; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.fin_forma AS ENUM (
    'pix',
    'boleto',
    'cartao',
    'dinheiro',
    'transferencia',
    'outro'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: fin_status; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.fin_status AS ENUM (
    'pendente',
    'pago',
    'atrasado',
    'cancelado'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: fin_tipo; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.fin_tipo AS ENUM (
    'receita',
    'despesa'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: stage_tipo; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.stage_tipo AS ENUM (
    'normal',
    'ganho',
    'perda'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: tenant_role; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.tenant_role AS ENUM (
    'owner',
    'admin',
    'atendente'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: whatsapp_billing_status; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.whatsapp_billing_status AS ENUM (
    'free',
    'pending_payment',
    'active',
    'past_due',
    'canceled'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: whatsapp_provider_type; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.whatsapp_provider_type AS ENUM (
    'evolution',
    'uazapi',
    'oficial_meta',
    'wablast'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

--
-- Name: addon_product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.addon_product (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nome text NOT NULL,
    descricao text,
    tipo text NOT NULL,
    preco_cents integer DEFAULT 0 NOT NULL,
    moeda text DEFAULT 'BRL'::text NOT NULL,
    intervalo text DEFAULT 'month'::text NOT NULL,
    checkout_url text,
    provider text DEFAULT 'kiwify'::text,
    external_product_id text,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    concede_usuarios integer DEFAULT 0 NOT NULL,
    concede_conexoes integer DEFAULT 0 NOT NULL,
    CONSTRAINT addon_product_intervalo_check CHECK ((intervalo = ANY (ARRAY['month'::text, 'year'::text]))),
    CONSTRAINT addon_product_tipo_check CHECK ((tipo = ANY (ARRAY['whatsapp_uazapi'::text, 'whatsapp_meta'::text, 'custom'::text])))
);

--
-- Name: admin_automation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admin_automation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_key text NOT NULL,
    nome text NOT NULL,
    descricao text,
    ativo boolean DEFAULT false NOT NULL,
    template text DEFAULT ''::text NOT NULL,
    offset_dias integer DEFAULT 0 NOT NULL,
    ordem smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: admin_automation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admin_automation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_key text NOT NULL,
    target_company_id uuid,
    numero text,
    status text DEFAULT 'enviado'::text NOT NULL,
    erro text,
    mensagem text,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: admin_broadcast; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admin_broadcast (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    mensagem text NOT NULL,
    link text,
    target_type text DEFAULT 'all'::text NOT NULL,
    target_value text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_broadcast_target_type_check CHECK ((target_type = ANY (ARRAY['all'::text, 'plan'::text, 'status'::text])))
);

--
-- Name: admin_broadcast_read; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.admin_broadcast_read (
    broadcast_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: agenda_bloqueio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agenda_bloqueio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    inicio timestamp with time zone NOT NULL,
    fim timestamp with time zone NOT NULL,
    motivo text,
    tipo text DEFAULT 'bloqueio'::text NOT NULL,
    recorrencia_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: agenda_disponibilidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agenda_disponibilidade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    weekday integer NOT NULL,
    start_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    end_time time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    interval_start time without time zone,
    interval_end time without time zone,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    duracao_padrao_min integer DEFAULT 30 NOT NULL,
    folga_min integer DEFAULT 0 NOT NULL,
    antecedencia_min_min integer DEFAULT 0 NOT NULL,
    antecedencia_max_dias integer DEFAULT 60 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: agenda_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agenda_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    acao text NOT NULL,
    dados_anteriores jsonb,
    dados_novos jsonb,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: agenda_local; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agenda_local (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    endereco text NOT NULL,
    padrao boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: agenda_participante; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agenda_participante (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    user_id uuid,
    card_id uuid,
    nome text,
    tipo text DEFAULT 'interno'::text NOT NULL,
    confirmacao text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: agenda_recorrencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agenda_recorrencia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    frequencia text DEFAULT 'semanal'::text NOT NULL,
    intervalo integer DEFAULT 1 NOT NULL,
    dias_semana integer[],
    ocorrencias integer,
    ate_data date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: agenda_tipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agenda_tipo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#0B22FE'::text NOT NULL,
    icone text,
    duracao_padrao_min integer DEFAULT 30 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: agendamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agendamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    card_id uuid,
    titulo text NOT NULL,
    inicio timestamp with time zone NOT NULL,
    fim timestamp with time zone NOT NULL,
    google_event_id text,
    status text DEFAULT 'agendado'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

--
-- Name: agent_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agent_config (
    user_id uuid NOT NULL,
    nome_agente text DEFAULT 'Atendente Virtual'::text NOT NULL,
    nome_empresa text DEFAULT ''::text NOT NULL,
    papel_objetivo text DEFAULT 'Atender clientes, tirar dúvidas e ajudar a fechar vendas.'::text NOT NULL,
    estilo_comunicacao text DEFAULT 'Cordial, profissional e objetivo. Usa emojis com moderação.'::text NOT NULL,
    sobre_empresa text DEFAULT ''::text NOT NULL,
    produtos_servicos text DEFAULT ''::text NOT NULL,
    pode_fazer text DEFAULT ''::text NOT NULL,
    nao_pode_fazer text DEFAULT ''::text NOT NULL,
    telefone_transferencia text DEFAULT ''::text NOT NULL,
    palavra_pausar text DEFAULT '/pausar'::text NOT NULL,
    palavra_despausar text DEFAULT '/despausar'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    segundos_buffer integer DEFAULT 8 NOT NULL,
    responder_em_partes boolean DEFAULT true NOT NULL,
    segmento text DEFAULT ''::text NOT NULL,
    descricao_negocio text DEFAULT ''::text NOT NULL,
    diferenciais text DEFAULT ''::text NOT NULL,
    publico_alvo text DEFAULT ''::text NOT NULL,
    regiao_horario text DEFAULT ''::text NOT NULL,
    ofertas text DEFAULT ''::text NOT NULL,
    cupom text DEFAULT ''::text NOT NULL,
    como_vender text DEFAULT ''::text NOT NULL,
    objecoes text DEFAULT ''::text NOT NULL,
    formas_pagamento text DEFAULT ''::text NOT NULL,
    ticket_medio text DEFAULT ''::text NOT NULL,
    faq text DEFAULT ''::text NOT NULL,
    politicas text DEFAULT ''::text NOT NULL,
    posvenda_msg text DEFAULT ''::text NOT NULL,
    pedir_avaliacao boolean DEFAULT false NOT NULL,
    reativar_cliente boolean DEFAULT false NOT NULL,
    tom integer DEFAULT 70 NOT NULL,
    formalidade integer DEFAULT 40 NOT NULL,
    usar_emojis boolean DEFAULT true NOT NULL,
    tamanho_resposta text DEFAULT 'curtas'::text NOT NULL,
    apresentacao text DEFAULT ''::text NOT NULL,
    agendamento_ativo boolean DEFAULT false NOT NULL,
    servicos_agendaveis text DEFAULT ''::text NOT NULL,
    duracao_padrao text DEFAULT '30 min'::text NOT NULL,
    horarios_disponiveis text DEFAULT ''::text NOT NULL,
    antecedencia_min text DEFAULT '2 horas'::text NOT NULL,
    ai_provider text DEFAULT 'gemini'::text NOT NULL,
    ai_model text DEFAULT 'google/gemini-2.5-flash'::text NOT NULL,
    horarios_atendimento jsonb DEFAULT '{"dias": {"0": null, "1": {"abre": "09:00", "fecha": "18:00"}, "2": {"abre": "09:00", "fecha": "18:00"}, "3": {"abre": "09:00", "fecha": "18:00"}, "4": {"abre": "09:00", "fecha": "18:00"}, "5": {"abre": "09:00", "fecha": "18:00"}, "6": null}, "enabled": false, "timezone": "America/Sao_Paulo"}'::jsonb NOT NULL,
    mensagem_fora_horario text DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Assim que abrirmos, retornamos por aqui. 🙏'::text NOT NULL,
    personalidade text DEFAULT 'padrao'::text,
    foco_atendimento text DEFAULT 'ambos'::text,
    emoji_intensidade text DEFAULT 'pouco'::text,
    usar_girias boolean DEFAULT false,
    chamar_por_nome boolean DEFAULT true,
    perguntar_uma_por_vez boolean DEFAULT true,
    pode_brincar boolean DEFAULT false,
    assinar_mensagens boolean DEFAULT false,
    proatividade integer DEFAULT 50,
    velocidade_resposta text DEFAULT 'humana'::text,
    evitar_palavras text,
    idioma text DEFAULT 'pt-BR'::text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text DEFAULT 'Agente principal'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    tipo text DEFAULT 'qualificacao'::text NOT NULL,
    sistema boolean DEFAULT true NOT NULL,
    regras_rigidas text,
    exemplos_few_shot jsonb DEFAULT '[]'::jsonb NOT NULL,
    handoff_mode text DEFAULT 'user'::text NOT NULL,
    handoff_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    handoff_rr_index integer DEFAULT 0 NOT NULL,
    avatar_url text,
    avatar_prompt text,
    avatar_traits jsonb,
    knowledge_files jsonb DEFAULT '[]'::jsonb,
    menu_setores_ativo boolean DEFAULT false NOT NULL,
    menu_setores_texto text DEFAULT ''::text NOT NULL,
    menu_setores_opcoes jsonb DEFAULT '[]'::jsonb NOT NULL,
    olist_catalogo boolean DEFAULT false NOT NULL,
    olist_pedido_auto boolean DEFAULT false NOT NULL,
    CONSTRAINT agent_config_ai_provider_check CHECK ((ai_provider = ANY (ARRAY['gemini'::text, 'openai'::text, 'anthropic'::text]))),
    CONSTRAINT agent_config_handoff_mode_check CHECK ((handoff_mode = ANY (ARRAY['user'::text, 'round_robin'::text]))),
    CONSTRAINT agent_config_tipo_check CHECK ((tipo = ANY (ARRAY['qualificacao'::text, 'followup'::text, 'posvenda'::text])))
);

--
-- Name: agent_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agent_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid,
    agent_tipo text,
    mensagem_id uuid,
    numero text,
    rating text NOT NULL,
    nota text,
    mensagem_texto text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_feedback_rating_check CHECK ((rating = ANY (ARRAY['up'::text, 'down'::text])))
);

--
-- Name: ai_message_processing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.ai_message_processing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    inbound_message_id text NOT NULL,
    numero text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_message_processing_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text, 'skipped'::text])))
);

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    content text,
    image_url text,
    button_text text,
    button_link text,
    size text DEFAULT 'md'::text,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    show_frequency text DEFAULT 'once'::text,
    display_time_seconds integer DEFAULT 10,
    CONSTRAINT announcements_show_frequency_check CHECK ((show_frequency = ANY (ARRAY['once'::text, 'always'::text, 'daily'::text]))),
    CONSTRAINT announcements_size_check CHECK ((size = ANY (ARRAY['sm'::text, 'md'::text, 'lg'::text, 'full'::text])))
);

--
-- Name: api_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.api_token (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    label text NOT NULL,
    token text DEFAULT (('azp_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    criado_por uuid,
    ultimo_uso_em timestamp with time zone,
    revogado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.app_config (
    id boolean DEFAULT true NOT NULL,
    super_admin_emails text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_capacity jsonb DEFAULT '{}'::jsonb NOT NULL,
    emissor jsonb DEFAULT '{}'::jsonb NOT NULL,
    gateway_padrao text DEFAULT 'kiwify'::text NOT NULL,
    gateway_portal_url text,
    CONSTRAINT app_config_singleton CHECK ((id = true))
);

--
-- Name: app_user_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.app_user_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    connector_id text NOT NULL,
    connection_key_ciphertext text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: atendimento_live_analise; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.atendimento_live_analise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    numero text NOT NULL,
    contato_nome text,
    solicitacao text DEFAULT ''::text NOT NULL,
    andamento text DEFAULT ''::text NOT NULL,
    situacao text DEFAULT 'em_andamento'::text NOT NULL,
    ultima_em_analisada timestamp with time zone,
    analisado_em timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: atendimento_relatorio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.atendimento_relatorio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    card_id uuid,
    numero text NOT NULL,
    contato_nome text,
    solicitacao text DEFAULT ''::text NOT NULL,
    resolucao text DEFAULT ''::text NOT NULL,
    situacao text DEFAULT 'pendente'::text NOT NULL,
    resolvido_por uuid,
    pendente_com uuid,
    setor_id uuid,
    atendente_id uuid,
    criado_por uuid NOT NULL,
    revisado_por uuid,
    iniciado_em timestamp with time zone,
    finalizado_em timestamp with time zone DEFAULT now() NOT NULL,
    revisado_em timestamp with time zone,
    ai_sugerido boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT atendimento_relatorio_situacao_check CHECK ((situacao = ANY (ARRAY['resolvido'::text, 'pendente'::text])))
);

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    actor_email text,
    acao text NOT NULL,
    recurso text,
    detalhes jsonb DEFAULT '{}'::jsonb,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: auth_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.auth_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    ip text,
    user_agent text,
    event text DEFAULT 'login'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: billing_charge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.billing_charge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider text DEFAULT 'abacatepay'::text NOT NULL,
    external_id text,
    metodo text DEFAULT 'pix'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_cents integer DEFAULT 0 NOT NULL,
    moeda text DEFAULT 'BRL'::text NOT NULL,
    ciclo_ref text,
    descricao text,
    pix_qrcode text,
    pix_copia_cola text,
    payment_url text,
    vencimento timestamp with time zone,
    paid_at timestamp with time zone,
    canceled_at timestamp with time zone,
    origem text DEFAULT 'checkout'::text NOT NULL,
    erro text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: billing_charge_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.billing_charge_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    charge_id uuid NOT NULL,
    tipo text DEFAULT 'addon'::text NOT NULL,
    ref_id uuid,
    ref_slug text,
    nome text NOT NULL,
    quantidade integer DEFAULT 1 NOT NULL,
    preco_unit_cents integer DEFAULT 0 NOT NULL,
    total_cents integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: billing_event_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.billing_event_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    event_type text,
    external_id text,
    buyer_email text,
    matched_company_id uuid,
    processed boolean DEFAULT false NOT NULL,
    error text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: campaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.campaign (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid,
    nome text NOT NULL,
    mensagem text NOT NULL,
    media_url text,
    status public.campaign_status DEFAULT 'rascunho'::public.campaign_status NOT NULL,
    agendado_para timestamp with time zone,
    filtro_tags text[] DEFAULT '{}'::text[],
    intervalo_min_seg integer DEFAULT 5 NOT NULL,
    intervalo_max_seg integer DEFAULT 20 NOT NULL,
    pausa_apos_envios integer DEFAULT 50 NOT NULL,
    pausa_duracao_min integer DEFAULT 10 NOT NULL,
    total_destinatarios integer DEFAULT 0 NOT NULL,
    total_enviados integer DEFAULT 0 NOT NULL,
    total_falhas integer DEFAULT 0 NOT NULL,
    iniciado_em timestamp with time zone,
    concluido_em timestamp with time zone,
    proximo_envio_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    janela_dias smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL,
    janela_hora_ini time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    janela_hora_fim time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    limite_diario integer DEFAULT 200 NOT NULL,
    aquecimento_ativo boolean DEFAULT false NOT NULL,
    aquecimento_dia_inicio date,
    simular_digitacao boolean DEFAULT true NOT NULL,
    checar_numero boolean DEFAULT true NOT NULL,
    pular_ativos_dias integer DEFAULT 15 NOT NULL,
    midia_url_v2 text,
    midia_tipo text,
    midia_nome text,
    provider text DEFAULT 'evolution'::text NOT NULL,
    enviados_hoje integer DEFAULT 0 NOT NULL,
    enviados_hoje_data date,
    custom_targets jsonb DEFAULT '[]'::jsonb NOT NULL,
    origem_destinatarios text DEFAULT 'crm'::text NOT NULL,
    descricao text,
    whatsapp_instance_id uuid,
    velocidade_msg_seg integer DEFAULT 20 NOT NULL,
    total_entregues integer DEFAULT 0 NOT NULL,
    total_lidas integer DEFAULT 0 NOT NULL
);

--
-- Name: campaign_blocklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.campaign_blocklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    numero text NOT NULL,
    motivo text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: campaign_optout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.campaign_optout (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    numero text NOT NULL,
    motivo text,
    origem text DEFAULT 'auto'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: campaign_target; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.campaign_target (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    company_id uuid NOT NULL,
    contato_numero text NOT NULL,
    contato_nome text,
    status public.campaign_target_status DEFAULT 'pendente'::public.campaign_target_status NOT NULL,
    enviado_em timestamp with time zone,
    erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tentativas integer DEFAULT 0 NOT NULL,
    max_tentativas integer DEFAULT 3 NOT NULL,
    proxima_em timestamp with time zone
);

--
-- Name: company; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    primary_color text DEFAULT '#0B22FE'::text NOT NULL,
    logo_url text,
    telefone text,
    status_cobranca text DEFAULT 'trial'::text NOT NULL,
    trial_ate timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_pessoa text DEFAULT 'PJ'::text NOT NULL,
    cnpj_cpf text,
    razao_social text,
    nome_fantasia text,
    inscricao_estadual text,
    segmento text,
    porte text,
    site text,
    email_corporativo text,
    cep text,
    rua text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    pais text DEFAULT 'BR'::text,
    onboarding_completed boolean DEFAULT false NOT NULL,
    onboarding_step integer DEFAULT 0 NOT NULL,
    financeiro_ativo boolean DEFAULT false NOT NULL,
    financeiro_dias_vencimento_padrao smallint DEFAULT 7 NOT NULL,
    selected_plan_slug text DEFAULT 'pro'::text,
    creditos_saldo integer DEFAULT 0 NOT NULL,
    creditos_resetam_em timestamp with time zone,
    creditos_origem text DEFAULT 'trial'::text NOT NULL,
    csat_pergunta text DEFAULT 'Como você avalia nosso atendimento de 1 a 5? 🙏'::text,
    csat_ativo boolean DEFAULT true,
    csat_move_para_posvenda boolean DEFAULT true,
    csat_auto_ganho boolean DEFAULT false NOT NULL,
    admin_bloqueado boolean DEFAULT false NOT NULL,
    admin_bloqueado_motivo text,
    csat_destino_pipeline_id uuid,
    csat_destino_stage_id uuid,
    wa_provider text DEFAULT 'evolution'::text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    distribuicao_manual boolean DEFAULT false NOT NULL,
    csat_formato text DEFAULT 'link'::text NOT NULL,
    csat_pedir_comentario boolean DEFAULT true NOT NULL,
    csat_texto_comentario text,
    csat_texto_agradecimento text,
    csat_enviar_ao_finalizar boolean DEFAULT false NOT NULL,
    grupos_ativos boolean DEFAULT false NOT NULL,
    dashboard_individual boolean DEFAULT false NOT NULL,
    funcoes_individuais boolean DEFAULT false NOT NULL,
    atendimento_operacional boolean DEFAULT false NOT NULL,
    CONSTRAINT company_creditos_origem_check CHECK ((creditos_origem = ANY (ARRAY['trial'::text, 'plano'::text, 'bonus'::text]))),
    CONSTRAINT company_tipo_pessoa_check CHECK ((tipo_pessoa = ANY (ARRAY['PF'::text, 'PJ'::text]))),
    CONSTRAINT company_wa_provider_check CHECK ((wa_provider = ANY (ARRAY['evolution'::text, 'uazapi'::text])))
);

--
-- Name: company_addon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company_addon (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    addon_product_id uuid NOT NULL,
    quantidade integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    provider text,
    external_subscription_id text,
    buyer_email text,
    current_period_end timestamp with time zone,
    canceled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_addon_quantidade_check CHECK ((quantidade > 0)),
    CONSTRAINT company_addon_status_check CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'canceled'::text])))
);

--
-- Name: company_billing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company_billing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    tipo_pessoa text DEFAULT 'PJ'::text NOT NULL,
    cnpj_cpf text,
    razao_social text,
    nome_responsavel text,
    email_cobranca text,
    telefone text,
    inscricao_estadual text,
    cep text,
    rua text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    pais text DEFAULT 'BR'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_billing_tipo_pessoa_check CHECK ((tipo_pessoa = ANY (ARRAY['PF'::text, 'PJ'::text])))
);

--
-- Name: company_plugin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company_plugin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    plugin_id uuid NOT NULL,
    instalado boolean DEFAULT true NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    ultimo_erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assinatura_status text DEFAULT 'ativa'::text NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_end timestamp with time zone,
    canceled_at timestamp with time zone,
    preco_cents integer DEFAULT 0 NOT NULL,
    CONSTRAINT company_plugin_assinatura_status_chk CHECK ((assinatura_status = ANY (ARRAY['ativa'::text, 'trial'::text, 'cancelada'::text, 'expirada'::text])))
);

--
-- Name: company_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company_role (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    base_role public.tenant_role DEFAULT 'atendente'::public.tenant_role NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cor text DEFAULT '#6366F1'::text NOT NULL
);

--
-- Name: company_tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company_tag (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#8AA89A'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: company_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    role public.tenant_role DEFAULT 'owner'::public.tenant_role NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    forcar_troca_senha boolean DEFAULT false NOT NULL,
    convite_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_chats integer DEFAULT 5 NOT NULL,
    custom_role_id uuid,
    last_login_at timestamp with time zone,
    last_login_ip text,
    distribution_order integer DEFAULT 0,
    is_in_distribution boolean DEFAULT true,
    last_assigned_at timestamp with time zone,
    horarios jsonb
);

--
-- Name: company_user_instance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company_user_instance (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    instance_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: company_user_pipeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.company_user_pipeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: contact_pause; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.contact_pause (
    user_id uuid NOT NULL,
    numero text NOT NULL,
    pausado boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    pausado_por text,
    pausado_em timestamp with time zone
);

ALTER TABLE ONLY public.contact_pause REPLICA IDENTITY FULL;

--
-- Name: credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.credit_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    delta integer NOT NULL,
    saldo_apos integer NOT NULL,
    motivo text NOT NULL,
    ref text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: crm_card_stage_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.crm_card_stage_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    card_id uuid NOT NULL,
    pipeline_id uuid,
    stage_from uuid,
    stage_to uuid,
    stage_from_nome text,
    stage_to_nome text,
    moved_by uuid,
    tempo_na_etapa_seg bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: crm_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.crm_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    numero text NOT NULL,
    nome text,
    status text DEFAULT 'conversas'::text NOT NULL,
    ultima_mensagem text,
    ultima_em timestamp with time zone DEFAULT now() NOT NULL,
    observacao text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    stage_id uuid,
    valor numeric DEFAULT 0 NOT NULL,
    origem text,
    owner_id uuid,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    proxima_acao text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    foto_url text,
    pipeline_id uuid,
    entrou_stage_em timestamp with time zone DEFAULT now() NOT NULL,
    regua_ultimo_disparo_em timestamp with time zone,
    regua_status text DEFAULT 'ativa'::text NOT NULL,
    utm_term text,
    utm_content text,
    referrer text,
    first_page text,
    ctwa_clid text,
    fbclid text,
    gclid text,
    canal_entrada text,
    primeiro_contato_em timestamp with time zone,
    email text,
    cpf_cnpj text,
    endereco text,
    empresa text,
    canal_chat text,
    meta_lead_id text,
    meta_form_id text,
    tipo_contato text,
    foto_atualizada_em timestamp with time zone,
    item_tipo text,
    item_id uuid,
    item_nome text,
    canal_custom text,
    perdido_em timestamp with time zone,
    retorno_stage_id uuid,
    reativado_em timestamp with time zone,
    department_id uuid,
    stage_entrou_em timestamp with time zone,
    ultima_direcao text DEFAULT 'entrada'::text NOT NULL,
    drive_folder_id text,
    campos_extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    transfer_para_user_id uuid,
    transfer_de_user_id uuid,
    transfer_status text,
    transfer_em timestamp with time zone,
    CONSTRAINT crm_cards_regua_status_check CHECK ((regua_status = ANY (ARRAY['ativa'::text, 'pausada'::text, 'concluida'::text])))
);

ALTER TABLE ONLY public.crm_cards REPLICA IDENTITY FULL;

--
-- Name: crm_distribution_queues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.crm_distribution_queues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    strategy text DEFAULT 'round_robin'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    department_id uuid
);

--
-- Name: crm_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.crm_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    year_month text NOT NULL,
    value_cents bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: crm_pipeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.crm_pipeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    tipo text DEFAULT 'custom'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id uuid,
    sistema boolean DEFAULT false NOT NULL,
    distribution_queue_id uuid,
    oculto boolean DEFAULT false NOT NULL,
    entrada boolean DEFAULT false NOT NULL,
    CONSTRAINT crm_pipeline_tipo_check CHECK ((tipo = ANY (ARRAY['comercial'::text, 'followup'::text, 'posvenda'::text, 'custom'::text])))
);

ALTER TABLE ONLY public.crm_pipeline REPLICA IDENTITY FULL;

--
-- Name: crm_queue_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.crm_queue_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    queue_id uuid NOT NULL,
    user_id uuid NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    leads_count integer DEFAULT 0 NOT NULL,
    last_assigned_at timestamp with time zone,
    company_id uuid NOT NULL
);

--
-- Name: crm_stage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.crm_stage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    cor text DEFAULT '#8AA89A'::text NOT NULL,
    tipo public.stage_tipo DEFAULT 'normal'::public.stage_tipo NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pipeline_id uuid,
    regua_ativa boolean DEFAULT false NOT NULL,
    delay_valor integer DEFAULT 0 NOT NULL,
    delay_unidade text DEFAULT 'dias'::text NOT NULL,
    hora_do_dia time without time zone,
    mensagem_tipo text DEFAULT 'template'::text NOT NULL,
    mensagem_texto text,
    mensagem_prompt text,
    move_se_respondeu_para uuid,
    move_se_sem_resposta_dias integer,
    move_se_sem_resposta_para uuid,
    parar_se_responder boolean DEFAULT true NOT NULL,
    parar_se_humano boolean DEFAULT true NOT NULL,
    trigger_pipeline_destino uuid,
    modo_atendimento text DEFAULT 'auto'::text NOT NULL,
    agent_id uuid,
    ia_handoff_stage_id uuid,
    distribution_queue_id uuid,
    distribution_user_id uuid,
    move_se_negativo_para uuid,
    move_se_positivo_para uuid,
    intent_handling_enabled boolean DEFAULT false,
    move_apos_qualificar_para uuid,
    mostrar_valor boolean DEFAULT true NOT NULL,
    retorno_ativo boolean DEFAULT false NOT NULL,
    retorno_pipeline_id uuid,
    retorno_stage_id uuid,
    retorno_responsavel_modo text DEFAULT 'manter'::text NOT NULL,
    retorno_user_id uuid,
    retorno_modo_atendimento text DEFAULT 'humano'::text NOT NULL,
    retorno_janela_dias integer DEFAULT 0 NOT NULL,
    sla_horas integer,
    department_id uuid,
    arquivar_perdidos_dias integer,
    entrada_formulario boolean DEFAULT false NOT NULL,
    mensagem_midia_url text,
    mensagem_midia_tipo text,
    mensagem_midia_mime text,
    mensagem_midia_nome text,
    CONSTRAINT crm_stage_delay_unidade_check CHECK ((delay_unidade = ANY (ARRAY['minutos'::text, 'horas'::text, 'dias'::text]))),
    CONSTRAINT crm_stage_mensagem_midia_tipo_check CHECK (((mensagem_midia_tipo IS NULL) OR (mensagem_midia_tipo = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'document'::text])))),
    CONSTRAINT crm_stage_mensagem_tipo_check CHECK ((mensagem_tipo = ANY (ARRAY['template'::text, 'ia_leve'::text, 'sem_mensagem'::text]))),
    CONSTRAINT crm_stage_modo_atendimento_check CHECK ((modo_atendimento = ANY (ARRAY['auto'::text, 'ia'::text, 'manual'::text])))
);

ALTER TABLE ONLY public.crm_stage REPLICA IDENTITY FULL;

--
-- Name: crm_venda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.crm_venda (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    card_id uuid,
    pipeline_id uuid,
    stage_id uuid,
    owner_id uuid,
    contato_numero text,
    contato_nome text,
    descricao text,
    valor_cents bigint DEFAULT 0 NOT NULL,
    vendido_em timestamp with time zone DEFAULT now() NOT NULL,
    observacao text,
    fin_lancamento_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    canal text DEFAULT 'manual'::text,
    metodo_pagamento text DEFAULT 'Pix'::text,
    custo_lead_cents bigint DEFAULT 0,
    item_tipo text,
    item_id uuid,
    item_nome text,
    olist_pedido_id text,
    olist_situacao text,
    CONSTRAINT crm_venda_item_tipo_check CHECK ((item_tipo = ANY (ARRAY['produto'::text, 'servico'::text]))),
    CONSTRAINT crm_venda_valor_cents_check CHECK ((valor_cents >= 0))
);

--
-- Name: csat_response; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.csat_response (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    numero text NOT NULL,
    contato_nome text,
    token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    score integer,
    comentario text,
    enviado_por uuid,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL,
    respondido_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    canal text DEFAULT 'link'::text NOT NULL,
    estado text,
    expira_em timestamp with time zone,
    tentativas smallint DEFAULT 0 NOT NULL,
    CONSTRAINT csat_score_range CHECK (((score IS NULL) OR ((score >= 1) AND (score <= 5))))
);

--
-- Name: dashboard_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.dashboard_preferences (
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    widgets jsonb DEFAULT '[]'::jsonb NOT NULL,
    layouts jsonb DEFAULT '{}'::jsonb NOT NULL,
    widget_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    layout_version integer DEFAULT 0 NOT NULL
);

--
-- Name: department; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.department (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    cor text DEFAULT '#8AA89A'::text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pipeline_id uuid
);

--
-- Name: department_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.department_member (
    department_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: department_menu_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.department_menu_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    agent_config_id uuid NOT NULL,
    numero text NOT NULL,
    status text DEFAULT 'aguardando'::text NOT NULL,
    department_id uuid,
    last_menu_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_inbound_message_id text,
    CONSTRAINT department_menu_session_status_check CHECK ((status = ANY (ARRAY['aguardando'::text, 'encaminhado'::text])))
);

--
-- Name: email_send_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.email_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text,
    template_name text NOT NULL,
    recipient_email text NOT NULL,
    status text NOT NULL,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_send_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])))
);

--
-- Name: email_send_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.email_send_state (
    id integer DEFAULT 1 NOT NULL,
    retry_after_until timestamp with time zone,
    batch_size integer DEFAULT 10 NOT NULL,
    send_delay_ms integer DEFAULT 200 NOT NULL,
    auth_email_ttl_minutes integer DEFAULT 15 NOT NULL,
    transactional_email_ttl_minutes integer DEFAULT 60 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_send_state_id_check CHECK ((id = 1))
);

--
-- Name: email_unsubscribe_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);

--
-- Name: feature_flag_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.feature_flag_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flag_key text NOT NULL,
    changed_by uuid,
    antes jsonb,
    depois jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    nome text NOT NULL,
    descricao text,
    categoria text DEFAULT 'modulo'::text NOT NULL,
    rollout public.feature_rollout DEFAULT 'interno'::public.feature_rollout NOT NULL,
    beta_company_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    parent_key text,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: fin_categoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.fin_categoria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    tipo public.fin_tipo NOT NULL,
    cor text DEFAULT '#8AA89A'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: fin_lancamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.fin_lancamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    tipo public.fin_tipo NOT NULL,
    descricao text NOT NULL,
    valor_cents bigint NOT NULL,
    categoria_id uuid,
    forma_pagamento public.fin_forma,
    status public.fin_status DEFAULT 'pendente'::public.fin_status NOT NULL,
    vencimento date NOT NULL,
    pago_em date,
    competencia date DEFAULT CURRENT_DATE NOT NULL,
    crm_card_id uuid,
    contato_numero text,
    observacao text,
    anexo_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid,
    venda_id uuid,
    CONSTRAINT fin_lancamento_valor_cents_check CHECK ((valor_cents >= 0))
);

--
-- Name: flow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.flow (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL,
    canvas jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: flow_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.flow_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    flow_id uuid NOT NULL,
    numero text NOT NULL,
    current_node_id text,
    variables jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'rodando'::text NOT NULL,
    aguardando_resposta_ate timestamp with time zone,
    aguardando_ate timestamp with time zone,
    ultimo_erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: google_integration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.google_integration (
    company_id uuid NOT NULL,
    email text,
    access_token text,
    refresh_token text,
    expiry timestamp with time zone,
    calendar_id text,
    conectado boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    channel_id text,
    resource_id text,
    channel_token text,
    channel_expira_em timestamp with time zone,
    sync_token text,
    ultima_sync_em timestamp with time zone,
    precisa_reconectar boolean DEFAULT false NOT NULL
);

--
-- Name: impersonation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.impersonation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    admin_email text,
    company_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    motivo text
);

--
-- Name: inbound_webhook; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.inbound_webhook (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    nome text NOT NULL,
    token text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    total_recebidos integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: integracao_chave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.integracao_chave (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    servico text NOT NULL,
    credencial text DEFAULT ''::text NOT NULL,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    conectado boolean DEFAULT false NOT NULL,
    auto_envio boolean DEFAULT true NOT NULL,
    ultima_sync timestamp with time zone,
    ultimo_resultado text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: lead_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.lead_evento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    card_id uuid NOT NULL,
    tipo text NOT NULL,
    descricao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: lead_form; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.lead_form (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    slug text NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    pipeline_id uuid,
    stage_id uuid,
    owner_mode text DEFAULT 'fila'::text NOT NULL,
    owner_id uuid,
    distribution_queue_id uuid,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    valor_padrao numeric,
    pos_envio text DEFAULT 'mensagem'::text NOT NULL,
    redirect_url text,
    mensagem_sucesso text DEFAULT 'Recebemos seus dados. Em breve entraremos em contato!'::text NOT NULL,
    wa_auto_enviar boolean DEFAULT false NOT NULL,
    wa_mensagem text,
    theme jsonb DEFAULT '{}'::jsonb NOT NULL,
    campos jsonb DEFAULT '[]'::jsonb NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    submits integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: lead_form_submission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.lead_form_submission (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid NOT NULL,
    company_id uuid NOT NULL,
    crm_card_id uuid,
    dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    tracking jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: lead_nota; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.lead_nota (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    card_id uuid NOT NULL,
    autor_id uuid,
    texto text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: lovable_credit_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.lovable_credit_balance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    remaining numeric(10,4) NOT NULL,
    total_granted numeric(10,4) NOT NULL,
    billing_period_used numeric(10,4) NOT NULL,
    daily_remaining numeric(10,4) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: master_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.master_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: mensagem_agendada; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.mensagem_agendada (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    card_id uuid,
    numero text NOT NULL,
    nome_lead text,
    titulo text,
    mensagem text NOT NULL,
    link_reuniao text,
    agendado_para timestamp with time zone NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    erro text,
    enviado_em timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo text DEFAULT 'mensagem'::text NOT NULL,
    duracao_min integer,
    local text,
    modalidade text,
    servico_id uuid,
    lembrete_min_antes integer DEFAULT 0 NOT NULL,
    parent_id uuid,
    google_event_id text,
    google_calendar_id text,
    sincronizado_em timestamp with time zone,
    origem text DEFAULT 'crm'::text NOT NULL,
    catalogo_item_id uuid,
    profissional_id uuid,
    presenca text,
    tipo_id uuid,
    recorrencia_id uuid,
    fim_em timestamp with time zone,
    empresa_nome text,
    observacoes_internas text,
    tags text[],
    cancelado_em timestamp with time zone,
    concluido_em timestamp with time zone,
    canal text,
    appointment_id uuid,
    motivo_falha text
);

--
-- Name: mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.mensagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    numero text NOT NULL,
    contato_nome text,
    direcao text NOT NULL,
    autor text NOT NULL,
    texto text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    whatsapp_message_id text,
    midia_url text,
    midia_tipo text,
    midia_mime text,
    midia_nome text,
    reacao text,
    editado_em timestamp with time zone,
    texto_original text,
    reply_to_id uuid,
    status_envio text DEFAULT 'enviado'::text NOT NULL,
    deletado_em timestamp with time zone,
    grupo_jid text,
    remetente_nome text,
    CONSTRAINT mensagens_autor_check CHECK ((autor = ANY (ARRAY['ia'::text, 'humano'::text, 'contato'::text, 'automacao'::text]))),
    CONSTRAINT mensagens_direcao_check CHECK ((direcao = ANY (ARRAY['entrada'::text, 'saida'::text])))
);

ALTER TABLE ONLY public.mensagens REPLICA IDENTITY FULL;

--
-- Name: message_hsm_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.message_hsm_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    instance_id uuid,
    nome text NOT NULL,
    categoria text DEFAULT 'MARKETING'::text NOT NULL,
    idioma text DEFAULT 'pt_BR'::text NOT NULL,
    header_tipo text DEFAULT 'NONE'::text NOT NULL,
    header_conteudo text,
    corpo text NOT NULL,
    rodape text,
    botoes jsonb DEFAULT '[]'::jsonb NOT NULL,
    variaveis jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    meta_template_id text,
    meta_ultimo_erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_hsm_template_categoria_check CHECK ((categoria = ANY (ARRAY['MARKETING'::text, 'UTILITY'::text, 'AUTHENTICATION'::text]))),
    CONSTRAINT message_hsm_template_header_tipo_check CHECK ((header_tipo = ANY (ARRAY['NONE'::text, 'TEXT'::text, 'MEDIA'::text]))),
    CONSTRAINT message_hsm_template_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'pendente'::text, 'aprovado'::text, 'reprovado'::text])))
);

--
-- Name: message_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.message_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    atalho text NOT NULL,
    texto text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: meta_oauth_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.meta_oauth_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    handle text NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_token text NOT NULL,
    consumed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL
);

ALTER TABLE ONLY public.meta_oauth_session FORCE ROW LEVEL SECURITY;

--
-- Name: notificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.notificacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    descricao text,
    link text,
    ref_id text,
    lida_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notificacao_tipo_check CHECK ((tipo = ANY (ARRAY['lead_novo'::text, 'conexao_caiu'::text, 'campanha_finalizada'::text, 'chamado_respondido'::text, 'agendamento_proximo'::text])))
);

--
-- Name: olist_integration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.olist_integration (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    token text NOT NULL,
    conectado boolean DEFAULT true NOT NULL,
    ultima_sync timestamp with time zone,
    ultimo_resultado text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_pedido boolean DEFAULT true NOT NULL
);

--
-- Name: outbound_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.outbound_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    mensagem_id uuid,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    tentativas integer DEFAULT 0 NOT NULL,
    max_tentativas integer DEFAULT 5 NOT NULL,
    proxima_em timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    ultimo_erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: parceiro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.parceiro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    codigo_indicacao text NOT NULL,
    porcentagem_comissao integer DEFAULT 20 NOT NULL,
    total_acumulado_cents bigint DEFAULT 0 NOT NULL,
    total_sacado_cents bigint DEFAULT 0 NOT NULL,
    saldo_atual_cents bigint DEFAULT 0 NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.parceiro REPLICA IDENTITY FULL;

--
-- Name: parceiro_clique; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.parceiro_clique (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parceiro_id uuid NOT NULL,
    codigo text NOT NULL,
    referer text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.parceiro_clique REPLICA IDENTITY FULL;

--
-- Name: parceiro_indicacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.parceiro_indicacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parceiro_id uuid NOT NULL,
    company_id uuid NOT NULL,
    status text DEFAULT 'lead'::text NOT NULL,
    data_conversao timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origem text DEFAULT 'link'::text NOT NULL,
    atribuido_por uuid
);

ALTER TABLE ONLY public.parceiro_indicacao REPLICA IDENTITY FULL;

--
-- Name: parceiro_saque; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.parceiro_saque (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parceiro_id uuid NOT NULL,
    valor_cents bigint NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    comprovante_url text,
    pago_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nome text NOT NULL,
    descricao text,
    preco_cents integer DEFAULT 0 NOT NULL,
    moeda text DEFAULT 'BRL'::text NOT NULL,
    intervalo text DEFAULT 'month'::text NOT NULL,
    trial_days integer DEFAULT 3 NOT NULL,
    limite_mensagens integer DEFAULT 1000 NOT NULL,
    limite_instancias integer DEFAULT 1 NOT NULL,
    limite_usuarios integer DEFAULT 2 NOT NULL,
    limite_contatos integer DEFAULT 1000 NOT NULL,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    destaque boolean DEFAULT false NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    paddle_product_id text,
    paddle_price_id text,
    stripe_product_id text,
    stripe_price_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    checkout_url text,
    creditos_mensais integer DEFAULT 1000 NOT NULL,
    creditos_trial integer DEFAULT 100 NOT NULL,
    CONSTRAINT plan_intervalo_check CHECK ((intervalo = ANY (ARRAY['month'::text, 'year'::text])))
);

--
-- Name: plugin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.plugin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nome text NOT NULL,
    descricao text,
    categoria text DEFAULT 'integracao'::text NOT NULL,
    icone text,
    auth_tipo text DEFAULT 'none'::text NOT NULL,
    plano_minimo text DEFAULT 'starter'::text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    visivel_para_clientes boolean DEFAULT false NOT NULL,
    docs_url text,
    config_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    capa_url text,
    cor_fundo text,
    tagline text,
    descricao_longa text,
    screenshots jsonb DEFAULT '[]'::jsonb NOT NULL,
    destaque boolean DEFAULT false NOT NULL,
    banner_url text,
    banner_titulo text,
    banner_subtitulo text,
    tipo_efeito text DEFAULT 'capacidade'::text NOT NULL,
    gratuito boolean DEFAULT true NOT NULL,
    preco_mensal numeric(10,2) DEFAULT 0 NOT NULL,
    capacidade_slug text,
    modulo_rota text,
    checkout_url text,
    external_product_id text
);

--
-- Name: plugin_banner; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.plugin_banner (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    imagem_url text NOT NULL,
    imagem_mobile_url text,
    alt text,
    link_url text,
    plugin_id uuid,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: plugin_suggestion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.plugin_suggestion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    user_id uuid,
    titulo text NOT NULL,
    descricao text,
    status text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: produto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.produto (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    preco numeric DEFAULT 0 NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    foto_url text,
    sku text,
    categoria text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo text DEFAULT 'produto'::text NOT NULL,
    duracao_min integer,
    agendavel boolean DEFAULT false NOT NULL,
    cor text,
    legacy_servico_id uuid,
    olist_id text
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.profiles (
    user_id uuid NOT NULL,
    email text,
    nome text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nome_completo text,
    cpf text,
    cargo text,
    telefone text,
    avatar_url text,
    last_seen_at timestamp with time zone,
    assinatura_ativa boolean DEFAULT true NOT NULL,
    csat_auto_finalizar boolean
);

--
-- Name: prospeccao_lead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.prospeccao_lead (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fonte text DEFAULT 'google'::text NOT NULL,
    busca text,
    nome text NOT NULL,
    telefone text,
    email text,
    site text,
    endereco text,
    cidade text,
    uf text,
    categoria text,
    cnpj text,
    rating numeric,
    avaliacoes integer,
    place_id text,
    dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'novo'::text NOT NULL,
    card_id uuid,
    criado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    site_status text,
    site_nota integer,
    site_diagnostico text,
    site_oportunidades text,
    site_verificado_em timestamp with time zone,
    site_dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    company_id uuid,
    lote_id uuid,
    lote_em timestamp with time zone,
    abordagem_texto text,
    abordagem_foco text,
    abordagem_analise text,
    abordagem_em timestamp with time zone,
    disparo_em timestamp with time zone,
    disparo_por uuid
);

--
-- Name: quick_reply; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.quick_reply (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    atalho text NOT NULL,
    titulo text,
    categoria text DEFAULT 'Geral'::text NOT NULL,
    tipo text DEFAULT 'texto'::text NOT NULL,
    texto text,
    media_url text,
    media_mime text,
    media_nome text,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    favorito boolean DEFAULT false NOT NULL,
    CONSTRAINT quick_reply_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'imagem'::text, 'video'::text, 'audio'::text, 'documento'::text])))
);

--
-- Name: servico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.servico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    duracao_min integer DEFAULT 30 NOT NULL,
    valor_cents bigint DEFAULT 0 NOT NULL,
    cor text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: signup_welcome_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.signup_welcome_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text,
    nome text,
    telefone text,
    status text DEFAULT 'pendente'::text NOT NULL,
    erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: subscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    plan_id uuid,
    status text DEFAULT 'trialing'::text NOT NULL,
    paddle_subscription_id text,
    paddle_customer_id text,
    stripe_subscription_id text,
    stripe_customer_id text,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    canceled_at timestamp with time zone,
    payment_method_brand text,
    payment_method_last4 text,
    payment_method_exp text,
    next_billing_amount_cents integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'manual'::text NOT NULL,
    external_subscription_id text,
    external_customer_id text,
    buyer_email text,
    ciclo text DEFAULT 'mensal'::text NOT NULL,
    valor_customizado_cents integer,
    cortesia boolean DEFAULT false NOT NULL,
    notas_internas text,
    extra_usuarios integer DEFAULT 0 NOT NULL,
    extra_conexoes integer DEFAULT 0 NOT NULL,
    metodo_pagamento text,
    abacate_subscription_id text,
    proxima_cobranca timestamp with time zone,
    CONSTRAINT subscription_ciclo_check CHECK ((ciclo = ANY (ARRAY['mensal'::text, 'trimestral'::text, 'semestral'::text, 'anual'::text]))),
    CONSTRAINT subscription_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'incomplete'::text, 'paused'::text, 'expired'::text])))
);

--
-- Name: support_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.support_config (
    id boolean DEFAULT true NOT NULL,
    auto_reply_enabled boolean DEFAULT true NOT NULL,
    auto_reply_message text DEFAULT 'Olá! Recebemos seu chamado e nossa equipe já foi notificada. Respondemos normalmente em poucos minutos durante o horário comercial.'::text NOT NULL,
    offhours_enabled boolean DEFAULT false NOT NULL,
    offhours_message text DEFAULT 'Estamos fora do horário de atendimento no momento. Seu chamado foi registrado e será respondido assim que o expediente começar.'::text NOT NULL,
    horario_inicio smallint DEFAULT 9 NOT NULL,
    horario_fim smallint DEFAULT 18 NOT NULL,
    dias_semana smallint[] DEFAULT ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint] NOT NULL,
    csat_enabled boolean DEFAULT true NOT NULL,
    csat_message text DEFAULT 'Seu chamado foi resolvido! De 1 a 5, como você avalia nosso atendimento?'::text NOT NULL,
    auto_resolve_dias smallint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_config_id_check CHECK (id)
);

--
-- Name: support_macro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.support_macro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    atalho text NOT NULL,
    conteudo text NOT NULL,
    categoria text DEFAULT 'Geral'::text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: support_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.support_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_id uuid,
    sender_role text NOT NULL,
    content text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT support_message_sender_role_check CHECK ((sender_role = ANY (ARRAY['user'::text, 'admin'::text])))
);

--
-- Name: support_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.support_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: support_ticket; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.support_ticket (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    assunto text DEFAULT 'Suporte'::text NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    prioridade text DEFAULT 'normal'::text NOT NULL,
    created_by uuid,
    unread_admin integer DEFAULT 0 NOT NULL,
    unread_user integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    categoria text DEFAULT 'Geral'::text NOT NULL,
    assigned_to uuid,
    first_response_at timestamp with time zone,
    resolved_at timestamp with time zone,
    sla_due_at timestamp with time zone,
    csat_score smallint,
    csat_comment text,
    csat_at timestamp with time zone,
    auto_reply_sent boolean DEFAULT false NOT NULL,
    CONSTRAINT support_ticket_prioridade_check CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'normal'::text, 'alta'::text]))),
    CONSTRAINT support_ticket_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'andamento'::text, 'resolvido'::text])))
);

--
-- Name: suppressed_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.suppressed_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    reason text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT suppressed_emails_reason_check CHECK ((reason = ANY (ARRAY['unsubscribe'::text, 'bounce'::text, 'complaint'::text])))
);

--
-- Name: system_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.system_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    tipo text NOT NULL,
    severidade text DEFAULT 'warning'::text NOT NULL,
    titulo text NOT NULL,
    descricao text,
    ref text,
    resolvido_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: training_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.training_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text,
    subtitle text,
    highlight text,
    image_url text NOT NULL,
    link_url text,
    tags text[],
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: training_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.training_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: training_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.training_courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    title text NOT NULL,
    description text,
    thumbnail text,
    "order" integer DEFAULT 0,
    instructor text,
    is_published boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: training_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.training_favorites (
    user_id uuid NOT NULL,
    course_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: training_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.training_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id uuid,
    title text NOT NULL,
    description text,
    video_url text,
    duration text,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: training_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.training_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: training_user_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.training_user_progress (
    user_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now()
);

--
-- Name: user_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.user_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid,
    category text DEFAULT 'geral'::text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    admin_reply text,
    replied_by uuid,
    replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    link text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT user_feedback_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'respondido'::text, 'arquivado'::text])))
);

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: webhook_delivery_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.webhook_delivery_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    endpoint_id uuid,
    evento text NOT NULL,
    status_code integer,
    erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: webhook_endpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.webhook_endpoint (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    nome text NOT NULL,
    url text NOT NULL,
    secret text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    eventos text[] DEFAULT '{}'::text[] NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: webhook_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.webhook_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    origem text NOT NULL,
    erro text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: whatsapp_grupo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.whatsapp_grupo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    instance_id uuid,
    jid text NOT NULL,
    nome text,
    foto_url text,
    participantes integer,
    ultima_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: whatsapp_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    user_id uuid,
    instance_name text NOT NULL,
    numero text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    webhook_token text DEFAULT (gen_random_uuid())::text NOT NULL,
    webhook_configured_at timestamp with time zone,
    last_state_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paused boolean DEFAULT false NOT NULL,
    provider text DEFAULT 'evolution'::text NOT NULL,
    instance_token text,
    provider_type public.whatsapp_provider_type DEFAULT 'evolution'::public.whatsapp_provider_type NOT NULL,
    billing_status public.whatsapp_billing_status DEFAULT 'free'::public.whatsapp_billing_status NOT NULL,
    paddle_subscription_item_id text,
    monthly_price_cents integer DEFAULT 0 NOT NULL,
    display_name text,
    waba_id text,
    phone_number_id text,
    messaging_tier text,
    CONSTRAINT whatsapp_instances_provider_check CHECK ((provider = ANY (ARRAY['evolution'::text, 'uazapi'::text, 'meta_instagram'::text, 'meta_messenger'::text])))
);

--
-- Name: addon_product addon_product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addon_product
    ADD CONSTRAINT addon_product_pkey PRIMARY KEY (id);

--
-- Name: addon_product addon_product_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addon_product
    ADD CONSTRAINT addon_product_slug_key UNIQUE (slug);

--
-- Name: admin_automation_log admin_automation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_automation_log
    ADD CONSTRAINT admin_automation_log_pkey PRIMARY KEY (id);

--
-- Name: admin_automation admin_automation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_automation
    ADD CONSTRAINT admin_automation_pkey PRIMARY KEY (id);

--
-- Name: admin_automation admin_automation_trigger_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_automation
    ADD CONSTRAINT admin_automation_trigger_key_key UNIQUE (trigger_key);

--
-- Name: admin_broadcast admin_broadcast_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_broadcast
    ADD CONSTRAINT admin_broadcast_pkey PRIMARY KEY (id);

--
-- Name: admin_broadcast_read admin_broadcast_read_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_broadcast_read
    ADD CONSTRAINT admin_broadcast_read_pkey PRIMARY KEY (broadcast_id, user_id);

--
-- Name: agenda_bloqueio agenda_bloqueio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_bloqueio
    ADD CONSTRAINT agenda_bloqueio_pkey PRIMARY KEY (id);

--
-- Name: agenda_disponibilidade agenda_disponibilidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_disponibilidade
    ADD CONSTRAINT agenda_disponibilidade_pkey PRIMARY KEY (id);

--
-- Name: agenda_historico agenda_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_historico
    ADD CONSTRAINT agenda_historico_pkey PRIMARY KEY (id);

--
-- Name: agenda_local agenda_local_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_local
    ADD CONSTRAINT agenda_local_pkey PRIMARY KEY (id);

--
-- Name: agenda_participante agenda_participante_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_participante
    ADD CONSTRAINT agenda_participante_pkey PRIMARY KEY (id);

--
-- Name: agenda_recorrencia agenda_recorrencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_recorrencia
    ADD CONSTRAINT agenda_recorrencia_pkey PRIMARY KEY (id);

--
-- Name: agenda_tipo agenda_tipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_tipo
    ADD CONSTRAINT agenda_tipo_pkey PRIMARY KEY (id);

--
-- Name: agendamento agendamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamento
    ADD CONSTRAINT agendamento_pkey PRIMARY KEY (id);

--
-- Name: agent_config agent_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_config
    ADD CONSTRAINT agent_config_pkey PRIMARY KEY (id);

--
-- Name: agent_feedback agent_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback
    ADD CONSTRAINT agent_feedback_pkey PRIMARY KEY (id);

--
-- Name: ai_message_processing ai_message_processing_company_message_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_message_processing
    ADD CONSTRAINT ai_message_processing_company_message_key UNIQUE (company_id, inbound_message_id);

--
-- Name: ai_message_processing ai_message_processing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_message_processing
    ADD CONSTRAINT ai_message_processing_pkey PRIMARY KEY (id);

--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);

--
-- Name: api_token api_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_token
    ADD CONSTRAINT api_token_pkey PRIMARY KEY (id);

--
-- Name: api_token api_token_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_token
    ADD CONSTRAINT api_token_token_key UNIQUE (token);

--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);

--
-- Name: app_user_connections app_user_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_pkey PRIMARY KEY (id);

--
-- Name: app_user_connections app_user_connections_user_id_connector_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_user_id_connector_id_key UNIQUE (user_id, connector_id);

--
-- Name: atendimento_live_analise atendimento_live_analise_company_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_live_analise
    ADD CONSTRAINT atendimento_live_analise_company_id_numero_key UNIQUE (company_id, numero);

--
-- Name: atendimento_live_analise atendimento_live_analise_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_live_analise
    ADD CONSTRAINT atendimento_live_analise_pkey PRIMARY KEY (id);

--
-- Name: atendimento_relatorio atendimento_relatorio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_relatorio
    ADD CONSTRAINT atendimento_relatorio_pkey PRIMARY KEY (id);

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

--
-- Name: auth_log auth_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_log
    ADD CONSTRAINT auth_log_pkey PRIMARY KEY (id);

--
-- Name: billing_charge_item billing_charge_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_charge_item
    ADD CONSTRAINT billing_charge_item_pkey PRIMARY KEY (id);

--
-- Name: billing_charge billing_charge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_charge
    ADD CONSTRAINT billing_charge_pkey PRIMARY KEY (id);

--
-- Name: billing_event_log billing_event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_event_log
    ADD CONSTRAINT billing_event_log_pkey PRIMARY KEY (id);

--
-- Name: campaign_blocklist campaign_blocklist_company_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_blocklist
    ADD CONSTRAINT campaign_blocklist_company_id_numero_key UNIQUE (company_id, numero);

--
-- Name: campaign_blocklist campaign_blocklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_blocklist
    ADD CONSTRAINT campaign_blocklist_pkey PRIMARY KEY (id);

--
-- Name: campaign_optout campaign_optout_company_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_optout
    ADD CONSTRAINT campaign_optout_company_id_numero_key UNIQUE (company_id, numero);

--
-- Name: campaign_optout campaign_optout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_optout
    ADD CONSTRAINT campaign_optout_pkey PRIMARY KEY (id);

--
-- Name: campaign campaign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaign_pkey PRIMARY KEY (id);

--
-- Name: campaign_target campaign_target_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_target
    ADD CONSTRAINT campaign_target_pkey PRIMARY KEY (id);

--
-- Name: company_addon company_addon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_addon
    ADD CONSTRAINT company_addon_pkey PRIMARY KEY (id);

--
-- Name: company_billing company_billing_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_billing
    ADD CONSTRAINT company_billing_company_id_key UNIQUE (company_id);

--
-- Name: company_billing company_billing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_billing
    ADD CONSTRAINT company_billing_pkey PRIMARY KEY (id);

--
-- Name: company company_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_pkey PRIMARY KEY (id);

--
-- Name: company_plugin company_plugin_company_id_plugin_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_plugin
    ADD CONSTRAINT company_plugin_company_id_plugin_id_key UNIQUE (company_id, plugin_id);

--
-- Name: company_plugin company_plugin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_plugin
    ADD CONSTRAINT company_plugin_pkey PRIMARY KEY (id);

--
-- Name: company_role company_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_pkey PRIMARY KEY (id);

--
-- Name: company company_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_slug_key UNIQUE (slug);

--
-- Name: company_tag company_tag_company_id_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_tag
    ADD CONSTRAINT company_tag_company_id_nome_key UNIQUE (company_id, nome);

--
-- Name: company_tag company_tag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_tag
    ADD CONSTRAINT company_tag_pkey PRIMARY KEY (id);

--
-- Name: company_user_instance company_user_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user_instance
    ADD CONSTRAINT company_user_instance_pkey PRIMARY KEY (user_id, instance_id);

--
-- Name: company_user_pipeline company_user_pipeline_company_id_user_id_pipeline_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user_pipeline
    ADD CONSTRAINT company_user_pipeline_company_id_user_id_pipeline_id_key UNIQUE (company_id, user_id, pipeline_id);

--
-- Name: company_user_pipeline company_user_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user_pipeline
    ADD CONSTRAINT company_user_pipeline_pkey PRIMARY KEY (id);

--
-- Name: company_user company_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user
    ADD CONSTRAINT company_user_pkey PRIMARY KEY (id);

--
-- Name: company_user company_user_user_id_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user
    ADD CONSTRAINT company_user_user_id_company_id_key UNIQUE (user_id, company_id);

--
-- Name: contact_pause contact_pause_company_numero_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_pause
    ADD CONSTRAINT contact_pause_company_numero_unique UNIQUE (company_id, numero);

--
-- Name: contact_pause contact_pause_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_pause
    ADD CONSTRAINT contact_pause_pkey PRIMARY KEY (user_id, numero);

--
-- Name: credit_ledger credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_pkey PRIMARY KEY (id);

--
-- Name: crm_card_stage_history crm_card_stage_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_card_stage_history
    ADD CONSTRAINT crm_card_stage_history_pkey PRIMARY KEY (id);

--
-- Name: crm_cards crm_cards_company_numero_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_cards
    ADD CONSTRAINT crm_cards_company_numero_unique UNIQUE (company_id, numero);

--
-- Name: crm_cards crm_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_cards
    ADD CONSTRAINT crm_cards_pkey PRIMARY KEY (id);

--
-- Name: crm_distribution_queues crm_distribution_queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_distribution_queues
    ADD CONSTRAINT crm_distribution_queues_pkey PRIMARY KEY (id);

--
-- Name: crm_goals crm_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_goals
    ADD CONSTRAINT crm_goals_pkey PRIMARY KEY (id);

--
-- Name: crm_pipeline crm_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipeline
    ADD CONSTRAINT crm_pipeline_pkey PRIMARY KEY (id);

--
-- Name: crm_queue_members crm_queue_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_queue_members
    ADD CONSTRAINT crm_queue_members_pkey PRIMARY KEY (id);

--
-- Name: crm_queue_members crm_queue_members_queue_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_queue_members
    ADD CONSTRAINT crm_queue_members_queue_id_user_id_key UNIQUE (queue_id, user_id);

--
-- Name: crm_stage crm_stage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_pkey PRIMARY KEY (id);

--
-- Name: crm_venda crm_venda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_venda
    ADD CONSTRAINT crm_venda_pkey PRIMARY KEY (id);

--
-- Name: csat_response csat_response_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_response
    ADD CONSTRAINT csat_response_pkey PRIMARY KEY (id);

--
-- Name: csat_response csat_response_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_response
    ADD CONSTRAINT csat_response_token_key UNIQUE (token);

--
-- Name: dashboard_preferences dashboard_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_preferences
    ADD CONSTRAINT dashboard_preferences_pkey PRIMARY KEY (user_id, workspace_id);

--
-- Name: department_member department_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member
    ADD CONSTRAINT department_member_pkey PRIMARY KEY (department_id, user_id);

--
-- Name: department_menu_session department_menu_session_company_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_menu_session
    ADD CONSTRAINT department_menu_session_company_id_numero_key UNIQUE (company_id, numero);

--
-- Name: department_menu_session department_menu_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_menu_session
    ADD CONSTRAINT department_menu_session_pkey PRIMARY KEY (id);

--
-- Name: department department_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_pkey PRIMARY KEY (id);

--
-- Name: email_send_log email_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_log
    ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);

--
-- Name: email_send_state email_send_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_state
    ADD CONSTRAINT email_send_state_pkey PRIMARY KEY (id);

--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);

--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_pkey PRIMARY KEY (id);

--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_token_key UNIQUE (token);

--
-- Name: feature_flag_audit feature_flag_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flag_audit
    ADD CONSTRAINT feature_flag_audit_pkey PRIMARY KEY (id);

--
-- Name: feature_flags feature_flags_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_key_key UNIQUE (key);

--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);

--
-- Name: fin_categoria fin_categoria_company_id_tipo_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_categoria
    ADD CONSTRAINT fin_categoria_company_id_tipo_nome_key UNIQUE (company_id, tipo, nome);

--
-- Name: fin_categoria fin_categoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_categoria
    ADD CONSTRAINT fin_categoria_pkey PRIMARY KEY (id);

--
-- Name: fin_lancamento fin_lancamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_lancamento
    ADD CONSTRAINT fin_lancamento_pkey PRIMARY KEY (id);

--
-- Name: flow flow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow
    ADD CONSTRAINT flow_pkey PRIMARY KEY (id);

--
-- Name: flow_run flow_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_run
    ADD CONSTRAINT flow_run_pkey PRIMARY KEY (id);

--
-- Name: google_integration google_integration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_integration
    ADD CONSTRAINT google_integration_pkey PRIMARY KEY (company_id);

--
-- Name: impersonation_log impersonation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation_log
    ADD CONSTRAINT impersonation_log_pkey PRIMARY KEY (id);

--
-- Name: inbound_webhook inbound_webhook_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_webhook
    ADD CONSTRAINT inbound_webhook_pkey PRIMARY KEY (id);

--
-- Name: inbound_webhook inbound_webhook_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_webhook
    ADD CONSTRAINT inbound_webhook_token_key UNIQUE (token);

--
-- Name: integracao_chave integracao_chave_company_id_servico_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracao_chave
    ADD CONSTRAINT integracao_chave_company_id_servico_key UNIQUE (company_id, servico);

--
-- Name: integracao_chave integracao_chave_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracao_chave
    ADD CONSTRAINT integracao_chave_pkey PRIMARY KEY (id);

--
-- Name: lead_evento lead_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_evento
    ADD CONSTRAINT lead_evento_pkey PRIMARY KEY (id);

--
-- Name: lead_form lead_form_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_form
    ADD CONSTRAINT lead_form_pkey PRIMARY KEY (id);

--
-- Name: lead_form lead_form_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_form
    ADD CONSTRAINT lead_form_slug_key UNIQUE (slug);

--
-- Name: lead_form_submission lead_form_submission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_form_submission
    ADD CONSTRAINT lead_form_submission_pkey PRIMARY KEY (id);

--
-- Name: lead_nota lead_nota_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_nota
    ADD CONSTRAINT lead_nota_pkey PRIMARY KEY (id);

--
-- Name: lovable_credit_balance lovable_credit_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lovable_credit_balance
    ADD CONSTRAINT lovable_credit_balance_pkey PRIMARY KEY (id);

--
-- Name: master_settings master_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_settings
    ADD CONSTRAINT master_settings_pkey PRIMARY KEY (key);

--
-- Name: mensagem_agendada mensagem_agendada_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagem_agendada
    ADD CONSTRAINT mensagem_agendada_pkey PRIMARY KEY (id);

--
-- Name: mensagens mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_pkey PRIMARY KEY (id);

--
-- Name: message_hsm_template message_hsm_template_instance_id_nome_idioma_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_hsm_template
    ADD CONSTRAINT message_hsm_template_instance_id_nome_idioma_key UNIQUE (instance_id, nome, idioma);

--
-- Name: message_hsm_template message_hsm_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_hsm_template
    ADD CONSTRAINT message_hsm_template_pkey PRIMARY KEY (id);

--
-- Name: message_template message_template_company_id_atalho_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_template
    ADD CONSTRAINT message_template_company_id_atalho_key UNIQUE (company_id, atalho);

--
-- Name: message_template message_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_template
    ADD CONSTRAINT message_template_pkey PRIMARY KEY (id);

--
-- Name: meta_oauth_session meta_oauth_session_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_oauth_session
    ADD CONSTRAINT meta_oauth_session_handle_key UNIQUE (handle);

--
-- Name: meta_oauth_session meta_oauth_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_oauth_session
    ADD CONSTRAINT meta_oauth_session_pkey PRIMARY KEY (id);

--
-- Name: notificacao notificacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacao
    ADD CONSTRAINT notificacao_pkey PRIMARY KEY (id);

--
-- Name: olist_integration olist_integration_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.olist_integration
    ADD CONSTRAINT olist_integration_company_id_key UNIQUE (company_id);

--
-- Name: olist_integration olist_integration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.olist_integration
    ADD CONSTRAINT olist_integration_pkey PRIMARY KEY (id);

--
-- Name: outbound_queue outbound_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_queue
    ADD CONSTRAINT outbound_queue_pkey PRIMARY KEY (id);

--
-- Name: parceiro_clique parceiro_clique_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiro_clique
    ADD CONSTRAINT parceiro_clique_pkey PRIMARY KEY (id);

--
-- Name: parceiro parceiro_codigo_indicacao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiro
    ADD CONSTRAINT parceiro_codigo_indicacao_key UNIQUE (codigo_indicacao);

--
-- Name: parceiro_indicacao parceiro_indicacao_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiro_indicacao
    ADD CONSTRAINT parceiro_indicacao_company_id_key UNIQUE (company_id);

--
-- Name: parceiro_indicacao parceiro_indicacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiro_indicacao
    ADD CONSTRAINT parceiro_indicacao_pkey PRIMARY KEY (id);

--
-- Name: parceiro parceiro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiro
    ADD CONSTRAINT parceiro_pkey PRIMARY KEY (id);

--
-- Name: parceiro_saque parceiro_saque_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiro_saque
    ADD CONSTRAINT parceiro_saque_pkey PRIMARY KEY (id);

--
-- Name: plan plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT plan_pkey PRIMARY KEY (id);

--
-- Name: plan plan_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT plan_slug_key UNIQUE (slug);

--
-- Name: plugin_banner plugin_banner_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plugin_banner
    ADD CONSTRAINT plugin_banner_pkey PRIMARY KEY (id);

--
-- Name: plugin plugin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plugin
    ADD CONSTRAINT plugin_pkey PRIMARY KEY (id);

--
-- Name: plugin plugin_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plugin
    ADD CONSTRAINT plugin_slug_key UNIQUE (slug);

--
-- Name: plugin_suggestion plugin_suggestion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plugin_suggestion
    ADD CONSTRAINT plugin_suggestion_pkey PRIMARY KEY (id);

--
-- Name: produto produto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT produto_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);

--
-- Name: prospeccao_lead prospeccao_lead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospeccao_lead
    ADD CONSTRAINT prospeccao_lead_pkey PRIMARY KEY (id);

--
-- Name: quick_reply quick_reply_company_id_atalho_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_reply
    ADD CONSTRAINT quick_reply_company_id_atalho_key UNIQUE (company_id, atalho);

--
-- Name: quick_reply quick_reply_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_reply
    ADD CONSTRAINT quick_reply_pkey PRIMARY KEY (id);

--
-- Name: servico servico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servico
    ADD CONSTRAINT servico_pkey PRIMARY KEY (id);

--
-- Name: signup_welcome_log signup_welcome_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_welcome_log
    ADD CONSTRAINT signup_welcome_log_pkey PRIMARY KEY (id);

--
-- Name: subscription subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription
    ADD CONSTRAINT subscription_pkey PRIMARY KEY (id);

--
-- Name: support_config support_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_config
    ADD CONSTRAINT support_config_pkey PRIMARY KEY (id);

--
-- Name: support_macro support_macro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_macro
    ADD CONSTRAINT support_macro_pkey PRIMARY KEY (id);

--
-- Name: support_message support_message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_message
    ADD CONSTRAINT support_message_pkey PRIMARY KEY (id);

--
-- Name: support_note support_note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_note
    ADD CONSTRAINT support_note_pkey PRIMARY KEY (id);

--
-- Name: support_ticket support_ticket_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket
    ADD CONSTRAINT support_ticket_pkey PRIMARY KEY (id);

--
-- Name: suppressed_emails suppressed_emails_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppressed_emails
    ADD CONSTRAINT suppressed_emails_email_key UNIQUE (email);

--
-- Name: suppressed_emails suppressed_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppressed_emails
    ADD CONSTRAINT suppressed_emails_pkey PRIMARY KEY (id);

--
-- Name: system_alerts system_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_alerts
    ADD CONSTRAINT system_alerts_pkey PRIMARY KEY (id);

--
-- Name: training_banners training_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_banners
    ADD CONSTRAINT training_banners_pkey PRIMARY KEY (id);

--
-- Name: training_categories training_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_categories
    ADD CONSTRAINT training_categories_pkey PRIMARY KEY (id);

--
-- Name: training_courses training_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_courses
    ADD CONSTRAINT training_courses_pkey PRIMARY KEY (id);

--
-- Name: training_favorites training_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_favorites
    ADD CONSTRAINT training_favorites_pkey PRIMARY KEY (user_id, course_id);

--
-- Name: training_lessons training_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_lessons
    ADD CONSTRAINT training_lessons_pkey PRIMARY KEY (id);

--
-- Name: training_modules training_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_modules
    ADD CONSTRAINT training_modules_pkey PRIMARY KEY (id);

--
-- Name: training_user_progress training_user_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_user_progress
    ADD CONSTRAINT training_user_progress_pkey PRIMARY KEY (user_id, lesson_id);

--
-- Name: user_feedback user_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_pkey PRIMARY KEY (id);

--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

--
-- Name: webhook_delivery_log webhook_delivery_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_delivery_log
    ADD CONSTRAINT webhook_delivery_log_pkey PRIMARY KEY (id);

--
-- Name: webhook_endpoint webhook_endpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoint
    ADD CONSTRAINT webhook_endpoint_pkey PRIMARY KEY (id);

--
-- Name: webhook_errors webhook_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_errors
    ADD CONSTRAINT webhook_errors_pkey PRIMARY KEY (id);

--
-- Name: whatsapp_grupo whatsapp_grupo_company_id_jid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_grupo
    ADD CONSTRAINT whatsapp_grupo_company_id_jid_key UNIQUE (company_id, jid);

--
-- Name: whatsapp_grupo whatsapp_grupo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_grupo
    ADD CONSTRAINT whatsapp_grupo_pkey PRIMARY KEY (id);

--
-- Name: whatsapp_instances whatsapp_instances_instance_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_instance_name_key UNIQUE (instance_name);

--
-- Name: whatsapp_instances whatsapp_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_pkey PRIMARY KEY (id);

--
-- Name: agenda_local_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS agenda_local_company_idx ON public.agenda_local USING btree (company_id);

--
-- Name: agent_config_company_default_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS agent_config_company_default_unique ON public.agent_config USING btree (company_id) WHERE is_default;

--
-- Name: agent_config_company_nome_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS agent_config_company_nome_unique ON public.agent_config USING btree (company_id, nome);

--
-- Name: agent_config_company_tipo_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS agent_config_company_tipo_uk ON public.agent_config USING btree (company_id, tipo);

--
-- Name: ai_message_processing_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ai_message_processing_created_at_idx ON public.ai_message_processing USING btree (created_at);

--
-- Name: atendimento_relatorio_atendente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS atendimento_relatorio_atendente_idx ON public.atendimento_relatorio USING btree (company_id, atendente_id, finalizado_em DESC);

--
-- Name: atendimento_relatorio_company_finalizado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS atendimento_relatorio_company_finalizado_idx ON public.atendimento_relatorio USING btree (company_id, finalizado_em DESC);

--
-- Name: auth_log_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS auth_log_company_created_idx ON public.auth_log USING btree (company_id, created_at DESC);

--
-- Name: auth_log_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS auth_log_user_created_idx ON public.auth_log USING btree (user_id, created_at DESC);

--
-- Name: billing_charge_ciclo_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS billing_charge_ciclo_uq ON public.billing_charge USING btree (company_id, ciclo_ref) WHERE (ciclo_ref IS NOT NULL);

--
-- Name: billing_charge_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS billing_charge_company_idx ON public.billing_charge USING btree (company_id, created_at DESC);

--
-- Name: billing_charge_external_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS billing_charge_external_idx ON public.billing_charge USING btree (provider, external_id);

--
-- Name: billing_charge_item_charge_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS billing_charge_item_charge_idx ON public.billing_charge_item USING btree (charge_id);

--
-- Name: billing_event_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS billing_event_log_created_idx ON public.billing_event_log USING btree (created_at DESC);

--
-- Name: billing_event_log_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS billing_event_log_provider_idx ON public.billing_event_log USING btree (provider, created_at DESC);

--
-- Name: company_user_pipeline_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS company_user_pipeline_user_idx ON public.company_user_pipeline USING btree (company_id, user_id);

--
-- Name: credit_ledger_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS credit_ledger_company_idx ON public.credit_ledger USING btree (company_id, created_at DESC);

--
-- Name: crm_cards_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS crm_cards_user_status_idx ON public.crm_cards USING btree (user_id, status, ultima_em DESC);

--
-- Name: crm_goals_company_user_month_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS crm_goals_company_user_month_uidx ON public.crm_goals USING btree (company_id, user_id, year_month) NULLS NOT DISTINCT;

--
-- Name: crm_pipeline_entrada_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS crm_pipeline_entrada_unica ON public.crm_pipeline USING btree (company_id) WHERE entrada;

--
-- Name: csat_response_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS csat_response_company_created_idx ON public.csat_response USING btree (company_id, created_at DESC);

--
-- Name: csat_response_pendente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS csat_response_pendente_idx ON public.csat_response USING btree (company_id, numero, estado);

--
-- Name: department_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS department_company_idx ON public.department USING btree (company_id);

--
-- Name: department_member_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS department_member_user_idx ON public.department_member USING btree (user_id);

--
-- Name: department_menu_session_message_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS department_menu_session_message_unique ON public.department_menu_session USING btree (company_id, last_inbound_message_id) WHERE (last_inbound_message_id IS NOT NULL);

--
-- Name: fin_lancamento_venda_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS fin_lancamento_venda_uniq ON public.fin_lancamento USING btree (company_id, venda_id) WHERE (venda_id IS NOT NULL);

--
-- Name: flow_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS flow_company_idx ON public.flow USING btree (company_id);

--
-- Name: flow_run_company_numero_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS flow_run_company_numero_idx ON public.flow_run USING btree (company_id, numero);

--
-- Name: flow_run_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS flow_run_status_idx ON public.flow_run USING btree (status, aguardando_ate);

--
-- Name: idx_addon_product_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_addon_product_ativo ON public.addon_product USING btree (ativo, ordem);

--
-- Name: idx_addon_product_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_addon_product_external ON public.addon_product USING btree (provider, external_product_id) WHERE (external_product_id IS NOT NULL);

--
-- Name: idx_admin_automation_log_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_admin_automation_log_dedupe ON public.admin_automation_log USING btree (trigger_key, target_company_id, enviado_em DESC);

--
-- Name: idx_agenda_bloqueio_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agenda_bloqueio_periodo ON public.agenda_bloqueio USING btree (company_id, inicio, fim);

--
-- Name: idx_agenda_disp_company_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agenda_disp_company_user ON public.agenda_disponibilidade USING btree (company_id, user_id);

--
-- Name: idx_agenda_hist_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agenda_hist_entity ON public.agenda_historico USING btree (company_id, entity_type, entity_id);

--
-- Name: idx_agenda_part_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agenda_part_appt ON public.agenda_participante USING btree (appointment_id);

--
-- Name: idx_agenda_tipo_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agenda_tipo_company ON public.agenda_tipo USING btree (company_id);

--
-- Name: idx_agendamento_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agendamento_company ON public.agendamento USING btree (company_id, inicio);

--
-- Name: idx_agent_config_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agent_config_company ON public.agent_config USING btree (company_id);

--
-- Name: idx_agent_feedback_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agent_feedback_company ON public.agent_feedback USING btree (company_id, created_at DESC);

--
-- Name: idx_agent_feedback_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_agent_feedback_msg ON public.agent_feedback USING btree (mensagem_id);

--
-- Name: idx_api_token_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_api_token_company ON public.api_token USING btree (company_id);

--
-- Name: idx_audit_log_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_audit_log_company_created ON public.audit_log USING btree (company_id, created_at DESC);

--
-- Name: idx_broadcast_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_broadcast_created ON public.admin_broadcast USING btree (created_at DESC);

--
-- Name: idx_campaign_blocklist_company_numero; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_campaign_blocklist_company_numero ON public.campaign_blocklist USING btree (company_id, numero);

--
-- Name: idx_campaign_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_campaign_company ON public.campaign USING btree (company_id);

--
-- Name: idx_campaign_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_campaign_instance ON public.campaign USING btree (whatsapp_instance_id);

--
-- Name: idx_campaign_optout_company_numero; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_campaign_optout_company_numero ON public.campaign_optout USING btree (company_id, numero);

--
-- Name: idx_campaign_status_next; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_campaign_status_next ON public.campaign USING btree (status, proximo_envio_em) WHERE (status = ANY (ARRAY['agendada'::public.campaign_status, 'enviando'::public.campaign_status]));

--
-- Name: idx_campaign_target_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_campaign_target_campaign ON public.campaign_target USING btree (campaign_id, status);

--
-- Name: idx_campaign_target_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_campaign_target_pending ON public.campaign_target USING btree (campaign_id) WHERE (status = 'pendente'::public.campaign_target_status);

--
-- Name: idx_cards_pipeline_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_cards_pipeline_stage ON public.crm_cards USING btree (pipeline_id, stage_id);

--
-- Name: idx_cards_regua; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_cards_regua ON public.crm_cards USING btree (regua_status, entrou_stage_em);

--
-- Name: idx_cch_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_cch_card ON public.crm_card_stage_history USING btree (card_id, created_at DESC);

--
-- Name: idx_cch_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_cch_company ON public.crm_card_stage_history USING btree (company_id, created_at DESC);

--
-- Name: idx_company_addon_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_company_addon_company ON public.company_addon USING btree (company_id, status);

--
-- Name: idx_company_user_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_company_user_company ON public.company_user USING btree (company_id);

--
-- Name: idx_company_user_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_company_user_user ON public.company_user USING btree (user_id) WHERE ativo;

--
-- Name: idx_contact_pause_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_contact_pause_company ON public.contact_pause USING btree (company_id);

--
-- Name: idx_crm_cards_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_cards_company ON public.crm_cards USING btree (company_id);

--
-- Name: idx_crm_cards_company_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_cards_company_stage ON public.crm_cards USING btree (company_id, stage_id);

--
-- Name: idx_crm_cards_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_cards_department ON public.crm_cards USING btree (company_id, department_id);

--
-- Name: idx_crm_cards_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_cards_stage ON public.crm_cards USING btree (stage_id);

--
-- Name: idx_crm_cards_tipo_contato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_cards_tipo_contato ON public.crm_cards USING btree (company_id, tipo_contato);

--
-- Name: idx_crm_stage_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_stage_company ON public.crm_stage USING btree (company_id, ordem);

--
-- Name: idx_crm_stage_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_stage_department ON public.crm_stage USING btree (department_id);

--
-- Name: idx_crm_venda_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_venda_card ON public.crm_venda USING btree (card_id);

--
-- Name: idx_crm_venda_company_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_venda_company_data ON public.crm_venda USING btree (company_id, vendido_em DESC);

--
-- Name: idx_crm_venda_olist_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_venda_olist_pedido ON public.crm_venda USING btree (company_id, olist_pedido_id);

--
-- Name: idx_crm_venda_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_crm_venda_owner ON public.crm_venda USING btree (company_id, owner_id, vendido_em DESC);

--
-- Name: idx_csat_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_csat_company ON public.csat_response USING btree (company_id, created_at DESC);

--
-- Name: idx_csat_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_csat_token ON public.csat_response USING btree (token);

--
-- Name: idx_department_menu_session_waiting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_department_menu_session_waiting ON public.department_menu_session USING btree (company_id, status, last_menu_at);

--
-- Name: idx_email_send_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log USING btree (created_at DESC);

--
-- Name: idx_email_send_log_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log USING btree (message_id);

--
-- Name: idx_email_send_log_message_sent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = 'sent'::text);

--
-- Name: idx_email_send_log_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log USING btree (recipient_email);

--
-- Name: idx_feedback_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.user_feedback USING btree (status, created_at DESC);

--
-- Name: idx_fin_categoria_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_fin_categoria_company ON public.fin_categoria USING btree (company_id, tipo);

--
-- Name: idx_fin_lanc_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_fin_lanc_card ON public.fin_lancamento USING btree (company_id, crm_card_id);

--
-- Name: idx_fin_lanc_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_fin_lanc_company_status ON public.fin_lancamento USING btree (company_id, status, vencimento);

--
-- Name: idx_fin_lanc_company_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_fin_lanc_company_tipo ON public.fin_lancamento USING btree (company_id, tipo, competencia);

--
-- Name: idx_google_integration_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_google_integration_channel ON public.google_integration USING btree (channel_id);

--
-- Name: idx_hsm_template_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_hsm_template_company ON public.message_hsm_template USING btree (company_id);

--
-- Name: idx_hsm_template_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_hsm_template_instance ON public.message_hsm_template USING btree (instance_id);

--
-- Name: idx_hsm_template_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_hsm_template_status ON public.message_hsm_template USING btree (status);

--
-- Name: idx_imp_log_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_imp_log_admin ON public.impersonation_log USING btree (admin_user_id, started_at DESC);

--
-- Name: idx_imp_log_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_imp_log_company ON public.impersonation_log USING btree (company_id, started_at DESC);

--
-- Name: idx_integracao_chave_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_integracao_chave_company ON public.integracao_chave USING btree (company_id, servico);

--
-- Name: idx_lead_evento_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lead_evento_card ON public.lead_evento USING btree (card_id, created_at DESC);

--
-- Name: idx_lead_nota_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lead_nota_card ON public.lead_nota USING btree (card_id, created_at DESC);

--
-- Name: idx_live_analise_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_live_analise_company ON public.atendimento_live_analise USING btree (company_id, analisado_em DESC);

--
-- Name: idx_mensagem_agendada_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_mensagem_agendada_company ON public.mensagem_agendada USING btree (company_id, agendado_para DESC);

--
-- Name: idx_mensagem_agendada_disparo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_mensagem_agendada_disparo ON public.mensagem_agendada USING btree (status, agendado_para) WHERE (status = 'pendente'::text);

--
-- Name: idx_mensagem_agendada_google_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_mensagem_agendada_google_event ON public.mensagem_agendada USING btree (company_id, google_event_id);

--
-- Name: idx_mensagem_agendada_prof; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_mensagem_agendada_prof ON public.mensagem_agendada USING btree (company_id, profissional_id, agendado_para);

--
-- Name: idx_mensagens_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_mensagens_company ON public.mensagens USING btree (company_id);

--
-- Name: idx_mensagens_company_numero_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_mensagens_company_numero_created ON public.mensagens USING btree (company_id, numero, created_at DESC);

--
-- Name: idx_mensagens_pendentes_reenvio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_mensagens_pendentes_reenvio ON public.mensagens USING btree (created_at) WHERE ((direcao = 'saida'::text) AND (status_envio = 'pendente'::text) AND (whatsapp_message_id IS NOT NULL));

--
-- Name: idx_msg_agendada_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_msg_agendada_appointment ON public.mensagem_agendada USING btree (appointment_id);

--
-- Name: idx_msg_agendada_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_msg_agendada_company ON public.mensagem_agendada USING btree (company_id, agendado_para DESC);

--
-- Name: idx_msg_agendada_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_msg_agendada_pending ON public.mensagem_agendada USING btree (agendado_para) WHERE (status = 'pendente'::text);

--
-- Name: idx_msg_agendada_recorrencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_msg_agendada_recorrencia ON public.mensagem_agendada USING btree (recorrencia_id);

--
-- Name: idx_parceiro_clique_parceiro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_parceiro_clique_parceiro ON public.parceiro_clique USING btree (parceiro_id, created_at DESC);

--
-- Name: idx_pipeline_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_pipeline_company ON public.crm_pipeline USING btree (company_id, ordem);

--
-- Name: idx_produto_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_produto_categoria ON public.produto USING btree (company_id, categoria);

--
-- Name: idx_produto_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_produto_company ON public.produto USING btree (company_id, ordem);

--
-- Name: idx_produto_company_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_produto_company_ativo ON public.produto USING btree (company_id, ativo);

--
-- Name: idx_produto_company_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_produto_company_tipo ON public.produto USING btree (company_id, tipo);

--
-- Name: idx_produto_olist_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_produto_olist_id ON public.produto USING btree (company_id, olist_id);

--
-- Name: idx_quick_reply_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_quick_reply_company ON public.quick_reply USING btree (company_id, categoria, ordem);

--
-- Name: idx_support_note_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_support_note_ticket ON public.support_note USING btree (ticket_id, created_at DESC);

--
-- Name: idx_support_ticket_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_support_ticket_assigned ON public.support_ticket USING btree (assigned_to);

--
-- Name: idx_support_ticket_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_support_ticket_categoria ON public.support_ticket USING btree (categoria);

--
-- Name: idx_suppressed_emails_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails USING btree (email);

--
-- Name: idx_unsubscribe_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens USING btree (token);

--
-- Name: idx_webhook_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_webhook_company ON public.webhook_endpoint USING btree (company_id) WHERE ativo;

--
-- Name: idx_webhook_log_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_webhook_log_company ON public.webhook_delivery_log USING btree (company_id, created_at DESC);

--
-- Name: idx_whatsapp_instances_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_company ON public.whatsapp_instances USING btree (company_id);

--
-- Name: idx_whatsapp_instances_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_company_id ON public.whatsapp_instances USING btree (company_id);

--
-- Name: idx_whatsapp_instances_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_company_status ON public.whatsapp_instances USING btree (company_id, status);

--
-- Name: lead_form_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS lead_form_company_idx ON public.lead_form USING btree (company_id);

--
-- Name: lead_form_submission_form_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS lead_form_submission_form_idx ON public.lead_form_submission USING btree (form_id, created_at DESC);

--
-- Name: mensagem_agendada_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mensagem_agendada_tipo_idx ON public.mensagem_agendada USING btree (company_id, tipo, agendado_para);

--
-- Name: mensagens_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mensagens_company_created_idx ON public.mensagens USING btree (company_id, created_at DESC);

--
-- Name: mensagens_company_numero_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mensagens_company_numero_created_idx ON public.mensagens USING btree (company_id, numero, created_at DESC);

--
-- Name: mensagens_company_whatsapp_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS mensagens_company_whatsapp_message_id_idx ON public.mensagens USING btree (company_id, whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);

--
-- Name: mensagens_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mensagens_grupo_idx ON public.mensagens USING btree (company_id, grupo_jid, created_at DESC);

--
-- Name: mensagens_reply_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mensagens_reply_to_idx ON public.mensagens USING btree (reply_to_id);

--
-- Name: mensagens_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mensagens_user_created_idx ON public.mensagens USING btree (user_id, created_at DESC);

--
-- Name: mensagens_user_numero_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mensagens_user_numero_idx ON public.mensagens USING btree (user_id, numero, created_at DESC);

--
-- Name: meta_oauth_session_handle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS meta_oauth_session_handle_idx ON public.meta_oauth_session USING btree (handle);

--
-- Name: notificacao_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notificacao_company_created_idx ON public.notificacao USING btree (company_id, created_at DESC);

--
-- Name: notificacao_dedupe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS notificacao_dedupe_idx ON public.notificacao USING btree (company_id, tipo, ref_id) WHERE (ref_id IS NOT NULL);

--
-- Name: outbound_queue_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS outbound_queue_company_idx ON public.outbound_queue USING btree (company_id, status);

--
-- Name: outbound_queue_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS outbound_queue_due_idx ON public.outbound_queue USING btree (status, proxima_em) WHERE (status = 'pendente'::text);

--
-- Name: prospeccao_lead_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS prospeccao_lead_company_idx ON public.prospeccao_lead USING btree (company_id);

--
-- Name: prospeccao_lead_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS prospeccao_lead_created_idx ON public.prospeccao_lead USING btree (created_at DESC);

--
-- Name: prospeccao_lead_disparo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS prospeccao_lead_disparo_idx ON public.prospeccao_lead USING btree (company_id, disparo_em);

--
-- Name: prospeccao_lead_lote_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS prospeccao_lead_lote_idx ON public.prospeccao_lead USING btree (company_id, lote_id);

--
-- Name: prospeccao_lead_place_company_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS prospeccao_lead_place_company_uk ON public.prospeccao_lead USING btree (company_id, place_id) WHERE (place_id IS NOT NULL);

--
-- Name: prospeccao_lead_site_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS prospeccao_lead_site_status_idx ON public.prospeccao_lead USING btree (site_status);

--
-- Name: prospeccao_lead_tel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS prospeccao_lead_tel_idx ON public.prospeccao_lead USING btree (telefone);

--
-- Name: quick_reply_company_fav_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS quick_reply_company_fav_idx ON public.quick_reply USING btree (company_id, favorito);

--
-- Name: servico_company_ativo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS servico_company_ativo_idx ON public.servico USING btree (company_id, ativo);

--
-- Name: signup_welcome_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS signup_welcome_log_created_idx ON public.signup_welcome_log USING btree (created_at DESC);

--
-- Name: signup_welcome_log_telefone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS signup_welcome_log_telefone_idx ON public.signup_welcome_log USING btree (telefone);

--
-- Name: subscription_buyer_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS subscription_buyer_email_idx ON public.subscription USING btree (lower(buyer_email));

--
-- Name: subscription_company_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS subscription_company_unique ON public.subscription USING btree (company_id);

--
-- Name: subscription_provider_external_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS subscription_provider_external_idx ON public.subscription USING btree (provider, external_subscription_id);

--
-- Name: support_message_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS support_message_ticket_idx ON public.support_message USING btree (ticket_id, created_at);

--
-- Name: support_ticket_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS support_ticket_company_idx ON public.support_ticket USING btree (company_id, last_message_at DESC);

--
-- Name: support_ticket_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS support_ticket_status_idx ON public.support_ticket USING btree (status, last_message_at DESC);

--
-- Name: system_alerts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS system_alerts_created_idx ON public.system_alerts USING btree (created_at DESC);

--
-- Name: system_alerts_open_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS system_alerts_open_ref_idx ON public.system_alerts USING btree (tipo, COALESCE(ref, ''::text)) WHERE (resolvido_em IS NULL);

--
-- Name: uq_company_addon_ext; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_addon_ext ON public.company_addon USING btree (provider, external_subscription_id) WHERE (external_subscription_id IS NOT NULL);

--
-- Name: uq_parceiro_indicacao_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS uq_parceiro_indicacao_company ON public.parceiro_indicacao USING btree (company_id);

--
-- Name: webhook_errors_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS webhook_errors_created_idx ON public.webhook_errors USING btree (created_at DESC);

--
-- Name: whatsapp_instances_billing_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS whatsapp_instances_billing_status_idx ON public.whatsapp_instances USING btree (billing_status);

--
-- Name: whatsapp_instances_provider_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS whatsapp_instances_provider_type_idx ON public.whatsapp_instances USING btree (provider_type);

--
-- Name: whatsapp_instances_webhook_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_webhook_token_idx ON public.whatsapp_instances USING btree (webhook_token);

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: admin_broadcast admin_broadcast_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.admin_broadcast
--     ADD CONSTRAINT admin_broadcast_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
--

--
-- Name: admin_broadcast_read admin_broadcast_read_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_broadcast_read
    ADD CONSTRAINT admin_broadcast_read_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.admin_broadcast(id) ON DELETE CASCADE;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: admin_broadcast_read admin_broadcast_read_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.admin_broadcast_read
--     ADD CONSTRAINT admin_broadcast_read_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--

--
-- Name: agenda_bloqueio agenda_bloqueio_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_bloqueio
    ADD CONSTRAINT agenda_bloqueio_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: agenda_bloqueio agenda_bloqueio_recorrencia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_bloqueio
    ADD CONSTRAINT agenda_bloqueio_recorrencia_id_fkey FOREIGN KEY (recorrencia_id) REFERENCES public.agenda_recorrencia(id) ON DELETE SET NULL;

--
-- Name: agenda_disponibilidade agenda_disponibilidade_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_disponibilidade
    ADD CONSTRAINT agenda_disponibilidade_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: agenda_historico agenda_historico_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_historico
    ADD CONSTRAINT agenda_historico_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: agenda_local agenda_local_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_local
    ADD CONSTRAINT agenda_local_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: agenda_participante agenda_participante_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_participante
    ADD CONSTRAINT agenda_participante_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.mensagem_agendada(id) ON DELETE CASCADE;

--
-- Name: agenda_participante agenda_participante_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_participante
    ADD CONSTRAINT agenda_participante_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: agenda_recorrencia agenda_recorrencia_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_recorrencia
    ADD CONSTRAINT agenda_recorrencia_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: agenda_tipo agenda_tipo_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_tipo
    ADD CONSTRAINT agenda_tipo_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: agendamento agendamento_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamento
    ADD CONSTRAINT agendamento_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.crm_cards(id) ON DELETE SET NULL;

--
-- Name: agendamento agendamento_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendamento
    ADD CONSTRAINT agendamento_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: agent_config agent_config_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.agent_config
--     ADD CONSTRAINT agent_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--

--
-- Name: agent_feedback agent_feedback_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback
    ADD CONSTRAINT agent_feedback_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent_config(id) ON DELETE SET NULL;

--
-- Name: agent_feedback agent_feedback_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback
    ADD CONSTRAINT agent_feedback_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: agent_feedback agent_feedback_mensagem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback
    ADD CONSTRAINT agent_feedback_mensagem_id_fkey FOREIGN KEY (mensagem_id) REFERENCES public.mensagens(id) ON DELETE SET NULL;

--
-- Name: ai_message_processing ai_message_processing_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_message_processing
    ADD CONSTRAINT ai_message_processing_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: api_token api_token_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_token
    ADD CONSTRAINT api_token_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: api_token api_token_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.api_token
--     ADD CONSTRAINT api_token_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
--

--
-- Name: atendimento_live_analise atendimento_live_analise_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_live_analise
    ADD CONSTRAINT atendimento_live_analise_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: atendimento_relatorio atendimento_relatorio_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_relatorio
    ADD CONSTRAINT atendimento_relatorio_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.crm_cards(id) ON DELETE SET NULL;

--
-- Name: atendimento_relatorio atendimento_relatorio_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_relatorio
    ADD CONSTRAINT atendimento_relatorio_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: atendimento_relatorio atendimento_relatorio_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimento_relatorio
    ADD CONSTRAINT atendimento_relatorio_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES public.department(id) ON DELETE SET NULL;

--
-- Name: audit_log audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.audit_log
--     ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
--

--
-- Name: auth_log auth_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_log
    ADD CONSTRAINT auth_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: billing_charge billing_charge_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_charge
    ADD CONSTRAINT billing_charge_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: billing_charge_item billing_charge_item_charge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_charge_item
    ADD CONSTRAINT billing_charge_item_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES public.billing_charge(id) ON DELETE CASCADE;

--
-- Name: billing_event_log billing_event_log_matched_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_event_log
    ADD CONSTRAINT billing_event_log_matched_company_id_fkey FOREIGN KEY (matched_company_id) REFERENCES public.company(id) ON DELETE SET NULL;

--
-- Name: campaign_blocklist campaign_blocklist_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_blocklist
    ADD CONSTRAINT campaign_blocklist_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: campaign campaign_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaign_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: campaign campaign_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.campaign
--     ADD CONSTRAINT campaign_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
--

--
-- Name: campaign_optout campaign_optout_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_optout
    ADD CONSTRAINT campaign_optout_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: campaign_target campaign_target_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_target
    ADD CONSTRAINT campaign_target_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id) ON DELETE CASCADE;

--
-- Name: campaign_target campaign_target_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_target
    ADD CONSTRAINT campaign_target_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: campaign campaign_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaign_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

--
-- Name: company_addon company_addon_addon_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_addon
    ADD CONSTRAINT company_addon_addon_product_id_fkey FOREIGN KEY (addon_product_id) REFERENCES public.addon_product(id) ON DELETE RESTRICT;

--
-- Name: company_addon company_addon_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_addon
    ADD CONSTRAINT company_addon_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: company_billing company_billing_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_billing
    ADD CONSTRAINT company_billing_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: company company_csat_destino_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_csat_destino_pipeline_id_fkey FOREIGN KEY (csat_destino_pipeline_id) REFERENCES public.crm_pipeline(id) ON DELETE SET NULL;

--
-- Name: company company_csat_destino_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_csat_destino_stage_id_fkey FOREIGN KEY (csat_destino_stage_id) REFERENCES public.crm_stage(id) ON DELETE SET NULL;

--
-- Name: company_plugin company_plugin_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_plugin
    ADD CONSTRAINT company_plugin_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: company_plugin company_plugin_plugin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_plugin
    ADD CONSTRAINT company_plugin_plugin_id_fkey FOREIGN KEY (plugin_id) REFERENCES public.plugin(id) ON DELETE CASCADE;

--
-- Name: company_role company_role_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: company_tag company_tag_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_tag
    ADD CONSTRAINT company_tag_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: company_user company_user_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user
    ADD CONSTRAINT company_user_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: company_user company_user_custom_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user
    ADD CONSTRAINT company_user_custom_role_fk FOREIGN KEY (custom_role_id) REFERENCES public.company_role(id) ON DELETE SET NULL;

--
-- Name: company_user_instance company_user_instance_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user_instance
    ADD CONSTRAINT company_user_instance_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: company_user_instance company_user_instance_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user_instance
    ADD CONSTRAINT company_user_instance_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE;

--
-- Name: company_user_pipeline company_user_pipeline_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user_pipeline
    ADD CONSTRAINT company_user_pipeline_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: company_user_pipeline company_user_pipeline_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_user_pipeline
    ADD CONSTRAINT company_user_pipeline_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipeline(id) ON DELETE CASCADE;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: contact_pause contact_pause_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.contact_pause
--     ADD CONSTRAINT contact_pause_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--

--
-- Name: credit_ledger credit_ledger_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: crm_card_stage_history crm_card_stage_history_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_card_stage_history
    ADD CONSTRAINT crm_card_stage_history_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.crm_cards(id) ON DELETE CASCADE;

--
-- Name: crm_cards crm_cards_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_cards
    ADD CONSTRAINT crm_cards_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE SET NULL;

--
-- Name: crm_cards crm_cards_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_cards
    ADD CONSTRAINT crm_cards_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipeline(id) ON DELETE CASCADE;

--
-- Name: crm_cards crm_cards_retorno_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_cards
    ADD CONSTRAINT crm_cards_retorno_stage_id_fkey FOREIGN KEY (retorno_stage_id) REFERENCES public.crm_stage(id) ON DELETE SET NULL;

--
-- Name: crm_cards crm_cards_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_cards
    ADD CONSTRAINT crm_cards_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.crm_stage(id) ON DELETE SET NULL;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: crm_cards crm_cards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.crm_cards
--     ADD CONSTRAINT crm_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--

--
-- Name: crm_distribution_queues crm_distribution_queues_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_distribution_queues
    ADD CONSTRAINT crm_distribution_queues_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: crm_distribution_queues crm_distribution_queues_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_distribution_queues
    ADD CONSTRAINT crm_distribution_queues_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE SET NULL;

--
-- Name: crm_goals crm_goals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_goals
    ADD CONSTRAINT crm_goals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: crm_pipeline crm_pipeline_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipeline
    ADD CONSTRAINT crm_pipeline_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent_config(id) ON DELETE SET NULL;

--
-- Name: crm_pipeline crm_pipeline_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipeline
    ADD CONSTRAINT crm_pipeline_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: crm_pipeline crm_pipeline_distribution_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipeline
    ADD CONSTRAINT crm_pipeline_distribution_queue_id_fkey FOREIGN KEY (distribution_queue_id) REFERENCES public.crm_distribution_queues(id) ON DELETE SET NULL;

--
-- Name: crm_queue_members crm_queue_members_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_queue_members
    ADD CONSTRAINT crm_queue_members_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.crm_distribution_queues(id) ON DELETE CASCADE;

--
-- Name: crm_queue_members crm_queue_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_queue_members
    ADD CONSTRAINT crm_queue_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

--
-- Name: crm_stage crm_stage_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent_config(id) ON DELETE SET NULL;

--
-- Name: crm_stage crm_stage_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: crm_stage crm_stage_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE SET NULL;

--
-- Name: crm_stage crm_stage_distribution_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_distribution_queue_id_fkey FOREIGN KEY (distribution_queue_id) REFERENCES public.crm_distribution_queues(id) ON DELETE SET NULL;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: crm_stage crm_stage_distribution_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.crm_stage
--     ADD CONSTRAINT crm_stage_distribution_user_id_fkey FOREIGN KEY (distribution_user_id) REFERENCES auth.users(id);
--

--
-- Name: crm_stage crm_stage_ia_handoff_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_ia_handoff_stage_id_fkey FOREIGN KEY (ia_handoff_stage_id) REFERENCES public.crm_stage(id) ON DELETE SET NULL;

--
-- Name: crm_stage crm_stage_move_apos_qualificar_para_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_move_apos_qualificar_para_fkey FOREIGN KEY (move_apos_qualificar_para) REFERENCES public.crm_stage(id);

--
-- Name: crm_stage crm_stage_move_se_negativo_para_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_move_se_negativo_para_fkey FOREIGN KEY (move_se_negativo_para) REFERENCES public.crm_stage(id);

--
-- Name: crm_stage crm_stage_move_se_positivo_para_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_move_se_positivo_para_fkey FOREIGN KEY (move_se_positivo_para) REFERENCES public.crm_stage(id);

--
-- Name: crm_stage crm_stage_move_se_respondeu_para_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_move_se_respondeu_para_fkey FOREIGN KEY (move_se_respondeu_para) REFERENCES public.crm_stage(id) ON DELETE SET NULL;

--
-- Name: crm_stage crm_stage_move_se_sem_resposta_para_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_move_se_sem_resposta_para_fkey FOREIGN KEY (move_se_sem_resposta_para) REFERENCES public.crm_stage(id) ON DELETE SET NULL;

--
-- Name: crm_stage crm_stage_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipeline(id) ON DELETE CASCADE;

--
-- Name: crm_stage crm_stage_retorno_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_retorno_pipeline_id_fkey FOREIGN KEY (retorno_pipeline_id) REFERENCES public.crm_pipeline(id) ON DELETE SET NULL;

--
-- Name: crm_stage crm_stage_retorno_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_retorno_stage_id_fkey FOREIGN KEY (retorno_stage_id) REFERENCES public.crm_stage(id) ON DELETE SET NULL;

--
-- Name: crm_stage crm_stage_trigger_pipeline_destino_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_stage
    ADD CONSTRAINT crm_stage_trigger_pipeline_destino_fkey FOREIGN KEY (trigger_pipeline_destino) REFERENCES public.crm_pipeline(id) ON DELETE SET NULL;

--
-- Name: crm_venda crm_venda_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_venda
    ADD CONSTRAINT crm_venda_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.crm_cards(id) ON DELETE SET NULL;

--
-- Name: crm_venda crm_venda_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_venda
    ADD CONSTRAINT crm_venda_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: crm_venda crm_venda_fin_lancamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_venda
    ADD CONSTRAINT crm_venda_fin_lancamento_id_fkey FOREIGN KEY (fin_lancamento_id) REFERENCES public.fin_lancamento(id) ON DELETE SET NULL;

--
-- Name: crm_venda crm_venda_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_venda
    ADD CONSTRAINT crm_venda_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipeline(id) ON DELETE SET NULL;

--
-- Name: crm_venda crm_venda_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_venda
    ADD CONSTRAINT crm_venda_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.crm_stage(id) ON DELETE SET NULL;

--
-- Name: csat_response csat_response_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csat_response
    ADD CONSTRAINT csat_response_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: csat_response csat_response_enviado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.csat_response
--     ADD CONSTRAINT csat_response_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
--

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: dashboard_preferences dashboard_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.dashboard_preferences
--     ADD CONSTRAINT dashboard_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--

--
-- Name: department department_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: department_member department_member_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member
    ADD CONSTRAINT department_member_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE CASCADE;

--
-- Name: department_menu_session department_menu_session_agent_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_menu_session
    ADD CONSTRAINT department_menu_session_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_config(id) ON DELETE CASCADE;

--
-- Name: department_menu_session department_menu_session_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_menu_session
    ADD CONSTRAINT department_menu_session_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: department_menu_session department_menu_session_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_menu_session
    ADD CONSTRAINT department_menu_session_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE SET NULL;

--
-- Name: department department_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipeline(id) ON DELETE SET NULL;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: feature_flag_audit feature_flag_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.feature_flag_audit
--     ADD CONSTRAINT feature_flag_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
--

--
-- Name: fin_categoria fin_categoria_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_categoria
    ADD CONSTRAINT fin_categoria_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: fin_lancamento fin_lancamento_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_lancamento
    ADD CONSTRAINT fin_lancamento_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.fin_categoria(id) ON DELETE SET NULL;

--
-- Name: fin_lancamento fin_lancamento_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_lancamento
    ADD CONSTRAINT fin_lancamento_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: fin_lancamento fin_lancamento_crm_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_lancamento
    ADD CONSTRAINT fin_lancamento_crm_card_id_fkey FOREIGN KEY (crm_card_id) REFERENCES public.crm_cards(id) ON DELETE SET NULL;

--
-- Name: fin_lancamento fin_lancamento_venda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_lancamento
    ADD CONSTRAINT fin_lancamento_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES public.crm_venda(id) ON DELETE SET NULL;

--
-- Name: flow flow_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow
    ADD CONSTRAINT flow_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: flow_run flow_run_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_run
    ADD CONSTRAINT flow_run_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: flow_run flow_run_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_run
    ADD CONSTRAINT flow_run_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.flow(id) ON DELETE CASCADE;

--
-- Name: google_integration google_integration_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_integration
    ADD CONSTRAINT google_integration_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: impersonation_log impersonation_log_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.impersonation_log
--     ADD CONSTRAINT impersonation_log_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--

--
-- Name: impersonation_log impersonation_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation_log
    ADD CONSTRAINT impersonation_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: inbound_webhook inbound_webhook_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_webhook
    ADD CONSTRAINT inbound_webhook_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: integracao_chave integracao_chave_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integracao_chave
    ADD CONSTRAINT integracao_chave_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: lead_evento lead_evento_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_evento
    ADD CONSTRAINT lead_evento_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.crm_cards(id) ON DELETE CASCADE;

--
-- Name: lead_evento lead_evento_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_evento
    ADD CONSTRAINT lead_evento_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: lead_form lead_form_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_form
    ADD CONSTRAINT lead_form_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: lead_form_submission lead_form_submission_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_form_submission
    ADD CONSTRAINT lead_form_submission_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: lead_form_submission lead_form_submission_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_form_submission
    ADD CONSTRAINT lead_form_submission_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.lead_form(id) ON DELETE CASCADE;

--
-- Name: lead_nota lead_nota_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_nota
    ADD CONSTRAINT lead_nota_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.crm_cards(id) ON DELETE CASCADE;

--
-- Name: lead_nota lead_nota_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_nota
    ADD CONSTRAINT lead_nota_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: mensagem_agendada mensagem_agendada_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagem_agendada
    ADD CONSTRAINT mensagem_agendada_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.crm_cards(id) ON DELETE SET NULL;

--
-- Name: mensagem_agendada mensagem_agendada_catalogo_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagem_agendada
    ADD CONSTRAINT mensagem_agendada_catalogo_item_id_fkey FOREIGN KEY (catalogo_item_id) REFERENCES public.produto(id) ON DELETE SET NULL;

--
-- Name: mensagem_agendada mensagem_agendada_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagem_agendada
    ADD CONSTRAINT mensagem_agendada_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: mensagem_agendada mensagem_agendada_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagem_agendada
    ADD CONSTRAINT mensagem_agendada_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.mensagem_agendada(id) ON DELETE CASCADE;

--
-- Name: mensagem_agendada mensagem_agendada_servico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagem_agendada
    ADD CONSTRAINT mensagem_agendada_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES public.servico(id) ON DELETE SET NULL;

--
-- Name: mensagens mensagens_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.mensagens(id) ON DELETE SET NULL;

-- Referencia a auth.users (no existe fuera de este backend):
-- --
-- -- Name: mensagens mensagens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- --
-- 
-- ALTER TABLE ONLY public.mensagens
--     ADD CONSTRAINT mensagens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--

--
-- Name: message_hsm_template message_hsm_template_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_hsm_template
    ADD CONSTRAINT message_hsm_template_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

--
-- Name: message_hsm_template message_hsm_template_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_hsm_template
    ADD CONSTRAINT message_hsm_template_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instance


-- ============================================================
-- 2. FUNCTIONS (62 RPC & TRIGGER FUNCTIONS)
-- ============================================================

-- Function: enqueue_email
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$


-- Function: notif_campanha_finalizada
CREATE OR REPLACE FUNCTION public.notif_campanha_finalizada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('concluida','finalizada','concluido') THEN
    PERFORM public.push_notificacao(
      NEW.company_id, 'campanha_finalizada',
      'Campanha concluída: ' || NEW.nome,
      COALESCE(NEW.total_enviados,0)::text || ' enviadas · ' || COALESCE(NEW.total_falhas,0)::text || ' falhas',
      '/app/campanhas', NEW.id::text
    );
  END IF;
  RETURN NEW;
END; $function$


-- Function: tg_set_updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$


-- Function: notif_chamado_respondido
CREATE OR REPLACE FUNCTION public.notif_chamado_respondido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t RECORD;
BEGIN
  IF NEW.sender_role = 'admin' THEN
    SELECT company_id, assunto INTO t FROM public.support_ticket WHERE id = NEW.ticket_id;
    IF FOUND THEN
      PERFORM public.push_notificacao(
        t.company_id, 'chamado_respondido',
        'Suporte respondeu: ' || t.assunto,
        left(NEW.content, 140),
        '/app?ticket=' || NEW.ticket_id::text, NEW.id::text
      );
    END IF;
  END IF;
  RETURN NEW;
END; $function$


-- Function: notif_conexao_caiu
CREATE OR REPLACE FUNCTION public.notif_conexao_caiu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('disconnected','close','closed')
     AND COALESCE(NEW.paused, false) = false THEN
    PERFORM public.push_notificacao(
      NEW.company_id, 'conexao_caiu',
      'Conexão caiu: ' || COALESCE(NEW.display_name, NEW.numero, NEW.instance_name),
      'O WhatsApp desconectou. Reconecte para continuar recebendo mensagens.',
      '/app/conexao', NEW.id::text || ':' || to_char(now(),'YYYYMMDDHH24MI')
    );
  END IF;
  RETURN NEW;
END; $function$


-- Function: notif_lead_novo
CREATE OR REPLACE FUNCTION public.notif_lead_novo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.push_notificacao(
    NEW.company_id, 'lead_novo',
    'Novo lead: ' || COALESCE(NULLIF(NEW.nome,''), NEW.numero),
    COALESCE(NEW.origem, 'Entrada no funil'),
    '/app/crm', NEW.id::text
  );
  RETURN NEW;
END; $function$


-- Function: move_to_dlq
CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$


-- Function: plugin_assinatura_valida
CREATE OR REPLACE FUNCTION public.plugin_assinatura_valida(_assinatura_status text, _trial_ends_at timestamp with time zone, _current_period_end timestamp with time zone, _gratuito boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN coalesce(_gratuito, true) THEN true
    WHEN _assinatura_status = 'ativa' THEN coalesce(_current_period_end, now() + interval '1 day') > now()
    WHEN _assinatura_status = 'trial' THEN coalesce(_trial_ends_at, now()) > now()
    WHEN _assinatura_status = 'cancelada' THEN coalesce(_current_period_end, _trial_ends_at, now()) > now()
    ELSE false
  END
$function$


-- Function: plugin_receita_resumo
CREATE OR REPLACE FUNCTION public.plugin_receita_resumo()
 RETURNS TABLE(plugin_id uuid, slug text, nome text, gratuito boolean, preco_mensal numeric, instalacoes bigint, em_trial bigint, assinaturas_ativas bigint, canceladas bigint, receita_mensal_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.slug,
    p.nome,
    coalesce(p.gratuito, true),
    coalesce(p.preco_mensal, 0),
    count(cp.id) FILTER (WHERE cp.instalado),
    count(cp.id) FILTER (WHERE cp.instalado AND cp.assinatura_status = 'trial'),
    count(cp.id) FILTER (WHERE cp.instalado AND cp.assinatura_status = 'ativa' AND coalesce(p.gratuito,true) = false),
    count(cp.id) FILTER (WHERE cp.assinatura_status = 'cancelada'),
    coalesce(sum(cp.preco_cents) FILTER (WHERE cp.instalado AND cp.assinatura_status = 'ativa' AND coalesce(p.gratuito,true) = false), 0)
  FROM public.plugin p
  LEFT JOIN public.company_plugin cp ON cp.plugin_id = p.id
  WHERE public.is_super_admin()
  GROUP BY p.id, p.slug, p.nome, p.gratuito, p.preco_mensal
  ORDER BY p.nome
$function$


-- Function: department_set_updated_at
CREATE OR REPLACE FUNCTION public.department_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$


-- Function: fin_enable_for_company
CREATE OR REPLACE FUNCTION public.fin_enable_for_company(_company_id uuid, _enable boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_company_role(_company_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  UPDATE public.company SET financeiro_ativo = _enable WHERE id = _company_id;
  IF _enable THEN PERFORM public.seed_fin_categorias(_company_id); END IF;
END $function$


-- Function: email_queue_dispatch
CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://project--7d8997de-b953-4571-8ff9-fcb7148a9d47.lovable.app/lovable/email/queue/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$


-- Function: email_queue_wake
CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://project--7d8997de-b953-4571-8ff9-fcb7148a9d47.lovable.app/lovable/email/queue/process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$


-- Function: enforce_user_pipeline_access
CREATE OR REPLACE FUNCTION public.enforce_user_pipeline_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  restricoes int;
BEGIN
  IF auth.uid() IS NULL OR NEW.pipeline_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO restricoes
  FROM public.company_user_pipeline
  WHERE company_id = NEW.company_id AND user_id = auth.uid();

  IF restricoes = 0 THEN
    RETURN NEW;
  END IF;

  IF public.has_company_role(NEW.company_id, ARRAY['owner','admin']) OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_user_pipeline
    WHERE company_id = NEW.company_id AND user_id = auth.uid() AND pipeline_id = NEW.pipeline_id
  ) THEN
    RAISE EXCEPTION 'Sem acesso a este funil.';
  END IF;

  RETURN NEW;
END;
$function$


-- Function: find_company_by_email
CREATE OR REPLACE FUNCTION public.find_company_by_email(_email text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT cu.company_id
  FROM auth.users u
  JOIN public.company_user cu ON cu.user_id = u.id AND cu.ativo = true
  WHERE lower(u.email) = lower(_email)
  ORDER BY cu.created_at ASC
  LIMIT 1;
$function$


-- Function: gerar_notificacoes_agendamento
CREATE OR REPLACE FUNCTION public.gerar_notificacoes_agendamento()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, company_id, titulo, inicio FROM public.agendamento
    WHERE status IS DISTINCT FROM 'cancelado'
      AND inicio BETWEEN now() AND now() + interval '30 minutes'
  LOOP
    PERFORM public.push_notificacao(
      r.company_id, 'agendamento_proximo',
      'Agendamento em breve: ' || COALESCE(r.titulo,'Compromisso'),
      'Começa às ' || to_char(r.inicio AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
      '/app/agendamentos', r.id::text
    );
  END LOOP;
END; $function$


-- Function: get_infra_stats
CREATE OR REPLACE FUNCTION public.get_infra_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _db_size bigint;
  _conn_total int;
  _conn_active int;
  _conn_idle int;
  _max_conn int;
  _wal_size bigint;
  _top_tables jsonb;
  _storage_total_bytes bigint;
  _storage_object_count bigint;
  _buckets jsonb;
  _slow_queries jsonb;
BEGIN
  SELECT pg_database_size(current_database()) INTO _db_size;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE state = 'active'), COUNT(*) FILTER (WHERE state = 'idle')
    INTO _conn_total, _conn_active, _conn_idle
    FROM pg_stat_activity WHERE datname = current_database();

  SELECT setting::int INTO _max_conn FROM pg_settings WHERE name = 'max_connections';

  BEGIN
    SELECT COALESCE(SUM(size), 0) INTO _wal_size FROM pg_ls_waldir();
  EXCEPTION WHEN OTHERS THEN _wal_size := 0;
  END;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO _top_tables FROM (
    SELECT relname AS name, pg_total_relation_size(c.oid) AS size_bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 8
  ) t;

  BEGIN
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0), COUNT(*)
      INTO _storage_total_bytes, _storage_object_count
      FROM storage.objects;
    SELECT COALESCE(jsonb_agg(b), '[]'::jsonb) INTO _buckets FROM (
      SELECT
        bucket_id AS name,
        COUNT(*) AS objects,
        COALESCE(SUM((metadata->>'size')::bigint), 0) AS size_bytes
      FROM storage.objects
      GROUP BY bucket_id
      ORDER BY 3 DESC
    ) b;
  EXCEPTION WHEN OTHERS THEN
    _storage_total_bytes := 0; _storage_object_count := 0; _buckets := '[]'::jsonb;
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(q), '[]'::jsonb) INTO _slow_queries FROM (
      SELECT
        substring(query, 1, 180) AS query,
        calls,
        ROUND(mean_exec_time::numeric, 2) AS mean_ms,
        ROUND(total_exec_time::numeric, 2) AS total_ms
      FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'
        AND query NOT ILIKE '%pg_stat_activity%'
        AND query NOT ILIKE 'COMMIT%'
        AND query NOT ILIKE 'BEGIN%'
      ORDER BY total_exec_time DESC
      LIMIT 5
    ) q;
  EXCEPTION WHEN OTHERS THEN _slow_queries := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'db_size_bytes', _db_size,
    'wal_size_bytes', _wal_size,
    'connections_total', _conn_total,
    'connections_active', _conn_active,
    'connections_idle', _conn_idle,
    'connections_max', _max_conn,
    'top_tables', _top_tables,
    'storage_total_bytes', _storage_total_bytes,
    'storage_object_count', _storage_object_count,
    'buckets', _buckets,
    'slow_queries', _slow_queries
  );
END $function$


-- Function: push_notificacao
CREATE OR REPLACE FUNCTION public.push_notificacao(_company_id uuid, _tipo text, _titulo text, _descricao text, _link text, _ref_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _company_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notificacao (company_id, tipo, titulo, descricao, link, ref_id)
  VALUES (_company_id, _tipo, _titulo, _descricao, _link, _ref_id)
  ON CONFLICT DO NOTHING;
END; $function$


-- Function: grant_credits
CREATE OR REPLACE FUNCTION public.grant_credits(_company_id uuid, _qtd integer, _motivo text DEFAULT 'bonus_admin'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _novo int; _uid uuid;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _qtd = 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  _uid := auth.uid();
  UPDATE public.company
    SET creditos_saldo = GREATEST(0, creditos_saldo + _qtd)
    WHERE id = _company_id
    RETURNING creditos_saldo INTO _novo;
  IF _novo IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;
  INSERT INTO public.credit_ledger(company_id, delta, saldo_apos, motivo, created_by)
    VALUES (_company_id, _qtd, _novo, _motivo, _uid);
  RETURN _novo;
END $function$


-- Function: install_default_plugins
CREATE OR REPLACE FUNCTION public.install_default_plugins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.company_plugin (company_id, plugin_id, instalado, ativo, status)
  SELECT NEW.id, p.id, true, true, 'ok'
  FROM public.plugin p
  WHERE p.status = 'ativo'
    AND p.slug IN ('whatsapp-evolution', 'whatsapp-uazapi', 'instagram', 'messenger')
  ON CONFLICT (company_id, plugin_id) DO NOTHING;
  RETURN NEW;
END;
$function$


-- Function: provision_company_atomic
CREATE OR REPLACE FUNCTION public.provision_company_atomic(_user_id uuid, _nome text, _slug text, _trial_ate timestamp with time zone, _plan_slug text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 0));

  SELECT cu.company_id
    INTO _company_id
  FROM public.company_user cu
  WHERE cu.user_id = _user_id
    AND cu.ativo = true
  ORDER BY cu.created_at ASC
  LIMIT 1;

  IF _company_id IS NOT NULL THEN
    RETURN _company_id;
  END IF;

  INSERT INTO public.company (
    nome,
    slug,
    primary_color,
    created_by,
    status_cobranca,
    onboarding_completed,
    onboarding_step,
    trial_ate,
    selected_plan_slug
  ) VALUES (
    _nome,
    _slug,
    '#0B22FE',
    _user_id,
    'trial',
    false,
    0,
    _trial_ate,
    _plan_slug
  )
  RETURNING id INTO _company_id;

  RETURN _company_id;
END;
$function$


-- Function: read_email_batch
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$


-- Function: seed_default_pipelines
CREATE OR REPLACE FUNCTION public.seed_default_pipelines()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_pipelines_for_company(NEW.id);
  RETURN NEW;
END $function$


-- Function: seed_default_stages
CREATE OR REPLACE FUNCTION public.seed_default_stages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.crm_stage (company_id, nome, ordem, cor, tipo) VALUES
    (NEW.id, 'Conversas',  0, '#8AA89A', 'normal'),
    (NEW.id, 'Negociando', 1, '#FFB020', 'normal'),
    (NEW.id, 'Ganho',      2, '#22B85F', 'ganho'),
    (NEW.id, 'Perda',      3, '#FF5A5A', 'perda')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$


-- Function: maintenance_cleanup
CREATE OR REPLACE FUNCTION public.maintenance_cleanup()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  BEGIN
    DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DELETE FROM public.audit_log WHERE created_at < now() - interval '90 days';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DELETE FROM public.auth_log WHERE created_at < now() - interval '90 days';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DELETE FROM public.webhook_delivery_log WHERE created_at < now() - interval '30 days';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $function$


-- Function: can_access_feature
CREATE OR REPLACE FUNCTION public.can_access_feature(_key text, _company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.is_super_admin() THEN true
    ELSE COALESCE((
      SELECT
        CASE f.rollout
          WHEN 'publico' THEN true
          WHEN 'beta'    THEN _company_id = ANY(f.beta_company_ids)
          WHEN 'interno' THEN false
        END
      FROM public.feature_flags f WHERE f.key = _key
    ), true) -- flag inexistente = liberado por padrão
  END;
$function$


-- Function: can_assign_custom_role
CREATE OR REPLACE FUNCTION public.can_assign_custom_role(_company_id uuid, _custom_role_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _custom_role_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.company_role cr
      WHERE cr.id = _custom_role_id
        AND cr.company_id = _company_id
        AND (cr.base_role <> 'owner'::tenant_role
             OR public.has_company_role(_company_id, ARRAY['owner'::text]))
    );
$function$


-- Function: can_manage_operational_reports
CREATE OR REPLACE FUNCTION public.can_manage_operational_reports(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_company_role(_company_id, ARRAY['owner','admin'])
     AND EXISTS (
       SELECT 1 FROM public.company c
       WHERE c.id = _company_id
         AND c.atendimento_operacional = true
     )
$function$


-- Function: claim_super_admin_if_empty
CREATE OR REPLACE FUNCTION public.claim_super_admin_if_empty()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _email text;
  _exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role
  ) INTO _exists;

  IF _exists THEN RETURN; END IF;

  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  IF _email IS NULL THEN RETURN; END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'super_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.app_config (id, super_admin_emails)
  VALUES (true, ARRAY[_email])
  ON CONFLICT (id) DO UPDATE
    SET super_admin_emails = (
      SELECT ARRAY(SELECT DISTINCT unnest(public.app_config.super_admin_emails || ARRAY[_email]))
    ),
    updated_at = now();
END $function$


-- Function: company_write_allowed
CREATE OR REPLACE FUNCTION public.company_write_allowed(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_super_admin() or coalesce((
    select case
      when c.status_cobranca = 'ativo' then true
      when c.status_cobranca = 'trial' and c.trial_ate > now() then true
      else false
    end
    from public.company c
    where c.id = _company_id
  ), false);
$function$


-- Function: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role
  );
$function$


-- Function: consume_ai_credit
CREATE OR REPLACE FUNCTION public.consume_ai_credit(_company_id uuid, _ref text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _novo int;
BEGIN
  UPDATE public.company
    SET creditos_saldo = creditos_saldo - 1
    WHERE id = _company_id AND creditos_saldo > 0
    RETURNING creditos_saldo INTO _novo;
  IF _novo IS NULL THEN RETURN false; END IF;
  INSERT INTO public.credit_ledger(company_id, delta, saldo_apos, motivo, ref)
    VALUES (_company_id, -1, _novo, 'ai_message', _ref);
  RETURN true;
END $function$


-- Function: current_company_id
CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT company_id FROM public.company_user
  WHERE user_id = auth.uid() AND ativo = true
  ORDER BY created_at ASC LIMIT 1;
$function$


-- Function: delete_email
CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$


-- Function: handle_new_company_agents
CREATE OR REPLACE FUNCTION public.handle_new_company_agents()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := coalesce(auth.uid(), NEW.created_by);
BEGIN
    INSERT INTO public.agent_config (company_id, user_id, nome, tipo, nome_agente, papel_objetivo, avatar_url, avatar_traits, is_default)
    VALUES (NEW.id, _owner, 'Lia', 'qualificacao', 'Lia', 'Qualificar leads e agendar reuniões',
      'https://sjvqsukwyxxkuxxaqogs.supabase.co/storage/v1/object/public/agent-knowledge/defaults/lia.png',
      '{"gender": "feminino", "skinTone": "Média", "hair": "Ondulado", "accessories": [], "clothingColor": "Laranja"}'::jsonb, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.agent_config (company_id, user_id, nome, tipo, nome_agente, papel_objetivo, avatar_url, avatar_traits, is_default)
    VALUES (NEW.id, _owner, 'Max', 'followup', 'Max', 'Reengajar leads que pararam de responder',
      'https://sjvqsukwyxxkuxxaqogs.supabase.co/storage/v1/object/public/agent-knowledge/defaults/max.png',
      '{"gender": "masculino", "skinTone": "Clara", "hair": "Curto", "accessories": ["Barba"], "clothingColor": "Azul"}'::jsonb, false)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.agent_config (company_id, user_id, nome, tipo, nome_agente, papel_objetivo, avatar_url, avatar_traits, is_default)
    VALUES (NEW.id, _owner, 'Bia', 'posvenda', 'Bia', 'Suporte pós-venda e pesquisa de satisfação',
      'https://sjvqsukwyxxkuxxaqogs.supabase.co/storage/v1/object/public/agent-knowledge/defaults/bia.png',
      '{"gender": "feminino", "skinTone": "Escura", "hair": "Cacheado", "accessories": [], "clothingColor": "Verde"}'::jsonb, false)
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$function$


-- Function: handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _exists boolean;
BEGIN
  INSERT INTO public.profiles (user_id, email, nome, telefone)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'telefone', '')
  )
  ON CONFLICT (user_id) DO UPDATE
    SET nome = COALESCE(public.profiles.nome, EXCLUDED.nome),
        telefone = COALESCE(public.profiles.telefone, EXCLUDED.telefone);

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role
  ) INTO _exists;

  IF NOT _exists AND NEW.email IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.app_config (id, super_admin_emails)
    VALUES (true, ARRAY[NEW.email])
    ON CONFLICT (id) DO UPDATE
      SET super_admin_emails = (
        SELECT ARRAY(SELECT DISTINCT unnest(public.app_config.super_admin_emails || ARRAY[NEW.email]))
      ),
      updated_at = now();
  END IF;

  RETURN NEW;
END $function$


-- Function: has_active_addon
CREATE OR REPLACE FUNCTION public.has_active_addon(_company_id uuid, _tipo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_addon ca
    JOIN public.addon_product ap ON ap.id = ca.addon_product_id
    WHERE ca.company_id = _company_id
      AND ap.tipo = _tipo
      AND ca.status = 'active'
      AND (ca.current_period_end IS NULL OR ca.current_period_end > now())
  );
$function$


-- Function: has_company_access
CREATE OR REPLACE FUNCTION public.has_company_access(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.company_user
    WHERE user_id = auth.uid()
      AND company_id = _company_id
      AND ativo = true
  );
$function$


-- Function: has_company_role
CREATE OR REPLACE FUNCTION public.has_company_role(_company_id uuid, _roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.company_user
    WHERE company_id = _company_id
      AND user_id = auth.uid()
      AND ativo = true
      AND role::text = ANY (_roles)
  );
$function$


-- Function: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$function$


-- Function: hsm_template_set_updated_at
CREATE OR REPLACE FUNCTION public.hsm_template_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


-- Function: list_feature_flags_for_me
CREATE OR REPLACE FUNCTION public.list_feature_flags_for_me()
 RETURNS TABLE(key text, rollout text, enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    f.key,
    f.rollout::text,
    CASE
      WHEN public.is_super_admin() THEN true
      WHEN f.rollout = 'publico' THEN true
      WHEN f.rollout = 'beta' THEN EXISTS (
        SELECT 1 FROM public.company_user cu
        WHERE cu.user_id = auth.uid()
          AND cu.ativo = true
          AND cu.company_id = ANY(f.beta_company_ids)
      )
      ELSE false
    END AS enabled
  FROM public.feature_flags f;
$function$


-- Function: seed_fin_categorias
CREATE OR REPLACE FUNCTION public.seed_fin_categorias(_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.fin_categoria (company_id, nome, tipo, cor) VALUES
    (_company_id, 'Vendas', 'receita', '#22B85F'),
    (_company_id, 'Serviços', 'receita', '#8AA89A'),
    (_company_id, 'Outras receitas', 'receita', '#5DB6FF'),
    (_company_id, 'Marketing', 'despesa', '#FFB020'),
    (_company_id, 'Folha de pagamento', 'despesa', '#FF7A59'),
    (_company_id, 'Infraestrutura', 'despesa', '#A36BFF'),
    (_company_id, 'Operacional', 'despesa', '#FF5A5A'),
    (_company_id, 'Impostos', 'despesa', '#666666')
  ON CONFLICT DO NOTHING;
END $function$


-- Function: seed_fixed_agents
CREATE OR REPLACE FUNCTION public.seed_fixed_agents(_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid;
BEGIN
  SELECT user_id INTO _uid FROM public.company_user
    WHERE company_id = _company_id AND ativo = true
    ORDER BY created_at ASC LIMIT 1;

  IF _uid IS NULL THEN
    SELECT created_by INTO _uid FROM public.company WHERE id = _company_id;
  END IF;

  IF _uid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.agent_config (company_id, user_id, tipo, nome, nome_agente, sistema, is_default, papel_objetivo)
  VALUES
    (_company_id, _uid, 'qualificacao', 'Qualificação', 'Ana',
     true, true, 'Qualificar novos leads, coletar informações e agendar próximos passos com foco em fechar venda.'),
    (_company_id, _uid, 'followup', 'Follow-up', 'Léo',
     true, false, 'Reengajar leads que não responderam, com abordagens curtas e progressivamente diretas.'),
    (_company_id, _uid, 'posvenda', 'Pós-venda', 'Sofia',
     true, false, 'Acompanhar cliente após a venda: onboarding, satisfação, pedir avaliação e detectar oportunidade de recompra.')
  ON CONFLICT (company_id, tipo) DO NOTHING;
END $function$


-- Function: seed_pipelines_for_company
CREATE OR REPLACE FUNCTION public.seed_pipelines_for_company(_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pipe_com uuid; _pipe_fup uuid; _pipe_pos uuid;
  _s1 uuid; _s2 uuid; _s3 uuid; _s4 uuid; _s5 uuid;
  _fup1 uuid; _fup2 uuid; _fup3 uuid; _fup4 uuid;
  _pos1 uuid; _pos2 uuid; _pos3 uuid; _pos4 uuid;
BEGIN
  -- COMERCIAL
  INSERT INTO public.crm_pipeline (company_id, nome, tipo, ordem)
  VALUES (_company_id, 'Comercial', 'comercial', 0)
  RETURNING id INTO _pipe_com;

  -- FOLLOW-UP
  INSERT INTO public.crm_pipeline (company_id, nome, tipo, ordem)
  VALUES (_company_id, 'Follow-up', 'followup', 1)
  RETURNING id INTO _pipe_fup;

  -- PÓS-VENDA
  INSERT INTO public.crm_pipeline (company_id, nome, tipo, ordem)
  VALUES (_company_id, 'Pós-venda', 'posvenda', 2)
  RETURNING id INTO _pipe_pos;

  -- ============ Etapas COMERCIAL ============
  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo)
    VALUES (_company_id, _pipe_com, 'Novo lead', 0, '#8AA89A', 'normal') RETURNING id INTO _s1;
  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo)
    VALUES (_company_id, _pipe_com, 'Qualificado', 1, '#5DB6FF', 'normal') RETURNING id INTO _s2;
  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo)
    VALUES (_company_id, _pipe_com, 'Negociando', 2, '#FFB020', 'normal') RETURNING id INTO _s3;
  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo, trigger_pipeline_destino)
    VALUES (_company_id, _pipe_com, 'Ganho', 3, '#22B85F', 'ganho', _pipe_pos) RETURNING id INTO _s4;
  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo)
    VALUES (_company_id, _pipe_com, 'Perda', 4, '#FF5A5A', 'perda') RETURNING id INTO _s5;

  -- ============ Etapas FOLLOW-UP ============
  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo,
      regua_ativa, delay_valor, delay_unidade, hora_do_dia, mensagem_tipo, mensagem_texto)
    VALUES (_company_id, _pipe_fup, 'Sem resposta 1', 0, '#FFB020', 'normal',
      true, 3, 'dias', '10:00', 'template',
      'Oi {{nome}}! 👋 Vi que ainda não retornamos nossa conversa. Ainda tem interesse? Estou por aqui pra ajudar.')
    RETURNING id INTO _fup1;

  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo,
      regua_ativa, delay_valor, delay_unidade, hora_do_dia, mensagem_tipo, mensagem_texto)
    VALUES (_company_id, _pipe_fup, 'Sem resposta 2', 1, '#FF7A59', 'normal',
      true, 7, 'dias', '10:00', 'template',
      'Oi {{nome}}, tudo bem? Só passando pra saber se posso te ajudar com algo. Se preferir, me chama que retomamos de onde paramos.')
    RETURNING id INTO _fup2;

  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo,
      regua_ativa, delay_valor, delay_unidade, hora_do_dia, mensagem_tipo, mensagem_prompt)
    VALUES (_company_id, _pipe_fup, 'Reengajamento', 2, '#A36BFF', 'normal',
      true, 15, 'dias', '10:00', 'ia_leve',
      'Gere UMA mensagem curta e natural de reengajamento para {{nome}}. Sem pressão, tom leve e amigável, oferecendo ajuda. Máximo 2 linhas.')
    RETURNING id INTO _fup3;

  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo)
    VALUES (_company_id, _pipe_fup, 'Perdido', 3, '#666666', 'perda') RETURNING id INTO _fup4;

  UPDATE public.crm_stage SET move_se_sem_resposta_dias = 4, move_se_sem_resposta_para = _fup2 WHERE id = _fup1;
  UPDATE public.crm_stage SET move_se_sem_resposta_dias = 7, move_se_sem_resposta_para = _fup3 WHERE id = _fup2;
  UPDATE public.crm_stage SET move_se_sem_resposta_dias = 10, move_se_sem_resposta_para = _fup4 WHERE id = _fup3;

  -- ============ Etapas PÓS-VENDA ============
  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo,
      regua_ativa, delay_valor, delay_unidade, hora_do_dia, mensagem_tipo, mensagem_texto)
    VALUES (_company_id, _pipe_pos, 'Boas-vindas', 0, '#22B85F', 'normal',
      true, 0, 'horas', NULL, 'template',
      'Muito obrigado pela confiança, {{nome}}! 🎉 Qualquer dúvida na sua jornada com a gente é só chamar aqui.')
    RETURNING id INTO _pos1;

  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo,
      regua_ativa, delay_valor, delay_unidade, hora_do_dia, mensagem_tipo, mensagem_texto)
    VALUES (_company_id, _pipe_pos, 'Check-in 7 dias', 1, '#5DB6FF', 'normal',
      true, 7, 'dias', '11:00', 'template',
      'Oi {{nome}}! Passei aqui pra saber como está sua experiência com a gente até agora. Alguma dúvida ou sugestão?')
    RETURNING id INTO _pos2;

  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo,
      regua_ativa, delay_valor, delay_unidade, hora_do_dia, mensagem_tipo, mensagem_texto)
    VALUES (_company_id, _pipe_pos, 'NPS 30 dias', 2, '#FFB020', 'normal',
      true, 30, 'dias', '11:00', 'template',
      'Oi {{nome}}! Numa escala de 0 a 10, o quanto você recomendaria nosso trabalho pra um amigo? Sua resposta ajuda muito. 🙏')
    RETURNING id INTO _pos3;

  INSERT INTO public.crm_stage (company_id, pipeline_id, nome, ordem, cor, tipo,
      regua_ativa, delay_valor, delay_unidade, hora_do_dia, mensagem_tipo, mensagem_texto)
    VALUES (_company_id, _pipe_pos, 'Recompra 90 dias', 3, '#A36BFF', 'normal',
      true, 90, 'dias', '11:00', 'template',
      'Oi {{nome}}, tudo bem? Já faz um tempinho — quer ver as novidades ou renovar seu atendimento? Estou por aqui!')
    RETURNING id INTO _pos4;

  UPDATE public.crm_stage SET move_se_sem_resposta_dias = 7, move_se_sem_resposta_para = _pos2 WHERE id = _pos1;
  UPDATE public.crm_stage SET move_se_sem_resposta_dias = 23, move_se_sem_resposta_para = _pos3 WHERE id = _pos2;
  UPDATE public.crm_stage SET move_se_sem_resposta_dias = 60, move_se_sem_resposta_para = _pos4 WHERE id = _pos3;
END $function$


-- Function: set_company_plugin_updated_at
CREATE OR REPLACE FUNCTION public.set_company_plugin_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$


-- Function: set_plugin_updated_at
CREATE OR REPLACE FUNCTION public.set_plugin_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$


-- Function: set_queue_member_company
CREATE OR REPLACE FUNCTION public.set_queue_member_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT q.company_id INTO NEW.company_id
  FROM public.crm_distribution_queues q
  WHERE q.id = NEW.queue_id;
  RETURN NEW;
END;
$function$


-- Function: set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$


-- Function: sevcon_ensure_default_fields
CREATE OR REPLACE FUNCTION public.sevcon_ensure_default_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company_id = '0b2e15e9-3be9-4923-a6ff-67b1ce4c53e1'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(coalesce(NEW.campos_extras->'personalizados', '[]'::jsonb)) item
       WHERE lower(item->>'label') = lower('Senha Meu Gov')
     ) THEN
    NEW.campos_extras := jsonb_set(
      coalesce(NEW.campos_extras, '{}'::jsonb),
      '{personalizados}',
      coalesce(NEW.campos_extras->'personalizados', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('label', 'Senha Meu Gov', 'valor', '', 'origem', 'sevcon_padrao')
      ),
      true
    );
  END IF;
  RETURN NEW;
END;
$function$


-- Function: tg_addon_touch_updated_at
CREATE OR REPLACE FUNCTION public.tg_addon_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$


-- Function: tg_agent_link_pipeline
CREATE OR REPLACE FUNCTION public.tg_agent_link_pipeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.crm_pipeline p
     SET agent_id = NEW.id
   WHERE p.company_id = NEW.company_id
     AND p.agent_id IS NULL
     AND (
       (p.tipo = 'comercial' AND NEW.tipo = 'qualificacao') OR
       (p.tipo = 'followup'  AND NEW.tipo = 'followup')     OR
       (p.tipo = 'posvenda'  AND NEW.tipo = 'posvenda')
     );
  RETURN NEW;
END;
$function$


-- Function: tg_card_stage_changed
CREATE OR REPLACE FUNCTION public.tg_card_stage_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.entrou_stage_em = now();
    NEW.regua_ultimo_disparo_em = NULL;
    NEW.regua_status = 'ativa';
  END IF;
  RETURN NEW;
END $function$


-- Function: topup_plan_credits
CREATE OR REPLACE FUNCTION public.topup_plan_credits(_company_id uuid, _plan_slug text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _qtd integer;
  _anterior integer;
  _novo integer;
BEGIN
  SELECT creditos_mensais
    INTO _qtd
    FROM public.plan
   WHERE slug = _plan_slug
     AND ativo = true;

  IF _qtd IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT creditos_saldo
    INTO _anterior
    FROM public.company
   WHERE id = _company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.company
     SET creditos_saldo = _qtd,
         creditos_origem = 'plano',
         creditos_resetam_em = now() + interval '30 days'
   WHERE id = _company_id
   RETURNING creditos_saldo INTO _novo;

  INSERT INTO public.credit_ledger(company_id, delta, saldo_apos, motivo, ref)
  VALUES (_company_id, _novo - COALESCE(_anterior, 0), _novo, 'plan_topup', _plan_slug);

  RETURN _novo;
END
$function$


-- Function: tg_card_stage_history
CREATE OR REPLACE FUNCTION public.tg_card_stage_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _from_nome text;
  _to_nome text;
  _tempo bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT nome INTO _to_nome FROM public.crm_stage WHERE id = NEW.stage_id;
    INSERT INTO public.crm_card_stage_history(company_id, card_id, pipeline_id, stage_from, stage_to, stage_from_nome, stage_to_nome, moved_by, tempo_na_etapa_seg)
    VALUES (NEW.company_id, NEW.id, NEW.pipeline_id, NULL, NEW.stage_id, NULL, _to_nome, auth.uid(), NULL);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT nome INTO _from_nome FROM public.crm_stage WHERE id = OLD.stage_id;
    SELECT nome INTO _to_nome FROM public.crm_stage WHERE id = NEW.stage_id;
    _tempo := EXTRACT(EPOCH FROM (now() - COALESCE(OLD.entrou_stage_em, OLD.updated_at, OLD.ultima_em)))::bigint;
    INSERT INTO public.crm_card_stage_history(company_id, card_id, pipeline_id, stage_from, stage_to, stage_from_nome, stage_to_nome, moved_by, tempo_na_etapa_seg)
    VALUES (NEW.company_id, NEW.id, NEW.pipeline_id, OLD.stage_id, NEW.stage_id, _from_nome, _to_nome, auth.uid(), _tempo);
  END IF;
  RETURN NEW;
END $function$


-- Function: tg_card_ultima_mensagem
CREATE OR REPLACE FUNCTION public.tg_card_ultima_mensagem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  preview text;
BEGIN
  preview := NULLIF(btrim(COALESCE(NEW.texto, '')), '');
  IF preview IS NULL THEN
    preview := CASE
      WHEN NEW.midia_tipo ILIKE '%audio%' THEN '🎤 Áudio'
      WHEN NEW.midia_tipo ILIKE '%image%' OR NEW.midia_tipo ILIKE '%imagem%' THEN '🖼️ Imagem'
      WHEN NEW.midia_tipo ILIKE '%video%' THEN '🎬 Vídeo'
      WHEN NEW.midia_tipo ILIKE '%local%' THEN '📍 Localização'
      WHEN NEW.midia_tipo IS NOT NULL THEN '📎 Arquivo'
      ELSE NULL
    END;
  END IF;

  IF preview IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.crm_cards
     SET ultima_mensagem = left(preview, 240),
         ultima_em = NEW.created_at,
         ultima_direcao = NEW.direcao
   WHERE company_id = NEW.company_id
     AND numero = NEW.numero;

  RETURN NEW;
END;
$function$


-- Function: tg_company_seed_owner
CREATE OR REPLACE FUNCTION public.tg_company_seed_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.company_user (company_id, user_id, role, ativo)
    VALUES (NEW.id, NEW.created_by, 'owner'::tenant_role, true)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $function$


-- Function: tg_company_seed_subscription
CREATE OR REPLACE FUNCTION public.tg_company_seed_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan_id uuid;
  _slug text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscription WHERE company_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  _slug := COALESCE(NEW.selected_plan_slug, 'pro');
  SELECT id INTO _plan_id FROM public.plan WHERE slug = _slug AND ativo = true LIMIT 1;
  IF _plan_id IS NULL THEN
    SELECT id INTO _plan_id FROM public.plan WHERE slug = 'pro' LIMIT 1;
  END IF;

  INSERT INTO public.subscription (company_id, plan_id, status, ciclo, trial_ends_at, provider)
  VALUES (NEW.id, _plan_id, 'trialing', 'mensal', NEW.trial_ate, 'manual')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $function$


-- Function: tg_company_trial_credits
CREATE OR REPLACE FUNCTION public.tg_company_trial_credits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _qtd int;
BEGIN
  IF NEW.selected_plan_slug IS NOT NULL THEN
    SELECT creditos_trial INTO _qtd FROM public.plan WHERE slug = NEW.selected_plan_slug;
  END IF;
  IF _qtd IS NULL THEN _qtd := 50; END IF;
  NEW.creditos_saldo := _qtd;
  NEW.creditos_origem := 'trial';
  NEW.creditos_resetam_em := NEW.trial_ate;
  RETURN NEW;
END $function$


-- Function: tg_crm_pipeline_mark_sistema
CREATE OR REPLACE FUNCTION public.tg_crm_pipeline_mark_sistema()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tipo IN ('comercial','followup','posvenda') THEN
    NEW.sistema := true;
  END IF;
  RETURN NEW;
END;
$function$


-- Function: tg_fin_lancamento_on_venda
CREATE OR REPLACE FUNCTION public.tg_fin_lancamento_on_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _fin_ativo boolean;
  _dias smallint;
  _cat uuid;
  _fin_id uuid;
BEGIN
  IF NEW.fin_lancamento_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT financeiro_ativo, financeiro_dias_vencimento_padrao
    INTO _fin_ativo, _dias
    FROM public.company WHERE id = NEW.company_id;

  IF NOT COALESCE(_fin_ativo, false) THEN RETURN NEW; END IF;

  SELECT id INTO _cat FROM public.fin_categoria
    WHERE company_id = NEW.company_id AND tipo = 'receita' AND nome = 'Vendas'
    LIMIT 1;

  INSERT INTO public.fin_lancamento (
    company_id, tipo, descricao, valor_cents, categoria_id,
    status, vencimento, competencia, crm_card_id, contato_numero,
    owner_id, venda_id
  ) VALUES (
    NEW.company_id, 'receita',
    COALESCE(NULLIF(NEW.descricao,''), 'Venda: ' || COALESCE(NULLIF(NEW.contato_nome,''), NEW.contato_numero)),
    GREATEST(0, COALESCE(NEW.valor_cents, 0)), _cat,
    'pendente',
    CURRENT_DATE + COALESCE(_dias, 7),
    CURRENT_DATE,
    NEW.card_id, NEW.contato_numero,
    NEW.owner_id, NEW.id
  ) RETURNING id INTO _fin_id;

  UPDATE public.crm_venda SET fin_lancamento_id = _fin_id WHERE id = NEW.id;
  RETURN NEW;
END
$function$


-- Function: tg_seed_fixed_agents
CREATE OR REPLACE FUNCTION public.tg_seed_fixed_agents()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_fixed_agents(NEW.id);
  UPDATE public.crm_pipeline p
     SET agent_id = a.id
    FROM public.agent_config a
   WHERE a.company_id = p.company_id
     AND p.company_id = NEW.id
     AND (
       (p.tipo = 'comercial' AND a.tipo = 'qualificacao') OR
       (p.tipo = 'followup'  AND a.tipo = 'followup')     OR
       (p.tipo = 'posvenda'  AND a.tipo = 'posvenda')
     );
  RETURN NEW;
END $function$


-- ============================================================
-- 3. TRIGGERS (71 ACTIVE TRIGGERS)
-- ============================================================

CREATE OR REPLACE TRIGGER trg_addon_product_updated BEFORE UPDATE ON public.addon_product FOR EACH ROW EXECUTE FUNCTION tg_addon_touch_updated_at();

CREATE OR REPLACE TRIGGER admin_automation_updated BEFORE UPDATE ON public.admin_automation FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER agent_config_updated BEFORE UPDATE ON public.agent_config FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER agent_link_pipeline AFTER INSERT ON public.agent_config FOR EACH ROW EXECUTE FUNCTION tg_agent_link_pipeline();

CREATE OR REPLACE TRIGGER ai_message_processing_set_updated_at BEFORE UPDATE ON public.ai_message_processing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_api_token_updated_at BEFORE UPDATE ON public.api_token FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER billing_charge_touch BEFORE UPDATE ON public.billing_charge FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_campaign_updated_at BEFORE UPDATE ON public.campaign FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_notif_campanha_finalizada AFTER UPDATE ON public.campaign FOR EACH ROW EXECUTE FUNCTION notif_campanha_finalizada();

CREATE OR REPLACE TRIGGER company_seed_subscription AFTER INSERT ON public.company FOR EACH ROW EXECUTE FUNCTION tg_company_seed_subscription();

CREATE OR REPLACE TRIGGER company_trial_credits BEFORE INSERT ON public.company FOR EACH ROW EXECUTE FUNCTION tg_company_trial_credits();

CREATE OR REPLACE TRIGGER on_company_created_agents AFTER INSERT ON public.company FOR EACH ROW EXECUTE FUNCTION handle_new_company_agents();

CREATE OR REPLACE TRIGGER trg_company_seed_agents AFTER INSERT ON public.company FOR EACH ROW EXECUTE FUNCTION tg_seed_fixed_agents();

CREATE OR REPLACE TRIGGER trg_company_seed_owner AFTER INSERT ON public.company FOR EACH ROW EXECUTE FUNCTION tg_company_seed_owner();

CREATE OR REPLACE TRIGGER trg_company_seed_stages AFTER INSERT ON public.company FOR EACH ROW EXECUTE FUNCTION seed_default_stages();

CREATE OR REPLACE TRIGGER trg_company_updated BEFORE UPDATE ON public.company FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_install_default_plugins AFTER INSERT ON public.company FOR EACH ROW EXECUTE FUNCTION install_default_plugins();

CREATE OR REPLACE TRIGGER trg_seed_default_pipelines AFTER INSERT ON public.company FOR EACH ROW EXECUTE FUNCTION seed_default_pipelines();

CREATE OR REPLACE TRIGGER trg_company_addon_updated BEFORE UPDATE ON public.company_addon FOR EACH ROW EXECUTE FUNCTION tg_addon_touch_updated_at();

CREATE OR REPLACE TRIGGER trg_billing_updated_at BEFORE UPDATE ON public.company_billing FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER update_company_plugin_updated_at BEFORE UPDATE ON public.company_plugin FOR EACH ROW EXECUTE FUNCTION set_company_plugin_updated_at();

CREATE OR REPLACE TRIGGER trg_company_role_updated BEFORE UPDATE ON public.company_role FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_company_user_updated BEFORE UPDATE ON public.company_user FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER contact_pause_updated BEFORE UPDATE ON public.contact_pause FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER crm_cards_enforce_pipeline_access BEFORE INSERT OR UPDATE OF pipeline_id, stage_id ON public.crm_cards FOR EACH ROW EXECUTE FUNCTION enforce_user_pipeline_access();

CREATE OR REPLACE TRIGGER crm_cards_sevcon_default_fields BEFORE INSERT OR UPDATE OF campos_extras ON public.crm_cards FOR EACH ROW EXECUTE FUNCTION sevcon_ensure_default_fields();

CREATE OR REPLACE TRIGGER crm_cards_updated BEFORE UPDATE ON public.crm_cards FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_card_stage_changed BEFORE UPDATE ON public.crm_cards FOR EACH ROW EXECUTE FUNCTION tg_card_stage_changed();

CREATE OR REPLACE TRIGGER trg_card_stage_history_ins AFTER INSERT ON public.crm_cards FOR EACH ROW EXECUTE FUNCTION tg_card_stage_history();

CREATE OR REPLACE TRIGGER trg_card_stage_history_upd AFTER UPDATE OF stage_id ON public.crm_cards FOR EACH ROW EXECUTE FUNCTION tg_card_stage_history();

CREATE OR REPLACE TRIGGER trg_notif_lead_novo AFTER INSERT ON public.crm_cards FOR EACH ROW EXECUTE FUNCTION notif_lead_novo();

CREATE OR REPLACE TRIGGER trg_queues_updated_at BEFORE UPDATE ON public.crm_distribution_queues FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_crm_goals_updated_at BEFORE UPDATE ON public.crm_goals FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER crm_pipeline_mark_sistema BEFORE INSERT ON public.crm_pipeline FOR EACH ROW EXECUTE FUNCTION tg_crm_pipeline_mark_sistema();

CREATE OR REPLACE TRIGGER trg_pipeline_updated_at BEFORE UPDATE ON public.crm_pipeline FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_set_queue_member_company BEFORE INSERT OR UPDATE OF queue_id ON public.crm_queue_members FOR EACH ROW EXECUTE FUNCTION set_queue_member_company();

CREATE OR REPLACE TRIGGER trg_crm_venda_updated_at BEFORE UPDATE ON public.crm_venda FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_fin_lancamento_on_venda AFTER INSERT ON public.crm_venda FOR EACH ROW EXECUTE FUNCTION tg_fin_lancamento_on_venda();

CREATE OR REPLACE TRIGGER set_csat_updated_at BEFORE UPDATE ON public.csat_response FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_dashboard_preferences_updated_at BEFORE UPDATE ON public.dashboard_preferences FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER department_updated_at BEFORE UPDATE ON public.department FOR EACH ROW EXECUTE FUNCTION department_set_updated_at();

CREATE OR REPLACE TRIGGER department_menu_session_set_updated_at BEFORE UPDATE ON public.department_menu_session FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER tg_fin_lancamento_updated_at BEFORE UPDATE ON public.fin_lancamento FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER flow_updated_at BEFORE UPDATE ON public.flow FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER flow_run_updated_at BEFORE UPDATE ON public.flow_run FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER integracao_chave_updated_at BEFORE UPDATE ON public.integracao_chave FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER lead_form_updated_at BEFORE UPDATE ON public.lead_form FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_mensagem_agendada_updated BEFORE UPDATE ON public.mensagem_agendada FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_msg_agendada_updated BEFORE UPDATE ON public.mensagem_agendada FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_card_ultima_mensagem AFTER INSERT ON public.mensagens FOR EACH ROW EXECUTE FUNCTION tg_card_ultima_mensagem();

CREATE OR REPLACE TRIGGER trg_hsm_template_updated_at BEFORE UPDATE ON public.message_hsm_template FOR EACH ROW EXECUTE FUNCTION hsm_template_set_updated_at();

CREATE OR REPLACE TRIGGER trg_message_template_updated_at BEFORE UPDATE ON public.message_template FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER tg_olist_updated_at BEFORE UPDATE ON public.olist_integration FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER outbound_queue_updated_at BEFORE UPDATE ON public.outbound_queue FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_plan_updated_at BEFORE UPDATE ON public.plan FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_plugin_updated_at BEFORE UPDATE ON public.plugin FOR EACH ROW EXECUTE FUNCTION set_plugin_updated_at();

CREATE OR REPLACE TRIGGER update_plugin_banner_updated_at BEFORE UPDATE ON public.plugin_banner FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_produto_updated_at BEFORE UPDATE ON public.produto FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_quick_reply_updated_at BEFORE UPDATE ON public.quick_reply FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_servico_updated BEFORE UPDATE ON public.servico FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_subscription_updated_at BEFORE UPDATE ON public.subscription FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_support_config_updated_at BEFORE UPDATE ON public.support_config FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_notif_chamado_respondido AFTER INSERT ON public.support_message FOR EACH ROW EXECUTE FUNCTION notif_chamado_respondido();

CREATE OR REPLACE TRIGGER trg_support_note_updated_at BEFORE UPDATE ON public.support_note FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER support_ticket_updated_at BEFORE UPDATE ON public.support_ticket FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER user_feedback_updated BEFORE UPDATE ON public.user_feedback FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER set_webhook_updated_at BEFORE UPDATE ON public.webhook_endpoint FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE OR REPLACE TRIGGER trg_notif_conexao_caiu AFTER UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION notif_conexao_caiu();

CREATE OR REPLACE TRIGGER whatsapp_instances_updated BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ============================================================
-- 4. FOREIGN KEYS (141 RELATIONS)
-- ============================================================

DO $$ BEGIN
  ALTER TABLE ONLY public."admin_broadcast_read"
    ADD CONSTRAINT "admin_broadcast_read_broadcast_id_fkey" FOREIGN KEY ("broadcast_id")
    REFERENCES public."admin_broadcast"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_bloqueio"
    ADD CONSTRAINT "agenda_bloqueio_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_bloqueio"
    ADD CONSTRAINT "agenda_bloqueio_recorrencia_id_fkey" FOREIGN KEY ("recorrencia_id")
    REFERENCES public."agenda_recorrencia"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_disponibilidade"
    ADD CONSTRAINT "agenda_disponibilidade_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_historico"
    ADD CONSTRAINT "agenda_historico_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_local"
    ADD CONSTRAINT "agenda_local_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_participante"
    ADD CONSTRAINT "agenda_participante_appointment_id_fkey" FOREIGN KEY ("appointment_id")
    REFERENCES public."mensagem_agendada"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_participante"
    ADD CONSTRAINT "agenda_participante_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_recorrencia"
    ADD CONSTRAINT "agenda_recorrencia_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agenda_tipo"
    ADD CONSTRAINT "agenda_tipo_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agendamento"
    ADD CONSTRAINT "agendamento_card_id_fkey" FOREIGN KEY ("card_id")
    REFERENCES public."crm_cards"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agendamento"
    ADD CONSTRAINT "agendamento_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agent_feedback"
    ADD CONSTRAINT "agent_feedback_agent_id_fkey" FOREIGN KEY ("agent_id")
    REFERENCES public."agent_config"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agent_feedback"
    ADD CONSTRAINT "agent_feedback_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."agent_feedback"
    ADD CONSTRAINT "agent_feedback_mensagem_id_fkey" FOREIGN KEY ("mensagem_id")
    REFERENCES public."mensagens"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."ai_message_processing"
    ADD CONSTRAINT "ai_message_processing_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."api_token"
    ADD CONSTRAINT "api_token_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."atendimento_live_analise"
    ADD CONSTRAINT "atendimento_live_analise_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."atendimento_relatorio"
    ADD CONSTRAINT "atendimento_relatorio_card_id_fkey" FOREIGN KEY ("card_id")
    REFERENCES public."crm_cards"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."atendimento_relatorio"
    ADD CONSTRAINT "atendimento_relatorio_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."atendimento_relatorio"
    ADD CONSTRAINT "atendimento_relatorio_setor_id_fkey" FOREIGN KEY ("setor_id")
    REFERENCES public."department"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."audit_log"
    ADD CONSTRAINT "audit_log_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."auth_log"
    ADD CONSTRAINT "auth_log_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."billing_charge"
    ADD CONSTRAINT "billing_charge_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."billing_charge_item"
    ADD CONSTRAINT "billing_charge_item_charge_id_fkey" FOREIGN KEY ("charge_id")
    REFERENCES public."billing_charge"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."billing_event_log"
    ADD CONSTRAINT "billing_event_log_matched_company_id_fkey" FOREIGN KEY ("matched_company_id")
    REFERENCES public."company"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."campaign"
    ADD CONSTRAINT "campaign_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."campaign"
    ADD CONSTRAINT "campaign_whatsapp_instance_id_fkey" FOREIGN KEY ("whatsapp_instance_id")
    REFERENCES public."whatsapp_instances"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."campaign_blocklist"
    ADD CONSTRAINT "campaign_blocklist_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."campaign_optout"
    ADD CONSTRAINT "campaign_optout_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."campaign_target"
    ADD CONSTRAINT "campaign_target_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES public."campaign"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."campaign_target"
    ADD CONSTRAINT "campaign_target_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company"
    ADD CONSTRAINT "company_csat_destino_pipeline_id_fkey" FOREIGN KEY ("csat_destino_pipeline_id")
    REFERENCES public."crm_pipeline"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company"
    ADD CONSTRAINT "company_csat_destino_stage_id_fkey" FOREIGN KEY ("csat_destino_stage_id")
    REFERENCES public."crm_stage"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_addon"
    ADD CONSTRAINT "company_addon_addon_product_id_fkey" FOREIGN KEY ("addon_product_id")
    REFERENCES public."addon_product"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_addon"
    ADD CONSTRAINT "company_addon_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_billing"
    ADD CONSTRAINT "company_billing_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_plugin"
    ADD CONSTRAINT "company_plugin_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_plugin"
    ADD CONSTRAINT "company_plugin_plugin_id_fkey" FOREIGN KEY ("plugin_id")
    REFERENCES public."plugin"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_role"
    ADD CONSTRAINT "company_role_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_tag"
    ADD CONSTRAINT "company_tag_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_user"
    ADD CONSTRAINT "company_user_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_user"
    ADD CONSTRAINT "company_user_custom_role_fk" FOREIGN KEY ("custom_role_id")
    REFERENCES public."company_role"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_user_instance"
    ADD CONSTRAINT "company_user_instance_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_user_instance"
    ADD CONSTRAINT "company_user_instance_instance_id_fkey" FOREIGN KEY ("instance_id")
    REFERENCES public."whatsapp_instances"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_user_pipeline"
    ADD CONSTRAINT "company_user_pipeline_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."company_user_pipeline"
    ADD CONSTRAINT "company_user_pipeline_pipeline_id_fkey" FOREIGN KEY ("pipeline_id")
    REFERENCES public."crm_pipeline"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."credit_ledger"
    ADD CONSTRAINT "credit_ledger_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_card_stage_history"
    ADD CONSTRAINT "crm_card_stage_history_card_id_fkey" FOREIGN KEY ("card_id")
    REFERENCES public."crm_cards"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_cards"
    ADD CONSTRAINT "crm_cards_department_id_fkey" FOREIGN KEY ("department_id")
    REFERENCES public."department"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_cards"
    ADD CONSTRAINT "crm_cards_pipeline_id_fkey" FOREIGN KEY ("pipeline_id")
    REFERENCES public."crm_pipeline"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_cards"
    ADD CONSTRAINT "crm_cards_retorno_stage_id_fkey" FOREIGN KEY ("retorno_stage_id")
    REFERENCES public."crm_stage"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_cards"
    ADD CONSTRAINT "crm_cards_stage_id_fkey" FOREIGN KEY ("stage_id")
    REFERENCES public."crm_stage"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_distribution_queues"
    ADD CONSTRAINT "crm_distribution_queues_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_distribution_queues"
    ADD CONSTRAINT "crm_distribution_queues_department_id_fkey" FOREIGN KEY ("department_id")
    REFERENCES public."department"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_goals"
    ADD CONSTRAINT "crm_goals_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_pipeline"
    ADD CONSTRAINT "crm_pipeline_agent_id_fkey" FOREIGN KEY ("agent_id")
    REFERENCES public."agent_config"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_pipeline"
    ADD CONSTRAINT "crm_pipeline_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_pipeline"
    ADD CONSTRAINT "crm_pipeline_distribution_queue_id_fkey" FOREIGN KEY ("distribution_queue_id")
    REFERENCES public."crm_distribution_queues"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_queue_members"
    ADD CONSTRAINT "crm_queue_members_queue_id_fkey" FOREIGN KEY ("queue_id")
    REFERENCES public."crm_distribution_queues"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_queue_members"
    ADD CONSTRAINT "crm_queue_members_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES public."profiles"("user_id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_agent_id_fkey" FOREIGN KEY ("agent_id")
    REFERENCES public."agent_config"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_department_id_fkey" FOREIGN KEY ("department_id")
    REFERENCES public."department"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_distribution_queue_id_fkey" FOREIGN KEY ("distribution_queue_id")
    REFERENCES public."crm_distribution_queues"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_ia_handoff_stage_id_fkey" FOREIGN KEY ("ia_handoff_stage_id")
    REFERENCES public."crm_stage"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_move_apos_qualificar_para_fkey" FOREIGN KEY ("move_apos_qualificar_para")
    REFERENCES public."crm_stage"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_move_se_negativo_para_fkey" FOREIGN KEY ("move_se_negativo_para")
    REFERENCES public."crm_stage"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_move_se_positivo_para_fkey" FOREIGN KEY ("move_se_positivo_para")
    REFERENCES public."crm_stage"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_move_se_respondeu_para_fkey" FOREIGN KEY ("move_se_respondeu_para")
    REFERENCES public."crm_stage"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_move_se_sem_resposta_para_fkey" FOREIGN KEY ("move_se_sem_resposta_para")
    REFERENCES public."crm_stage"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_pipeline_id_fkey" FOREIGN KEY ("pipeline_id")
    REFERENCES public."crm_pipeline"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_retorno_pipeline_id_fkey" FOREIGN KEY ("retorno_pipeline_id")
    REFERENCES public."crm_pipeline"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_retorno_stage_id_fkey" FOREIGN KEY ("retorno_stage_id")
    REFERENCES public."crm_stage"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_stage"
    ADD CONSTRAINT "crm_stage_trigger_pipeline_destino_fkey" FOREIGN KEY ("trigger_pipeline_destino")
    REFERENCES public."crm_pipeline"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_venda"
    ADD CONSTRAINT "crm_venda_card_id_fkey" FOREIGN KEY ("card_id")
    REFERENCES public."crm_cards"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_venda"
    ADD CONSTRAINT "crm_venda_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_venda"
    ADD CONSTRAINT "crm_venda_fin_lancamento_id_fkey" FOREIGN KEY ("fin_lancamento_id")
    REFERENCES public."fin_lancamento"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_venda"
    ADD CONSTRAINT "crm_venda_pipeline_id_fkey" FOREIGN KEY ("pipeline_id")
    REFERENCES public."crm_pipeline"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."crm_venda"
    ADD CONSTRAINT "crm_venda_stage_id_fkey" FOREIGN KEY ("stage_id")
    REFERENCES public."crm_stage"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."csat_response"
    ADD CONSTRAINT "csat_response_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."department"
    ADD CONSTRAINT "department_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."department"
    ADD CONSTRAINT "department_pipeline_id_fkey" FOREIGN KEY ("pipeline_id")
    REFERENCES public."crm_pipeline"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."department_member"
    ADD CONSTRAINT "department_member_department_id_fkey" FOREIGN KEY ("department_id")
    REFERENCES public."department"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."department_menu_session"
    ADD CONSTRAINT "department_menu_session_agent_config_id_fkey" FOREIGN KEY ("agent_config_id")
    REFERENCES public."agent_config"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."department_menu_session"
    ADD CONSTRAINT "department_menu_session_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."department_menu_session"
    ADD CONSTRAINT "department_menu_session_department_id_fkey" FOREIGN KEY ("department_id")
    REFERENCES public."department"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."fin_categoria"
    ADD CONSTRAINT "fin_categoria_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."fin_lancamento"
    ADD CONSTRAINT "fin_lancamento_categoria_id_fkey" FOREIGN KEY ("categoria_id")
    REFERENCES public."fin_categoria"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."fin_lancamento"
    ADD CONSTRAINT "fin_lancamento_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."fin_lancamento"
    ADD CONSTRAINT "fin_lancamento_crm_card_id_fkey" FOREIGN KEY ("crm_card_id")
    REFERENCES public."crm_cards"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."fin_lancamento"
    ADD CONSTRAINT "fin_lancamento_venda_id_fkey" FOREIGN KEY ("venda_id")
    REFERENCES public."crm_venda"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."flow"
    ADD CONSTRAINT "flow_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."flow_run"
    ADD CONSTRAINT "flow_run_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."flow_run"
    ADD CONSTRAINT "flow_run_flow_id_fkey" FOREIGN KEY ("flow_id")
    REFERENCES public."flow"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."google_integration"
    ADD CONSTRAINT "google_integration_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."impersonation_log"
    ADD CONSTRAINT "impersonation_log_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."inbound_webhook"
    ADD CONSTRAINT "inbound_webhook_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."integracao_chave"
    ADD CONSTRAINT "integracao_chave_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."lead_evento"
    ADD CONSTRAINT "lead_evento_card_id_fkey" FOREIGN KEY ("card_id")
    REFERENCES public."crm_cards"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."lead_evento"
    ADD CONSTRAINT "lead_evento_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."lead_form"
    ADD CONSTRAINT "lead_form_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."lead_form_submission"
    ADD CONSTRAINT "lead_form_submission_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."lead_form_submission"
    ADD CONSTRAINT "lead_form_submission_form_id_fkey" FOREIGN KEY ("form_id")
    REFERENCES public."lead_form"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."lead_nota"
    ADD CONSTRAINT "lead_nota_card_id_fkey" FOREIGN KEY ("card_id")
    REFERENCES public."crm_cards"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."lead_nota"
    ADD CONSTRAINT "lead_nota_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."mensagem_agendada"
    ADD CONSTRAINT "mensagem_agendada_card_id_fkey" FOREIGN KEY ("card_id")
    REFERENCES public."crm_cards"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."mensagem_agendada"
    ADD CONSTRAINT "mensagem_agendada_catalogo_item_id_fkey" FOREIGN KEY ("catalogo_item_id")
    REFERENCES public."produto"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."mensagem_agendada"
    ADD CONSTRAINT "mensagem_agendada_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."mensagem_agendada"
    ADD CONSTRAINT "mensagem_agendada_parent_id_fkey" FOREIGN KEY ("parent_id")
    REFERENCES public."mensagem_agendada"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."mensagem_agendada"
    ADD CONSTRAINT "mensagem_agendada_servico_id_fkey" FOREIGN KEY ("servico_id")
    REFERENCES public."servico"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."mensagens"
    ADD CONSTRAINT "mensagens_reply_to_id_fkey" FOREIGN KEY ("reply_to_id")
    REFERENCES public."mensagens"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."message_hsm_template"
    ADD CONSTRAINT "message_hsm_template_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."message_hsm_template"
    ADD CONSTRAINT "message_hsm_template_instance_id_fkey" FOREIGN KEY ("instance_id")
    REFERENCES public."whatsapp_instances"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."message_template"
    ADD CONSTRAINT "message_template_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."notificacao"
    ADD CONSTRAINT "notificacao_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."olist_integration"
    ADD CONSTRAINT "olist_integration_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."parceiro_clique"
    ADD CONSTRAINT "parceiro_clique_parceiro_id_fkey" FOREIGN KEY ("parceiro_id")
    REFERENCES public."parceiro"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."parceiro_indicacao"
    ADD CONSTRAINT "parceiro_indicacao_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."parceiro_indicacao"
    ADD CONSTRAINT "parceiro_indicacao_parceiro_id_fkey" FOREIGN KEY ("parceiro_id")
    REFERENCES public."parceiro"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."parceiro_saque"
    ADD CONSTRAINT "parceiro_saque_parceiro_id_fkey" FOREIGN KEY ("parceiro_id")
    REFERENCES public."parceiro"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."plugin_banner"
    ADD CONSTRAINT "plugin_banner_plugin_id_fkey" FOREIGN KEY ("plugin_id")
    REFERENCES public."plugin"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."plugin_suggestion"
    ADD CONSTRAINT "plugin_suggestion_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."produto"
    ADD CONSTRAINT "produto_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."prospeccao_lead"
    ADD CONSTRAINT "prospeccao_lead_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."quick_reply"
    ADD CONSTRAINT "quick_reply_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."servico"
    ADD CONSTRAINT "servico_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."subscription"
    ADD CONSTRAINT "subscription_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."subscription"
    ADD CONSTRAINT "subscription_plan_id_fkey" FOREIGN KEY ("plan_id")
    REFERENCES public."plan"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."support_message"
    ADD CONSTRAINT "support_message_ticket_id_fkey" FOREIGN KEY ("ticket_id")
    REFERENCES public."support_ticket"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."support_note"
    ADD CONSTRAINT "support_note_ticket_id_fkey" FOREIGN KEY ("ticket_id")
    REFERENCES public."support_ticket"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."support_ticket"
    ADD CONSTRAINT "support_ticket_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."training_courses"
    ADD CONSTRAINT "training_courses_category_id_fkey" FOREIGN KEY ("category_id")
    REFERENCES public."training_categories"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."training_favorites"
    ADD CONSTRAINT "training_favorites_course_id_fkey" FOREIGN KEY ("course_id")
    REFERENCES public."training_courses"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."training_lessons"
    ADD CONSTRAINT "training_lessons_module_id_fkey" FOREIGN KEY ("module_id")
    REFERENCES public."training_modules"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."training_modules"
    ADD CONSTRAINT "training_modules_course_id_fkey" FOREIGN KEY ("course_id")
    REFERENCES public."training_courses"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."training_user_progress"
    ADD CONSTRAINT "training_user_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id")
    REFERENCES public."training_lessons"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."user_feedback"
    ADD CONSTRAINT "user_feedback_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."webhook_delivery_log"
    ADD CONSTRAINT "webhook_delivery_log_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."webhook_delivery_log"
    ADD CONSTRAINT "webhook_delivery_log_endpoint_id_fkey" FOREIGN KEY ("endpoint_id")
    REFERENCES public."webhook_endpoint"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public."webhook_endpoint"
    ADD CONSTRAINT "webhook_endpoint_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES public."company"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 5. RLS POLICIES (204 SECURITY POLICIES)
-- ============================================================
ALTER TABLE ONLY public."addon_product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."admin_automation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."admin_automation_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."admin_broadcast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."admin_broadcast_read" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agenda_bloqueio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agenda_disponibilidade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agenda_historico" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agenda_local" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agenda_participante" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agenda_recorrencia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agenda_tipo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agendamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agent_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."agent_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."ai_message_processing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."api_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."app_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."atendimento_live_analise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."atendimento_relatorio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."auth_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."billing_charge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."billing_charge_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."billing_event_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."campaign_blocklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."campaign_optout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."campaign_target" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company_addon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company_billing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company_plugin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company_role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company_user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company_user_instance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."company_user_pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."contact_pause" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."credit_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."crm_card_stage_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."crm_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."crm_distribution_queues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."crm_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."crm_pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."crm_queue_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."crm_stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."crm_venda" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."csat_response" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."dashboard_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."department_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."department_menu_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."email_send_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."email_send_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."email_unsubscribe_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."feature_flag_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."feature_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."fin_categoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."fin_lancamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."flow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."flow_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."google_integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."impersonation_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."inbound_webhook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."integracao_chave" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."lead_evento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."lead_form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."lead_form_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."lead_nota" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."lovable_credit_balance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."master_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."mensagem_agendada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."mensagens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."message_hsm_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."message_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."meta_oauth_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."notificacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."olist_integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."outbound_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."parceiro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."parceiro_clique" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."parceiro_indicacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."parceiro_saque" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."plugin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."plugin_banner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."plugin_suggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."produto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."prospeccao_lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."quick_reply" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."servico" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."signup_welcome_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."support_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."support_macro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."support_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."support_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."support_ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."suppressed_emails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."system_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."training_banners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."training_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."training_courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."training_favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."training_lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."training_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."training_user_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."user_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."webhook_delivery_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."webhook_endpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."webhook_errors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."whatsapp_grupo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public."whatsapp_instances" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addon_product_master_write" ON public."addon_product";
CREATE POLICY "addon_product_master_write" ON public."addon_product" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "addon_product_read_active" ON public."addon_product";
CREATE POLICY "addon_product_read_active" ON public."addon_product" FOR SELECT TO authenticated USING (((ativo = true) OR is_super_admin()));

DROP POLICY IF EXISTS "admin_automation_super" ON public."admin_automation";
CREATE POLICY "admin_automation_super" ON public."admin_automation" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "admin_automation_log_super" ON public."admin_automation_log";
CREATE POLICY "admin_automation_log_super" ON public."admin_automation_log" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "broadcast visible to targeted users" ON public."admin_broadcast";
CREATE POLICY "broadcast visible to targeted users" ON public."admin_broadcast" FOR SELECT TO authenticated USING ((is_super_admin() OR (target_type = 'all'::text) OR ((target_type = 'plan'::text) AND (EXISTS ( SELECT 1
   FROM (company_user cu
     JOIN company c ON ((c.id = cu.company_id)))
  WHERE ((cu.user_id = auth.uid()) AND (cu.ativo = true) AND (c.selected_plan_slug = admin_broadcast.target_value))))) OR ((target_type = 'status'::text) AND (EXISTS ( SELECT 1
   FROM (company_user cu
     JOIN company c ON ((c.id = cu.company_id)))
  WHERE ((cu.user_id = auth.uid()) AND (cu.ativo = true) AND (((admin_broadcast.target_value = 'trial'::text) AND (c.trial_ate IS NOT NULL) AND (c.trial_ate > now())) OR ((admin_broadcast.target_value = 'ativo'::text) AND ((c.trial_ate IS NULL) OR (c.trial_ate <= now()))))))))));

DROP POLICY IF EXISTS "super manages broadcast" ON public."admin_broadcast";
CREATE POLICY "super manages broadcast" ON public."admin_broadcast" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "user manages own read" ON public."admin_broadcast_read";
CREATE POLICY "user manages own read" ON public."admin_broadcast_read" FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "agenda_bloqueio company" ON public."agenda_bloqueio";
CREATE POLICY "agenda_bloqueio company" ON public."agenda_bloqueio" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "agenda_disp company" ON public."agenda_disponibilidade";
CREATE POLICY "agenda_disp company" ON public."agenda_disponibilidade" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "agenda_hist insert" ON public."agenda_historico";
CREATE POLICY "agenda_hist insert" ON public."agenda_historico" FOR INSERT TO authenticated WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "agenda_hist select" ON public."agenda_historico";
CREATE POLICY "agenda_hist select" ON public."agenda_historico" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "agenda_local por empresa" ON public."agenda_local";
CREATE POLICY "agenda_local por empresa" ON public."agenda_local" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "agenda_part company" ON public."agenda_participante";
CREATE POLICY "agenda_part company" ON public."agenda_participante" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "agenda_recorrencia company" ON public."agenda_recorrencia";
CREATE POLICY "agenda_recorrencia company" ON public."agenda_recorrencia" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "agenda_tipo company" ON public."agenda_tipo";
CREATE POLICY "agenda_tipo company" ON public."agenda_tipo" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "agendamento_access" ON public."agendamento";
CREATE POLICY "agendamento_access" ON public."agendamento" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "agent_config_delete_admins" ON public."agent_config";
CREATE POLICY "agent_config_delete_admins" ON public."agent_config" FOR DELETE TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "agent_config_insert_admins" ON public."agent_config";
CREATE POLICY "agent_config_insert_admins" ON public."agent_config" FOR INSERT TO authenticated WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "agent_config_select_members" ON public."agent_config";
CREATE POLICY "agent_config_select_members" ON public."agent_config" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "agent_config_update_admins" ON public."agent_config";
CREATE POLICY "agent_config_update_admins" ON public."agent_config" FOR UPDATE TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "agent_feedback company access" ON public."agent_feedback";
CREATE POLICY "agent_feedback company access" ON public."agent_feedback" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "No direct client access to AI processing locks" ON public."ai_message_processing";
CREATE POLICY "No direct client access to AI processing locks" ON public."ai_message_processing" FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Admins can manage announcements" ON public."announcements";
CREATE POLICY "Admins can manage announcements" ON public."announcements" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Anyone can view active announcements" ON public."announcements";
CREATE POLICY "Anyone can view active announcements" ON public."announcements" FOR SELECT TO public USING (((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now()))));

DROP POLICY IF EXISTS "api_token_owner_admin" ON public."api_token";
CREATE POLICY "api_token_owner_admin" ON public."api_token" FOR ALL TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "app_config_delete" ON public."app_config";
CREATE POLICY "app_config_delete" ON public."app_config" FOR DELETE TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "app_config_insert" ON public."app_config";
CREATE POLICY "app_config_insert" ON public."app_config" FOR INSERT TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "app_config_select" ON public."app_config";
CREATE POLICY "app_config_select" ON public."app_config" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "app_config_update" ON public."app_config";
CREATE POLICY "app_config_update" ON public."app_config" FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "live_analise_company_member" ON public."atendimento_live_analise";
CREATE POLICY "live_analise_company_member" ON public."atendimento_live_analise" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "atendimento_relatorio_insert_company" ON public."atendimento_relatorio";
CREATE POLICY "atendimento_relatorio_insert_company" ON public."atendimento_relatorio" FOR INSERT TO authenticated WITH CHECK ((has_company_access(company_id) AND (criado_por = auth.uid())));

DROP POLICY IF EXISTS "atendimento_relatorio_select_company" ON public."atendimento_relatorio";
CREATE POLICY "atendimento_relatorio_select_company" ON public."atendimento_relatorio" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "atendimento_relatorio_select_manager" ON public."atendimento_relatorio";
CREATE POLICY "atendimento_relatorio_select_manager" ON public."atendimento_relatorio" AS RESTRICTIVE FOR SELECT TO authenticated USING (can_manage_operational_reports(company_id));

DROP POLICY IF EXISTS "atendimento_relatorio_update_manager" ON public."atendimento_relatorio";
CREATE POLICY "atendimento_relatorio_update_manager" ON public."atendimento_relatorio" FOR UPDATE TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "audit_log owner/admin read" ON public."audit_log";
CREATE POLICY "audit_log owner/admin read" ON public."audit_log" FOR SELECT TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "audit_log super admin all" ON public."audit_log";
CREATE POLICY "audit_log super admin all" ON public."audit_log" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "auth_log read" ON public."auth_log";
CREATE POLICY "auth_log read" ON public."auth_log" FOR SELECT TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "charge_all_super_admin" ON public."billing_charge";
CREATE POLICY "charge_all_super_admin" ON public."billing_charge" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "charge_select_company_admin" ON public."billing_charge";
CREATE POLICY "charge_select_company_admin" ON public."billing_charge" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "charge_item_all_super_admin" ON public."billing_charge_item";
CREATE POLICY "charge_item_all_super_admin" ON public."billing_charge_item" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "charge_item_select_company_admin" ON public."billing_charge_item";
CREATE POLICY "charge_item_select_company_admin" ON public."billing_charge_item" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM billing_charge c
  WHERE ((c.id = billing_charge_item.charge_id) AND (is_super_admin() OR has_company_role(c.company_id, ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "billing_event_log super admin read" ON public."billing_event_log";
CREATE POLICY "billing_event_log super admin read" ON public."billing_event_log" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "billing_event_log_admin_read_only" ON public."billing_event_log";
CREATE POLICY "billing_event_log_admin_read_only" ON public."billing_event_log" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (is_super_admin()) WITH CHECK (false);

DROP POLICY IF EXISTS "campaign_company_access" ON public."campaign";
CREATE POLICY "campaign_company_access" ON public."campaign" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "blocklist_company_access" ON public."campaign_blocklist";
CREATE POLICY "blocklist_company_access" ON public."campaign_blocklist" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "optout_company_access" ON public."campaign_optout";
CREATE POLICY "optout_company_access" ON public."campaign_optout" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "campaign_target_company_access" ON public."campaign_target";
CREATE POLICY "campaign_target_company_access" ON public."campaign_target" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "company_delete" ON public."company";
CREATE POLICY "company_delete" ON public."company" FOR DELETE TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "company_insert" ON public."company";
CREATE POLICY "company_insert" ON public."company" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = created_by));

DROP POLICY IF EXISTS "company_select" ON public."company";
CREATE POLICY "company_select" ON public."company" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_access(id)));

DROP POLICY IF EXISTS "company_update" ON public."company";
CREATE POLICY "company_update" ON public."company" FOR UPDATE TO authenticated USING ((is_super_admin() OR has_company_access(id))) WITH CHECK ((is_super_admin() OR has_company_access(id)));

DROP POLICY IF EXISTS "company_addon_master_write" ON public."company_addon";
CREATE POLICY "company_addon_master_write" ON public."company_addon" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "company_addon_read_own" ON public."company_addon";
CREATE POLICY "company_addon_read_own" ON public."company_addon" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "billing_owner_admin_read" ON public."company_billing";
CREATE POLICY "billing_owner_admin_read" ON public."company_billing" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "billing_owner_admin_write" ON public."company_billing";
CREATE POLICY "billing_owner_admin_write" ON public."company_billing" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "company_plugin_admin_manage" ON public."company_plugin";
CREATE POLICY "company_plugin_admin_manage" ON public."company_plugin" FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM company_user m
  WHERE ((m.company_id = company_plugin.company_id) AND (m.user_id = auth.uid()) AND (m.ativo = true) AND (m.role = ANY (ARRAY['owner'::tenant_role, 'admin'::tenant_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM company_user m
  WHERE ((m.company_id = company_plugin.company_id) AND (m.user_id = auth.uid()) AND (m.ativo = true) AND (m.role = ANY (ARRAY['owner'::tenant_role, 'admin'::tenant_role]))))));

DROP POLICY IF EXISTS "company_plugin_member_read" ON public."company_plugin";
CREATE POLICY "company_plugin_member_read" ON public."company_plugin" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM company_user m
  WHERE ((m.company_id = company_plugin.company_id) AND (m.user_id = auth.uid()) AND (m.ativo = true)))));

DROP POLICY IF EXISTS "company_plugin_super_admin_all" ON public."company_plugin";
CREATE POLICY "company_plugin_super_admin_all" ON public."company_plugin" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "company_role manage" ON public."company_role";
CREATE POLICY "company_role manage" ON public."company_role" FOR ALL TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "company_role read" ON public."company_role";
CREATE POLICY "company_role read" ON public."company_role" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "company members manage tags" ON public."company_tag";
CREATE POLICY "company members manage tags" ON public."company_tag" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "company_user_delete" ON public."company_user";
CREATE POLICY "company_user_delete" ON public."company_user" FOR DELETE TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "company_user_insert" ON public."company_user";
CREATE POLICY "company_user_insert" ON public."company_user" FOR INSERT TO authenticated WITH CHECK ((is_super_admin() OR (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]) AND (((role)::text <> 'owner'::text) OR has_company_role(company_id, ARRAY['owner'::text])) AND can_assign_custom_role(company_id, custom_role_id))));

DROP POLICY IF EXISTS "company_user_select" ON public."company_user";
CREATE POLICY "company_user_select" ON public."company_user" FOR SELECT TO authenticated USING ((is_super_admin() OR (user_id = auth.uid()) OR has_company_access(company_id)));

DROP POLICY IF EXISTS "company_user_update" ON public."company_user";
CREATE POLICY "company_user_update" ON public."company_user" FOR UPDATE TO authenticated USING ((is_super_admin() OR (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]) AND (user_id <> auth.uid())))) WITH CHECK ((is_super_admin() OR (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]) AND (user_id <> auth.uid()) AND (((role)::text <> 'owner'::text) OR has_company_role(company_id, ARRAY['owner'::text])) AND can_assign_custom_role(company_id, custom_role_id))));

DROP POLICY IF EXISTS "company_user_instance_read" ON public."company_user_instance";
CREATE POLICY "company_user_instance_read" ON public."company_user_instance" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "cui manage" ON public."company_user_instance";
CREATE POLICY "cui manage" ON public."company_user_instance" FOR ALL TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "members read company pipeline access" ON public."company_user_pipeline";
CREATE POLICY "members read company pipeline access" ON public."company_user_pipeline" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "contact_pause_access" ON public."contact_pause";
CREATE POLICY "contact_pause_access" ON public."contact_pause" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "ledger company members read" ON public."credit_ledger";
CREATE POLICY "ledger company members read" ON public."credit_ledger" FOR SELECT TO authenticated USING ((has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]) OR is_super_admin()));

DROP POLICY IF EXISTS "stage history por empresa (insert)" ON public."crm_card_stage_history";
CREATE POLICY "stage history por empresa (insert)" ON public."crm_card_stage_history" FOR INSERT TO authenticated WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "stage history por empresa (select)" ON public."crm_card_stage_history";
CREATE POLICY "stage history por empresa (select)" ON public."crm_card_stage_history" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "crm_cards_delete" ON public."crm_cards";
CREATE POLICY "crm_cards_delete" ON public."crm_cards" FOR DELETE TO authenticated USING (((is_super_admin() OR has_company_access(company_id)) AND company_write_allowed(company_id)));

DROP POLICY IF EXISTS "crm_cards_insert" ON public."crm_cards";
CREATE POLICY "crm_cards_insert" ON public."crm_cards" FOR INSERT TO authenticated WITH CHECK (((is_super_admin() OR has_company_access(company_id)) AND company_write_allowed(company_id)));

DROP POLICY IF EXISTS "crm_cards_select" ON public."crm_cards";
CREATE POLICY "crm_cards_select" ON public."crm_cards" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "crm_cards_update" ON public."crm_cards";
CREATE POLICY "crm_cards_update" ON public."crm_cards" FOR UPDATE TO authenticated USING (((is_super_admin() OR has_company_access(company_id)) AND company_write_allowed(company_id))) WITH CHECK (((is_super_admin() OR has_company_access(company_id)) AND company_write_allowed(company_id)));

DROP POLICY IF EXISTS "queues_company_access" ON public."crm_distribution_queues";
CREATE POLICY "queues_company_access" ON public."crm_distribution_queues" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "Admins can manage company goals" ON public."crm_goals";
CREATE POLICY "Admins can manage company goals" ON public."crm_goals" FOR ALL TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "Members can view company goals" ON public."crm_goals";
CREATE POLICY "Members can view company goals" ON public."crm_goals" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "pipeline_company_access" ON public."crm_pipeline";
CREATE POLICY "pipeline_company_access" ON public."crm_pipeline" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "members_company_scope" ON public."crm_queue_members";
CREATE POLICY "members_company_scope" ON public."crm_queue_members" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK ((has_company_access(company_id) AND (EXISTS ( SELECT 1
   FROM crm_distribution_queues q
  WHERE ((q.id = crm_queue_members.queue_id) AND (q.company_id = crm_queue_members.company_id))))));

DROP POLICY IF EXISTS "crm_stage_delete" ON public."crm_stage";
CREATE POLICY "crm_stage_delete" ON public."crm_stage" FOR DELETE TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "crm_stage_insert" ON public."crm_stage";
CREATE POLICY "crm_stage_insert" ON public."crm_stage" FOR INSERT TO authenticated WITH CHECK ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "crm_stage_select" ON public."crm_stage";
CREATE POLICY "crm_stage_select" ON public."crm_stage" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "crm_stage_update" ON public."crm_stage";
CREATE POLICY "crm_stage_update" ON public."crm_stage" FOR UPDATE TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "crm_venda_access" ON public."crm_venda";
CREATE POLICY "crm_venda_access" ON public."crm_venda" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "csat_company_access" ON public."csat_response";
CREATE POLICY "csat_company_access" ON public."csat_response" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "own prefs delete" ON public."dashboard_preferences";
CREATE POLICY "own prefs delete" ON public."dashboard_preferences" FOR DELETE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "own prefs insert" ON public."dashboard_preferences";
CREATE POLICY "own prefs insert" ON public."dashboard_preferences" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "own prefs read" ON public."dashboard_preferences";
CREATE POLICY "own prefs read" ON public."dashboard_preferences" FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "own prefs update" ON public."dashboard_preferences";
CREATE POLICY "own prefs update" ON public."dashboard_preferences" FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "dept_company_access" ON public."department";
CREATE POLICY "dept_company_access" ON public."department" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "dept_member_access" ON public."department_member";
CREATE POLICY "dept_member_access" ON public."department_member" FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM department d
  WHERE ((d.id = department_member.department_id) AND has_company_access(d.company_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM department d
  WHERE ((d.id = department_member.department_id) AND has_company_access(d.company_id)))));

DROP POLICY IF EXISTS "department_menu_session_select_members" ON public."department_menu_session";
CREATE POLICY "department_menu_session_select_members" ON public."department_menu_session" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "Service role can insert send log" ON public."email_send_log";
CREATE POLICY "Service role can insert send log" ON public."email_send_log" FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can read send log" ON public."email_send_log";
CREATE POLICY "Service role can read send log" ON public."email_send_log" FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can update send log" ON public."email_send_log";
CREATE POLICY "Service role can update send log" ON public."email_send_log" FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "email_send_log_deny_clients" ON public."email_send_log";
CREATE POLICY "email_send_log_deny_clients" ON public."email_send_log" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service role can manage send state" ON public."email_send_state";
CREATE POLICY "Service role can manage send state" ON public."email_send_state" FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public."email_unsubscribe_tokens";
CREATE POLICY "Service role can insert tokens" ON public."email_unsubscribe_tokens" FOR INSERT TO public WITH CHECK ((auth.role() = 'service_role'::text));

DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public."email_unsubscribe_tokens";
CREATE POLICY "Service role can mark tokens as used" ON public."email_unsubscribe_tokens" FOR UPDATE TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

DROP POLICY IF EXISTS "Service role can read tokens" ON public."email_unsubscribe_tokens";
CREATE POLICY "Service role can read tokens" ON public."email_unsubscribe_tokens" FOR SELECT TO public USING ((auth.role() = 'service_role'::text));

DROP POLICY IF EXISTS "deny anon on unsubscribe tokens" ON public."email_unsubscribe_tokens";
CREATE POLICY "deny anon on unsubscribe tokens" ON public."email_unsubscribe_tokens" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_role manages unsubscribe tokens" ON public."email_unsubscribe_tokens";
CREATE POLICY "service_role manages unsubscribe tokens" ON public."email_unsubscribe_tokens" FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "super admin read audit" ON public."feature_flag_audit";
CREATE POLICY "super admin read audit" ON public."feature_flag_audit" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "super admin write audit" ON public."feature_flag_audit";
CREATE POLICY "super admin write audit" ON public."feature_flag_audit" FOR INSERT TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super admin manage flags" ON public."feature_flags";
CREATE POLICY "super admin manage flags" ON public."feature_flags" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "super admin read flags" ON public."feature_flags";
CREATE POLICY "super admin read flags" ON public."feature_flags" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "fin_categoria_access" ON public."fin_categoria";
CREATE POLICY "fin_categoria_access" ON public."fin_categoria" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "fin_lancamento_access" ON public."fin_lancamento";
CREATE POLICY "fin_lancamento_access" ON public."fin_lancamento" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "flow_tenant_access" ON public."flow";
CREATE POLICY "flow_tenant_access" ON public."flow" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "flow_run_tenant_access" ON public."flow_run";
CREATE POLICY "flow_run_tenant_access" ON public."flow_run" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "google_integration_owner_admin" ON public."google_integration";
CREATE POLICY "google_integration_owner_admin" ON public."google_integration" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "impersonation_log super admin insert" ON public."impersonation_log";
CREATE POLICY "impersonation_log super admin insert" ON public."impersonation_log" FOR INSERT TO authenticated WITH CHECK ((is_super_admin() AND (admin_user_id = auth.uid())));

DROP POLICY IF EXISTS "impersonation_log super admin read" ON public."impersonation_log";
CREATE POLICY "impersonation_log super admin read" ON public."impersonation_log" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "impersonation_log super admin update" ON public."impersonation_log";
CREATE POLICY "impersonation_log super admin update" ON public."impersonation_log" FOR UPDATE TO authenticated USING ((is_super_admin() AND (admin_user_id = auth.uid())));

DROP POLICY IF EXISTS "inbound_webhook_delete" ON public."inbound_webhook";
CREATE POLICY "inbound_webhook_delete" ON public."inbound_webhook" FOR DELETE TO authenticated USING ((company_id IN ( SELECT company_user.company_id
   FROM company_user
  WHERE ((company_user.user_id = auth.uid()) AND company_user.ativo))));

DROP POLICY IF EXISTS "inbound_webhook_insert" ON public."inbound_webhook";
CREATE POLICY "inbound_webhook_insert" ON public."inbound_webhook" FOR INSERT TO authenticated WITH CHECK ((company_id IN ( SELECT company_user.company_id
   FROM company_user
  WHERE ((company_user.user_id = auth.uid()) AND company_user.ativo))));

DROP POLICY IF EXISTS "inbound_webhook_select" ON public."inbound_webhook";
CREATE POLICY "inbound_webhook_select" ON public."inbound_webhook" FOR SELECT TO authenticated USING ((company_id IN ( SELECT company_user.company_id
   FROM company_user
  WHERE ((company_user.user_id = auth.uid()) AND company_user.ativo))));

DROP POLICY IF EXISTS "inbound_webhook_update" ON public."inbound_webhook";
CREATE POLICY "inbound_webhook_update" ON public."inbound_webhook" FOR UPDATE TO authenticated USING ((company_id IN ( SELECT company_user.company_id
   FROM company_user
  WHERE ((company_user.user_id = auth.uid()) AND company_user.ativo))));

DROP POLICY IF EXISTS "integracao_chave por empresa" ON public."integracao_chave";
CREATE POLICY "integracao_chave por empresa" ON public."integracao_chave" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "lead_evento_access" ON public."lead_evento";
CREATE POLICY "lead_evento_access" ON public."lead_evento" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "lead_form tenant" ON public."lead_form";
CREATE POLICY "lead_form tenant" ON public."lead_form" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "lead_form_submission tenant" ON public."lead_form_submission";
CREATE POLICY "lead_form_submission tenant" ON public."lead_form_submission" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "lead_nota_access" ON public."lead_nota";
CREATE POLICY "lead_nota_access" ON public."lead_nota" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "Super admins can do everything on lovable_credit_balance" ON public."lovable_credit_balance";
CREATE POLICY "Super admins can do everything on lovable_credit_balance" ON public."lovable_credit_balance" FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can manage master settings" ON public."master_settings";
CREATE POLICY "Super admins can manage master settings" ON public."master_settings" FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "company members manage agendamentos" ON public."mensagem_agendada";
CREATE POLICY "company members manage agendamentos" ON public."mensagem_agendada" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "empresa acessa agendamentos" ON public."mensagem_agendada";
CREATE POLICY "empresa acessa agendamentos" ON public."mensagem_agendada" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "mensagens_access" ON public."mensagens";
CREATE POLICY "mensagens_access" ON public."mensagens" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "hsm_template_delete" ON public."message_hsm_template";
CREATE POLICY "hsm_template_delete" ON public."message_hsm_template" FOR DELETE TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "hsm_template_insert" ON public."message_hsm_template";
CREATE POLICY "hsm_template_insert" ON public."message_hsm_template" FOR INSERT TO authenticated WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "hsm_template_select" ON public."message_hsm_template";
CREATE POLICY "hsm_template_select" ON public."message_hsm_template" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "hsm_template_update" ON public."message_hsm_template";
CREATE POLICY "hsm_template_update" ON public."message_hsm_template" FOR UPDATE TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "members manage templates" ON public."message_template";
CREATE POLICY "members manage templates" ON public."message_template" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "members read templates" ON public."message_template";
CREATE POLICY "members read templates" ON public."message_template" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "meta_oauth_session deny client access" ON public."meta_oauth_session";
CREATE POLICY "meta_oauth_session deny client access" ON public."meta_oauth_session" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "meta_oauth_session service role only" ON public."meta_oauth_session";
CREATE POLICY "meta_oauth_session service role only" ON public."meta_oauth_session" FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "notificacao_delete" ON public."notificacao";
CREATE POLICY "notificacao_delete" ON public."notificacao" FOR DELETE TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "notificacao_select" ON public."notificacao";
CREATE POLICY "notificacao_select" ON public."notificacao" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "notificacao_update" ON public."notificacao";
CREATE POLICY "notificacao_update" ON public."notificacao" FOR UPDATE TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "olist by company" ON public."olist_integration";
CREATE POLICY "olist by company" ON public."olist_integration" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "company members can view own queue" ON public."outbound_queue";
CREATE POLICY "company members can view own queue" ON public."outbound_queue" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "Parceiros podem ver seus próprios dados" ON public."parceiro";
CREATE POLICY "Parceiros podem ver seus próprios dados" ON public."parceiro" FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "clique_select_owner_or_admin" ON public."parceiro_clique";
CREATE POLICY "clique_select_owner_or_admin" ON public."parceiro_clique" FOR SELECT TO authenticated USING ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM parceiro p
  WHERE ((p.id = parceiro_clique.parceiro_id) AND (p.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Parceiros podem ver suas indicações" ON public."parceiro_indicacao";
CREATE POLICY "Parceiros podem ver suas indicações" ON public."parceiro_indicacao" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM parceiro
  WHERE ((parceiro.id = parceiro_indicacao.parceiro_id) AND (parceiro.user_id = auth.uid())))));

DROP POLICY IF EXISTS "Parceiros podem ver seus saques" ON public."parceiro_saque";
CREATE POLICY "Parceiros podem ver seus saques" ON public."parceiro_saque" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM parceiro
  WHERE ((parceiro.id = parceiro_saque.parceiro_id) AND (parceiro.user_id = auth.uid())))));

DROP POLICY IF EXISTS "plans authenticated read active" ON public."plan";
CREATE POLICY "plans authenticated read active" ON public."plan" FOR SELECT TO authenticated USING (((ativo = true) OR is_super_admin()));

DROP POLICY IF EXISTS "plans public read active" ON public."plan";
CREATE POLICY "plans public read active" ON public."plan" FOR SELECT TO anon USING ((ativo = true));

DROP POLICY IF EXISTS "plans super admin write" ON public."plan";
CREATE POLICY "plans super admin write" ON public."plan" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "plugin_read_installed" ON public."plugin";
CREATE POLICY "plugin_read_installed" ON public."plugin" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM company_plugin cp
  WHERE ((cp.plugin_id = plugin.id) AND (cp.company_id = current_company_id()) AND (cp.instalado = true)))));

DROP POLICY IF EXISTS "plugin_read_visible" ON public."plugin";
CREATE POLICY "plugin_read_visible" ON public."plugin" FOR SELECT TO authenticated USING (((visivel_para_clientes = true) AND (status <> 'descontinuado'::text)));

DROP POLICY IF EXISTS "plugin_super_admin_all" ON public."plugin";
CREATE POLICY "plugin_super_admin_all" ON public."plugin" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "plugin_banner_admin_all" ON public."plugin_banner";
CREATE POLICY "plugin_banner_admin_all" ON public."plugin_banner" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "plugin_banner_select_authenticated" ON public."plugin_banner";
CREATE POLICY "plugin_banner_select_authenticated" ON public."plugin_banner" FOR SELECT TO authenticated USING ((ativo OR is_super_admin()));

DROP POLICY IF EXISTS "Admins can manage all suggestions" ON public."plugin_suggestion";
CREATE POLICY "Admins can manage all suggestions" ON public."plugin_suggestion" FOR ALL TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "Users can insert their own suggestions" ON public."plugin_suggestion";
CREATE POLICY "Users can insert their own suggestions" ON public."plugin_suggestion" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view their own suggestions" ON public."plugin_suggestion";
CREATE POLICY "Users can view their own suggestions" ON public."plugin_suggestion" FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR is_super_admin()));

DROP POLICY IF EXISTS "produto_access" ON public."produto";
CREATE POLICY "produto_access" ON public."produto" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "Super admins can delete profiles" ON public."profiles";
CREATE POLICY "Super admins can delete profiles" ON public."profiles" FOR DELETE TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "profiles_company_admin_select" ON public."profiles";
CREATE POLICY "profiles_company_admin_select" ON public."profiles" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (company_user me
     JOIN company_user target ON ((target.company_id = me.company_id)))
  WHERE ((me.user_id = auth.uid()) AND (me.ativo = true) AND (me.role = ANY (ARRAY['owner'::tenant_role, 'admin'::tenant_role])) AND (target.user_id = profiles.user_id) AND (target.ativo = true)))));

DROP POLICY IF EXISTS "profiles_insert" ON public."profiles";
CREATE POLICY "profiles_insert" ON public."profiles" FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "profiles_select" ON public."profiles";
CREATE POLICY "profiles_select" ON public."profiles" FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_super_admin()));

DROP POLICY IF EXISTS "profiles_update" ON public."profiles";
CREATE POLICY "profiles_update" ON public."profiles" FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "prospeccao por empresa" ON public."prospeccao_lead";
CREATE POLICY "prospeccao por empresa" ON public."prospeccao_lead" FOR ALL TO authenticated USING ((is_super_admin() OR (company_id = current_company_id()))) WITH CHECK ((is_super_admin() OR (company_id = current_company_id())));

DROP POLICY IF EXISTS "quick_reply_company_access" ON public."quick_reply";
CREATE POLICY "quick_reply_company_access" ON public."quick_reply" FOR ALL TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "servico company access" ON public."servico";
CREATE POLICY "servico company access" ON public."servico" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "super admin le logs de boas-vindas" ON public."signup_welcome_log";
CREATE POLICY "super admin le logs de boas-vindas" ON public."signup_welcome_log" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "subscription owner update" ON public."subscription";
CREATE POLICY "subscription owner update" ON public."subscription" FOR UPDATE TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "subscription super admin write" ON public."subscription";
CREATE POLICY "subscription super admin write" ON public."subscription" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "subscription_owner_admin_read" ON public."subscription";
CREATE POLICY "subscription_owner_admin_read" ON public."subscription" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "super admin manage support config" ON public."support_config";
CREATE POLICY "super admin manage support config" ON public."support_config" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "support config admin read" ON public."support_config";
CREATE POLICY "support config admin read" ON public."support_config" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "super admin manage macros" ON public."support_macro";
CREATE POLICY "super admin manage macros" ON public."support_macro" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Users insert messages in accessible tickets" ON public."support_message";
CREATE POLICY "Users insert messages in accessible tickets" ON public."support_message" FOR INSERT TO authenticated WITH CHECK ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM support_ticket t
  WHERE ((t.id = support_message.ticket_id) AND has_company_access(t.company_id))))));

DROP POLICY IF EXISTS "Users read messages of accessible tickets" ON public."support_message";
CREATE POLICY "Users read messages of accessible tickets" ON public."support_message" FOR SELECT TO authenticated USING ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM support_ticket t
  WHERE ((t.id = support_message.ticket_id) AND has_company_access(t.company_id))))));

DROP POLICY IF EXISTS "super admin manage support notes" ON public."support_note";
CREATE POLICY "super admin manage support notes" ON public."support_note" FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Users create tickets in their company" ON public."support_ticket";
CREATE POLICY "Users create tickets in their company" ON public."support_ticket" FOR INSERT TO authenticated WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "Users read tickets of their company" ON public."support_ticket";
CREATE POLICY "Users read tickets of their company" ON public."support_ticket" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "Users update tickets of their company" ON public."support_ticket";
CREATE POLICY "Users update tickets of their company" ON public."support_ticket" FOR UPDATE TO authenticated USING ((is_super_admin() OR has_company_access(company_id))) WITH CHECK ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public."suppressed_emails";
CREATE POLICY "Service role can insert suppressed emails" ON public."suppressed_emails" FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public."suppressed_emails";
CREATE POLICY "Service role can read suppressed emails" ON public."suppressed_emails" FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "suppressed_emails_deny_clients" ON public."suppressed_emails";
CREATE POLICY "suppressed_emails_deny_clients" ON public."suppressed_emails" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "super admin le alertas" ON public."system_alerts";
CREATE POLICY "super admin le alertas" ON public."system_alerts" FOR SELECT TO authenticated USING ((is_super_admin() OR ((company_id IS NOT NULL) AND has_company_access(company_id))));

DROP POLICY IF EXISTS "super admin resolve alertas" ON public."system_alerts";
CREATE POLICY "super admin resolve alertas" ON public."system_alerts" FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Allow read active banners to authenticated" ON public."training_banners";
CREATE POLICY "Allow read active banners to authenticated" ON public."training_banners" FOR SELECT TO authenticated USING ((is_active = true));

DROP POLICY IF EXISTS "Public read training categories" ON public."training_categories";
CREATE POLICY "Public read training categories" ON public."training_categories" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read training courses" ON public."training_courses";
CREATE POLICY "Public read training courses" ON public."training_courses" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can manage their favorites" ON public."training_favorites";
CREATE POLICY "Users can manage their favorites" ON public."training_favorites" FOR ALL TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Public read training lessons" ON public."training_lessons";
CREATE POLICY "Public read training lessons" ON public."training_lessons" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read training modules" ON public."training_modules";
CREATE POLICY "Public read training modules" ON public."training_modules" FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can manage their own progress" ON public."training_user_progress";
CREATE POLICY "Users can manage their own progress" ON public."training_user_progress" FOR ALL TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "super updates feedback" ON public."user_feedback";
CREATE POLICY "super updates feedback" ON public."user_feedback" FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "user creates own feedback" ON public."user_feedback";
CREATE POLICY "user creates own feedback" ON public."user_feedback" FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "user reads own feedback" ON public."user_feedback";
CREATE POLICY "user reads own feedback" ON public."user_feedback" FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_super_admin()));

DROP POLICY IF EXISTS "user_roles_select" ON public."user_roles";
CREATE POLICY "user_roles_select" ON public."user_roles" FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_super_admin()));

DROP POLICY IF EXISTS "webhook_log_company_read" ON public."webhook_delivery_log";
CREATE POLICY "webhook_log_company_read" ON public."webhook_delivery_log" FOR SELECT TO authenticated USING (has_company_access(company_id));

DROP POLICY IF EXISTS "webhook_endpoint_owner_admin" ON public."webhook_endpoint";
CREATE POLICY "webhook_endpoint_owner_admin" ON public."webhook_endpoint" FOR ALL TO authenticated USING (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "super admin le erros webhook" ON public."webhook_errors";
CREATE POLICY "super admin le erros webhook" ON public."webhook_errors" FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "grupo_company_access" ON public."whatsapp_grupo";
CREATE POLICY "grupo_company_access" ON public."whatsapp_grupo" FOR ALL TO authenticated USING (has_company_access(company_id)) WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "whatsapp_instances_delete_access" ON public."whatsapp_instances";
CREATE POLICY "whatsapp_instances_delete_access" ON public."whatsapp_instances" FOR DELETE TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "whatsapp_instances_insert_access" ON public."whatsapp_instances";
CREATE POLICY "whatsapp_instances_insert_access" ON public."whatsapp_instances" FOR INSERT TO authenticated WITH CHECK ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS "whatsapp_instances_read_access" ON public."whatsapp_instances";
CREATE POLICY "whatsapp_instances_read_access" ON public."whatsapp_instances" FOR SELECT TO authenticated USING ((is_super_admin() OR has_company_access(company_id)));

DROP POLICY IF EXISTS "whatsapp_instances_update_access" ON public."whatsapp_instances";
CREATE POLICY "whatsapp_instances_update_access" ON public."whatsapp_instances" FOR UPDATE TO authenticated USING ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
