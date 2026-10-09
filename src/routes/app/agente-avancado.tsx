import { createFileRoute, redirect, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ensureSession, mensagemErroSessao } from "@/lib/ensure-session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { Bot, Loader2, Save, Send, Sparkles, Plus, Trash2, Calendar, CheckCircle2, AlertCircle, LinkIcon, ArrowLeft, Share2 } from "lucide-react";
import { brand } from "@/config/brand";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { testAiReply } from "@/lib/evolution.functions";
import { startGoogleOAuth, disconnectGoogle } from "@/lib/google.functions";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { saveDepartmentMenu } from "@/lib/department-menu.functions";
import { useCapacidadeAtiva } from "@/hooks/use-capacidades";

const searchSchema = z.object({
  id: z.string().optional(),
});

export const Route = createFileRoute("/app/agente-avancado")({
  head: () => ({ meta: [{ title: `${brand.name} — Agente IA` }] }),
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: ({ context }: any) => {
    const r = context?.membership?.role;
    if (r === "atendente") throw redirect({ to: "/app/dashboard" });
  },
  component: AgentePage,
});


const DEFAULTS: any = {
  ai_provider: "openai", ai_model: "gpt-4o-mini",
  nome_agente: "Atendente Virtual", nome_empresa: "",
  papel_objetivo: "Atender clientes, descobrir o que precisam, recomendar com sentido e ajudar a fechar a venda.",
  estilo_comunicacao: "Humano, simpático, consultivo e direto.",
  sobre_empresa: "", produtos_servicos: "", pode_fazer: "",
  nao_pode_fazer: "Inventar preço, prazo ou política que não está no prompt.",
  telefone_transferencia: "", palavra_pausar: "/pausar", palavra_despausar: "/despausar",
  segundos_buffer: 3, responder_em_partes: true,
  segmento: "", descricao_negocio: "", diferenciais: "", publico_alvo: "", regiao_horario: "",
  ofertas: "", cupom: "", como_vender: "", objecoes: "", formas_pagamento: "", ticket_medio: "",
  faq: "", politicas: "", posvenda_msg: "", pedir_avaliacao: false, reativar_cliente: false,
  tom: 70, formalidade: 40, usar_emojis: true, tamanho_resposta: "curtas", apresentacao: "",
  personalidade: "padrao", foco_atendimento: "ambos", emoji_intensidade: "pouco",
  usar_girias: false, chamar_por_nome: true, perguntar_uma_por_vez: true,
  pode_brincar: false, assinar_mensagens: false, proatividade: 50,
  velocidade_resposta: "humana", evitar_palavras: "", idioma: "pt-BR",
  agendamento_ativo: false, servicos_agendaveis: "", duracao_padrao: "30 min",
  horarios_disponiveis: "", antecedencia_min: "2 horas",
  regras_rigidas: "", exemplos_few_shot: [],
  menu_setores_ativo: false, menu_setores_texto: "", menu_setores_opcoes: [],
  olist_catalogo: false, olist_pedido_auto: false,
};


const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
  gemini: [
    { value: "google/gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (rápido — experimental)" },
    { value: "google/gemini-1.5-flash", label: "Gemini 1.5 Flash (estável)" },
    { value: "google/gemini-1.5-pro", label: "Gemini 1.5 Pro (inteligente)" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini (rápido e barato)" },
    { value: "gpt-4o", label: "GPT-4o (premium)" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  anthropic: [
    { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (rápido)" },
    { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet (premium)" },
  ],
};

const BUFFER_PRESETS = [3, 5, 10, 20, 30];

interface PersonalidadePreset {
  value: string;
  label: string;
  emoji: string;
  desc: string;
  tom: number;
  formalidade: number;
  emoji_intensidade: string;
  usar_girias: boolean;
  pode_brincar: boolean;
  proatividade: number;
}

const PERSONALIDADE_PRESETS: PersonalidadePreset[] = [
  { value: "padrao",       label: "Padrão",       emoji: "🤝", desc: "Equilibrado — simpático e profissional.",      tom: 65, formalidade: 45, emoji_intensidade: "pouco",    usar_girias: false, pode_brincar: false, proatividade: 50 },
  { value: "extrovertido", label: "Extrovertido", emoji: "🎉", desc: "Animado, vibrante, transmite energia.",          tom: 90, formalidade: 25, emoji_intensidade: "moderado", usar_girias: true,  pode_brincar: true,  proatividade: 75 },
  { value: "serio",        label: "Sério",        emoji: "🎩", desc: "Profissional, objetivo, direto ao ponto.",       tom: 25, formalidade: 75, emoji_intensidade: "nenhum",   usar_girias: false, pode_brincar: false, proatividade: 40 },
  { value: "divertido",    label: "Divertido",    emoji: "😄", desc: "Leve, bem-humorado, brincalhão sem perder foco.",tom: 85, formalidade: 20, emoji_intensidade: "muito",    usar_girias: true,  pode_brincar: true,  proatividade: 65 },
  { value: "consultivo",   label: "Consultivo",   emoji: "🧠", desc: "Especialista, recomenda com fundamento.",         tom: 55, formalidade: 60, emoji_intensidade: "pouco",    usar_girias: false, pode_brincar: false, proatividade: 70 },
  { value: "amigavel",     label: "Amigável",     emoji: "🫶", desc: "Acolhedor, próximo, como um amigo prestativo.",   tom: 80, formalidade: 30, emoji_intensidade: "moderado", usar_girias: false, pode_brincar: false, proatividade: 55 },
];

function applyPreset(p: PersonalidadePreset, cfg: any, setCfg: (fn: any) => void) {
  setCfg({
    ...cfg,
    personalidade: p.value,
    tom: p.tom,
    formalidade: p.formalidade,
    emoji_intensidade: p.emoji_intensidade,
    usar_emojis: p.emoji_intensidade !== "nenhum",
    usar_girias: p.usar_girias,
    pode_brincar: p.pode_brincar,
    proatividade: p.proatividade,
  });
}


interface Produto { id: string; nome: string; preco: number; descricao: string | null; ativo: boolean; ordem: number; }
interface Department { id: string; nome: string; }
interface DepartmentMenuOption { numero: string; department_id: string; label: string; }

function AgentePage() {
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id;
  const { id: agentId } = useSearch({ from: "/app/agente-avancado" });
  const test = useServerFn(testAiReply);
  const saveMenu = useServerFn(saveDepartmentMenu);

  const gStart = useServerFn(startGoogleOAuth);
  const gDisc = useServerFn(disconnectGoogle);
  const plan = usePlanFeatures();
  const allowOpenAI = plan.features.providersIA.includes("openai");
  const allowAnthropic = plan.features.providersIA.includes("anthropic");
  const allowGoogleCal = plan.features.googleCalendar;
  const [cfg, setCfg] = useState<any>(DEFAULTS);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [google, setGoogle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const olistAtivo = useCapacidadeAtiva("olist");
  const [testMsg, setTestMsg] = useState("Oi, vocês entregam aqui?");
  const [testReply, setTestReply] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  async function reload() {
    if (!companyId) return;
    setLoading(true);

    const query = supabase.from("agent_config").select("*");
    if (agentId) {
      query.eq("id", agentId);
    } else {
      query.eq("company_id", companyId).eq("is_default", true);
    }

    const [{ data: c }, { data: p }, { data: g }, { data: d }] = await Promise.all([
      query.maybeSingle(),
      supabase.from("produto").select("*").eq("company_id", companyId).order("ordem", { ascending: true }),
      supabase.from("google_integration").select("company_id,email,conectado,calendar_id,expiry,updated_at").eq("company_id", companyId).maybeSingle(),
      supabase.from("department").select("id,nome").eq("company_id", companyId).eq("ativo", true).order("nome"),
    ]);
    if (c) setCfg({ ...DEFAULTS, ...c });
    setProdutos((p ?? []) as Produto[]);
    setGoogle(g);
    setDepartments((d ?? []) as Department[]);
    setLoading(false);
  }

  useEffect(() => { void reload(); }, [companyId, agentId]);

  function up(k: string, v: any) { setCfg((p: any) => ({ ...p, [k]: v })); }

  function updateMenuOption(index: number, patch: Partial<DepartmentMenuOption>) {
    const current = (Array.isArray(cfg.menu_setores_opcoes) ? cfg.menu_setores_opcoes : []) as DepartmentMenuOption[];
    up("menu_setores_opcoes", current.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option));
  }

  function addMenuOption() {
    const current = (Array.isArray(cfg.menu_setores_opcoes) ? cfg.menu_setores_opcoes : []) as DepartmentMenuOption[];
    const department = departments.find((item) => !current.some((option) => option.department_id === item.id));
    if (!department) return toast.error("Cadastre ou libere outro setor para adicionar uma opção.");
    const nextNumber = String(current.length + 1);
    up("menu_setores_opcoes", [...current, { numero: nextNumber, department_id: department.id, label: department.nome }]);
  }

  function removeMenuOption(index: number) {
    const current = (Array.isArray(cfg.menu_setores_opcoes) ? cfg.menu_setores_opcoes : []) as DepartmentMenuOption[];
    up("menu_setores_opcoes", current.filter((_, optionIndex) => optionIndex !== index));
  }

  async function save() {
    if (!companyId) return;
    const menuOptions = (Array.isArray(cfg.menu_setores_opcoes) ? cfg.menu_setores_opcoes : []) as DepartmentMenuOption[];
    if (cfg.menu_setores_ativo && !cfg.id) return toast.error("Salve o agente antes de ativar o menu por setores.");
    if (cfg.menu_setores_ativo && (!String(cfg.menu_setores_texto || "").trim() || menuOptions.length < 2)) {
      return toast.error("Informe a mensagem e pelo menos duas opções de setor.");
    }
    setSaving(true);
    const {
      id: _id,
      user_id: _u,
      company_id: _c,
      updated_at: _ua,
      menu_setores_ativo: _menuAtivo,
      menu_setores_texto: _menuTexto,
      menu_setores_opcoes: _menuOpcoes,
      ...payload
    } = cfg;
    
    // Se estiver editando um agente específico, mantém o ID dele
    const savePayload = { 
      company_id: companyId, 
      user_id: ctx.user.id, 
      ...payload, 
      nome: payload.nome || payload.nome_agente || "Agente Studio" 
    };

    if (agentId || cfg.id) {
      (savePayload as any).id = agentId || cfg.id;
    }

    const { data: savedConfig, error } = await supabase.from("agent_config").upsert(
      savePayload,
      { onConflict: agentId || cfg.id ? "id" : "company_id,tipo" }
    ).select("id").single();

    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    try {
      const configId = String(agentId || cfg.id || savedConfig?.id || "");
      if (configId) {
        await ensureSession();
        await saveMenu({ data: {
          agent_config_id: configId,
          ativo: Boolean(cfg.menu_setores_ativo),
          texto: String(cfg.menu_setores_texto || ""),
          opcoes: menuOptions,
        } });
      }
      toast.success("Configuração salva");
    } catch (menuError) {
      toast.error(mensagemErroSessao(menuError, "Falha ao salvar configuração"));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true); setTestReply([]);
    try {
      const r = await test({ data: { message: testMsg } });
      setTestReply(r.parts);
    } catch (e: any) { toast.error(e?.message || "Falha"); }
    finally { setTesting(false); }
  }

  // Produtos CRUD
  async function addProduto() {
    if (!companyId) return;
    const { error } = await supabase.from("produto").insert({
      company_id: companyId, nome: "Novo produto", preco: 0, ordem: produtos.length,
    });
    if (error) return toast.error(error.message);
    reload();
  }
  async function updProduto(id: string, patch: Partial<Produto>) {
    setProdutos((ps) => ps.map((p) => p.id === id ? { ...p, ...patch } : p));
    await supabase.from("produto").update(patch).eq("id", id);
  }
  async function delProduto(id: string) {
    await supabase.from("produto").delete().eq("id", id);
    reload();
  }

  async function connectGoogle() {
    try {
      const r: any = await gStart({});
      if (!r.ok) return toast.error(r.error);
      window.location.href = r.url;
    } catch (e: any) { toast.error(e?.message || "Falha"); }
  }
  async function disconnectG() {
    await gDisc({}); toast.success("Google desconectado"); reload();
  }

  if (loading) return <div className="grid place-items-center h-40 text-muted-foreground"><Loader2 className="animate-spin" /></div>;

  const promptPreview = buildSystemPrompt(cfg, {
    responderEmPartes: cfg.responder_em_partes,
    produtos: produtos.filter((p) => p.ativo).map((p) => ({ nome: p.nome, preco: p.preco, descricao: p.descricao })),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link to="/app/agente">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agente IA (Avançado)</h1>
            <p className="text-sm text-muted-foreground">Configure como sua IA conversa e vende.</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />} Salvar
        </Button>
      </header>

      <div className="grid lg:grid-cols-[1fr_minmax(380px,440px)] gap-6">
        <div>
          <Tabs defaultValue="modelo">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-4">
              {[["modelo","Modelo IA"],["negocio","Negócio"],["produtos","Produtos"],["ofertas","Ofertas"],["vendas","Vendas"],
                ["suporte","Suporte"],["posvenda","Pós-venda"],["personalidade","Personalidade"],
                ["agendamento","Agendamento"],["setores","Setores"],["treino","Treino"],["regras","Regras"]].map(([k,l]) => (
                <TabsTrigger key={k} value={k} className="text-sm">{l}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="modelo" className="space-y-3">
              <Section title="Cérebro da IA" icon={<Sparkles className="size-3.5" />}>
                <div className="space-y-1.5">
                  <Label>Provedor</Label>
                  <Select value={cfg.ai_provider} disabled={true}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Google Gemini — incluso</SelectItem>
                      <SelectItem value="openai">OpenAI (GPT) — fixo</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude) — fixo</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A inteligência artificial é provida nativamente pela plataforma {brand.name} através de nossa API centralizada, garantindo a melhor performance e estabilidade para sua empresa.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Modelo</Label>
                  <Select value={cfg.ai_model} disabled={true}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={cfg.ai_model}>{cfg.ai_model}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


                <div className="space-y-2 pt-2">
                  <Label>Tempo de espera antes de responder</Label>
                  <p className="text-xs text-muted-foreground">A IA aguarda esse tempo para juntar mensagens enviadas em sequência e responder de uma vez só — parece mais humano.</p>
                  <div className="flex flex-wrap gap-2">
                    {BUFFER_PRESETS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => up("segundos_buffer", s)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition ${cfg.segundos_buffer === s ? "bg-[var(--brand)] text-white border-transparent" : "bg-[var(--panel-2)] border-[var(--border)] hover:border-[var(--brand)]"}`}
                      >{s}s</button>
                    ))}
                  </div>
                  <Slider value={[cfg.segundos_buffer]} max={30} step={1} onValueChange={([x]) => up("segundos_buffer", x)} />
                  <div className="text-xs text-muted-foreground font-mono text-right">{cfg.segundos_buffer}s</div>
                </div>
              </Section>
            </TabsContent>


            <TabsContent value="negocio" className="space-y-3">
              <Section>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Nome do agente" value={cfg.nome_agente} onChange={(v) => up("nome_agente", v)} />
                  <Field label="Nome da empresa" value={cfg.nome_empresa} onChange={(v) => up("nome_empresa", v)} />
                  <Field label="Segmento" value={cfg.segmento} onChange={(v) => up("segmento", v)} />
                  <Field label="Região / horário de atendimento" value={cfg.regiao_horario} onChange={(v) => up("regiao_horario", v)} />
                </div>
                <Area label="Descrição do negócio" value={cfg.descricao_negocio} onChange={(v) => up("descricao_negocio", v)} rows={3} />
                <Area label="Diferenciais" value={cfg.diferenciais} onChange={(v) => up("diferenciais", v)} rows={2} />
                <Area label="Público-alvo" value={cfg.publico_alvo} onChange={(v) => up("publico_alvo", v)} rows={2} />
                <Area label="Sobre a empresa (texto livre)" value={cfg.sobre_empresa} onChange={(v) => up("sobre_empresa", v)} rows={3} />
              </Section>
            </TabsContent>

            <TabsContent value="produtos" className="space-y-3">
              <Section>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Catálogo real usado pela IA.</p>
                  <Button size="sm" onClick={addProduto}><Plus className="size-4 mr-1" />Novo produto</Button>
                </div>
                <div className="space-y-2">
                  {produtos.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Nenhum produto cadastrado.</div>}
                  {produtos.map((p) => (
                    <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 grid sm:grid-cols-[1fr_120px_auto_auto] gap-2 items-center">
                      <Input value={p.nome} onChange={(e) => updProduto(p.id, { nome: e.target.value })} placeholder="Nome" />
                      <Input type="number" value={p.preco} onChange={(e) => updProduto(p.id, { preco: Number(e.target.value) || 0 })} placeholder="Preço" />
                      <Switch checked={p.ativo} onCheckedChange={(v) => updProduto(p.id, { ativo: v })} />
                      <button onClick={() => delProduto(p.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="size-4" /></button>
                      <Textarea className="sm:col-span-4" rows={2} value={p.descricao ?? ""} onChange={(e) => updProduto(p.id, { descricao: e.target.value })} placeholder="Descrição" />
                    </div>
                  ))}
                </div>
                <Area label="Produtos/serviços (texto livre — fallback)" value={cfg.produtos_servicos} onChange={(v) => up("produtos_servicos", v)} rows={3} />
              </Section>
            </TabsContent>

            <TabsContent value="ofertas" className="space-y-3">
              <Section>
                <Area label="Ofertas ativas" value={cfg.ofertas} onChange={(v) => up("ofertas", v)} rows={4} />
                <Field label="Cupom" value={cfg.cupom} onChange={(v) => up("cupom", v)} />
              </Section>
            </TabsContent>

            <TabsContent value="vendas" className="space-y-3">
              <Section>
                <Area label="Como vender (passo a passo)" value={cfg.como_vender} onChange={(v) => up("como_vender", v)} rows={4} />
                <Area label="Objeções comuns e respostas" value={cfg.objecoes} onChange={(v) => up("objecoes", v)} rows={4} />
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Formas de pagamento" value={cfg.formas_pagamento} onChange={(v) => up("formas_pagamento", v)} />
                  <Field label="Ticket médio" value={cfg.ticket_medio} onChange={(v) => up("ticket_medio", v)} />
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="suporte" className="space-y-3">
              <Section>
                <Area label="FAQ" value={cfg.faq} onChange={(v) => up("faq", v)} rows={5} />
                <Area label="Políticas (troca/cancelamento/garantia)" value={cfg.politicas} onChange={(v) => up("politicas", v)} rows={4} />
              </Section>
            </TabsContent>

            <TabsContent value="posvenda" className="space-y-3">
              <Section>
                <Area label="Mensagem de pós-venda" value={cfg.posvenda_msg} onChange={(v) => up("posvenda_msg", v)} rows={3} />
                <Toggle label="Pedir avaliação após venda" v={cfg.pedir_avaliacao} on={(v) => up("pedir_avaliacao", v)} />
                <Toggle label="Reativar clientes inativos" v={cfg.reativar_cliente} on={(v) => up("reativar_cliente", v)} />
              </Section>
            </TabsContent>

            <TabsContent value="personalidade" className="space-y-3">
              <Section title="Preset de personalidade" icon={<Sparkles className="size-3.5" />}>
                <p className="text-xs text-muted-foreground">Escolha um perfil base. Você refina os detalhes abaixo.</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {PERSONALIDADE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => applyPreset(p, cfg, setCfg)}
                      className={`text-left rounded-xl border p-3 transition ${cfg.personalidade === p.value ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--brand)]/60"}`}
                    >
                      <div className="text-lg">{p.emoji}</div>
                      <div className="font-semibold text-sm mt-1">{p.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-snug">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Foco do atendimento" icon={<Bot className="size-3.5" />}>
                <p className="text-xs text-muted-foreground">Define a missão principal da IA em cada conversa.</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {[
                    { v: "vendas", l: "🎯 Vendas", d: "Qualifica, gera interesse e conduz pro fechamento." },
                    { v: "suporte", l: "🛟 Suporte", d: "Resolve dúvidas e problemas com clareza." },
                    { v: "ambos", l: "🔀 Híbrido", d: "Identifica intenção e atua nos dois sentidos." },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => up("foco_atendimento", o.v)}
                      className={`text-left rounded-xl border p-3 transition ${cfg.foco_atendimento === o.v ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--brand)]/60"}`}
                    >
                      <div className="font-semibold text-sm">{o.l}</div>
                      <div className="text-[11px] text-muted-foreground">{o.d}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Ajustes finos de estilo">
                <SliderRow label="Tom (sério → caloroso)" v={cfg.tom} on={(v) => up("tom", v)} />
                <SliderRow label="Formalidade (informal → formal)" v={cfg.formalidade} on={(v) => up("formalidade", v)} />
                <SliderRow label="Proatividade (reativo → vendedor)" v={cfg.proatividade ?? 50} on={(v) => up("proatividade", v)} />

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tamanho das respostas</Label>
                    <Select value={cfg.tamanho_resposta} onValueChange={(v) => up("tamanho_resposta", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="curtas">Curtas (WhatsApp)</SelectItem>
                        <SelectItem value="medias">Médias</SelectItem>
                        <SelectItem value="longas">Longas (explicativas)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Uso de emojis</Label>
                    <Select value={cfg.emoji_intensidade ?? "pouco"} onValueChange={(v) => { up("emoji_intensidade", v); up("usar_emojis", v !== "nenhum"); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Nenhum</SelectItem>
                        <SelectItem value="pouco">Pouco (raro)</SelectItem>
                        <SelectItem value="moderado">Moderado (1 por msg)</SelectItem>
                        <SelectItem value="muito">Muito (vivo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Velocidade de resposta</Label>
                    <Select value={cfg.velocidade_resposta ?? "humana"} onValueChange={(v) => up("velocidade_resposta", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="imediata">Imediata (rápido)</SelectItem>
                        <SelectItem value="humana">Humana (natural)</SelectItem>
                        <SelectItem value="pausada">Pausada (pensativa)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Idioma</Label>
                    <Select value={cfg.idioma ?? "pt-BR"} onValueChange={(v) => up("idioma", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt-BR">Português (BR)</SelectItem>
                        <SelectItem value="pt-PT">Português (PT)</SelectItem>
                        <SelectItem value="es">Espanhol</SelectItem>
                        <SelectItem value="en">Inglês</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Section>

              <Section title="Tempo de espera (entender contexto)">
                <p className="text-xs text-muted-foreground">
                  A IA aguarda esse tempo antes de responder. Se o cliente mandar várias mensagens em sequência, ela junta tudo e responde uma vez só — entendendo o contexto completo da conversa, como faz uma pessoa de verdade.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { s: 3,  l: "Instantâneo", d: "3s" },
                    { s: 5,  l: "Rápido",      d: "5s" },
                    { s: 10, l: "Humano",      d: "10s" },
                    { s: 20, l: "Pensativo",   d: "20s" },
                    { s: 30, l: "Calmo",       d: "30s" },
                  ].map((o) => (
                    <button
                      key={o.s}
                      type="button"
                      onClick={() => up("segundos_buffer", o.s)}
                      className={`rounded-xl border p-3 text-center transition ${cfg.segundos_buffer === o.s ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--brand)]/60"}`}
                    >
                      <div className="font-display text-lg font-semibold">{o.d}</div>
                      <div className="text-[11px] text-muted-foreground">{o.l}</div>
                    </button>
                  ))}
                </div>
                <Slider value={[cfg.segundos_buffer]} max={60} step={1} onValueChange={([x]) => up("segundos_buffer", x)} />
                <div className="text-xs text-muted-foreground font-mono text-right">{cfg.segundos_buffer}s antes de responder</div>
              </Section>

              <Section title="Comportamento">

                <Toggle label="Responder em partes (1-3 bolhas separadas)" v={cfg.responder_em_partes} on={(v) => up("responder_em_partes", v)} />
                <Toggle label="Chamar cliente pelo nome quando souber" v={cfg.chamar_por_nome ?? true} on={(v) => up("chamar_por_nome", v)} />
                <Toggle label="Fazer uma pergunta por vez" v={cfg.perguntar_uma_por_vez ?? true} on={(v) => up("perguntar_uma_por_vez", v)} />
                <Toggle label="Pode usar gírias do cotidiano (BR)" v={cfg.usar_girias ?? false} on={(v) => up("usar_girias", v)} />
                <Toggle label="Pode fazer brincadeiras leves" v={cfg.pode_brincar ?? false} on={(v) => up("pode_brincar", v)} />
                <Toggle label="Assinar mensagens com o nome do agente" v={cfg.assinar_mensagens ?? false} on={(v) => up("assinar_mensagens", v)} />
              </Section>

              <Section title="Identidade da conversa">
                <Area label="Como se apresenta (1ª mensagem)" value={cfg.apresentacao} onChange={(v) => up("apresentacao", v)} rows={2} />
                <Area label="Estilo de comunicação (instruções extras)" value={cfg.estilo_comunicacao} onChange={(v) => up("estilo_comunicacao", v)} rows={2} />
                <Area label="Palavras / expressões PROIBIDAS (a IA nunca usa)" value={cfg.evitar_palavras ?? ""} onChange={(v) => up("evitar_palavras", v)} rows={2} />
              </Section>
            </TabsContent>


            <TabsContent value="agendamento" className="space-y-3">
              <Section>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Calendar className="size-5 text-[var(--brand-text)] mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold flex items-center gap-2">
                        Google Agenda
                        {google?.conectado && <span className="text-[10px] bg-[var(--brand)]/15 text-[var(--brand-text)] px-1.5 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="size-3" />Conectado</span>}
                      </div>
                      {google?.email && <div className="text-xs text-muted-foreground">{google.email}</div>}
                      <p className="text-xs text-muted-foreground mt-1">Permite que a IA marque eventos automaticamente.</p>
                    </div>
                    {!allowGoogleCal ? (
                      <Link to="/app/checkout" className="text-xs underline text-muted-foreground">Disponível no Pro</Link>
                    ) : google?.conectado
                      ? <Button size="sm" variant="outline" onClick={disconnectG}>Desconectar</Button>
                      : <Button size="sm" onClick={connectGoogle}><LinkIcon className="size-3.5 mr-1" />Conectar</Button>}
                  </div>
                </div>
                <Toggle label="Agendamento ativo" v={cfg.agendamento_ativo} on={(v) => up("agendamento_ativo", v)} />
                <Area label="Serviços agendáveis" value={cfg.servicos_agendaveis} onChange={(v) => up("servicos_agendaveis", v)} rows={2} />
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Duração padrão" value={cfg.duracao_padrao} onChange={(v) => up("duracao_padrao", v)} />
                  <Field label="Antecedência mínima" value={cfg.antecedencia_min} onChange={(v) => up("antecedencia_min", v)} />
                </div>
                <Area label="Horários disponíveis" value={cfg.horarios_disponiveis} onChange={(v) => up("horarios_disponiveis", v)} rows={2} />
              </Section>

              <Section title="Catálogo Olist" icon={<Sparkles className="size-3.5" />}>
                {!olistAtivo ? (
                  <p className="text-xs text-muted-foreground">
                    Instale e conecte o plugin Olist na Loja para a IA consultar produtos, preços e estoque em tempo real.
                  </p>
                ) : (
                  <>
                    <Toggle
                      label="Consultar catálogo e estoque da Olist"
                      v={Boolean(cfg.olist_catalogo)}
                      on={(v) => up("olist_catalogo", v)}
                    />
                    <p className="-mt-1 text-xs text-muted-foreground">
                      A IA responde com nome, preço e saldo reais dos produtos da sua Olist.
                    </p>
                    <Toggle
                      label="Fechar pedido na Olist"
                      v={Boolean(cfg.olist_pedido_auto)}
                      on={(v) => up("olist_pedido_auto", v)}
                    />
                    <p className="-mt-1 text-xs text-muted-foreground">
                      Após o cliente confirmar itens, valor e forma de pagamento, a IA lança o pedido na Olist e registra a venda no Comercial.
                    </p>
                  </>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="setores" className="space-y-3">
              <Section title="Menu automático por setores" icon={<Share2 className="size-3.5" />}>
                <div className="flex items-start justify-between gap-4 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-4">
                  <div>
                    <Label>Ativar menu no primeiro contato</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A mensagem será enviada exatamente como escrita. A IA só continua depois da escolha.
                    </p>
                  </div>
                  <Switch checked={Boolean(cfg.menu_setores_ativo)} onCheckedChange={(value) => up("menu_setores_ativo", value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Mensagem inicial</Label>
                  <Textarea
                    value={cfg.menu_setores_texto || ""}
                    onChange={(event) => up("menu_setores_texto", event.target.value)}
                    rows={7}
                    placeholder={"Olá! Escolha o setor desejado:\n\n1 - Comercial\n2 - Financeiro\n3 - Suporte"}
                  />
                  <p className="text-xs text-muted-foreground">Quebras de linha, espaços e emojis serão preservados no WhatsApp.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Opções e destinos</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addMenuOption} disabled={departments.length === 0}>
                      <Plus className="size-4" /> Adicionar
                    </Button>
                  </div>
                  {departments.length === 0 && (
                    <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Cadastre setores em Configurações para montar o menu.
                    </p>
                  )}
                  {((Array.isArray(cfg.menu_setores_opcoes) ? cfg.menu_setores_opcoes : []) as DepartmentMenuOption[]).map((option, index) => (
                    <div key={`${option.numero}-${index}`} className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-3 sm:grid-cols-[72px_1fr_1fr_auto] sm:items-end">
                      <div className="space-y-1.5">
                        <Label>Número</Label>
                        <Input
                          inputMode="numeric"
                          maxLength={2}
                          value={option.numero}
                          onChange={(event) => updateMenuOption(index, { numero: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Setor</Label>
                        <Select
                          value={option.department_id}
                          onValueChange={(departmentId) => {
                            const department = departments.find((item) => item.id === departmentId);
                            updateMenuOption(index, { department_id: departmentId, label: department?.nome || option.label });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                          <SelectContent>
                            {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Nome exibido</Label>
                        <Input value={option.label} onChange={(event) => updateMenuOption(index, { label: event.target.value })} />
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeMenuOption(index)} aria-label="Remover opção">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="treino" className="space-y-3">
              <Section title="Regras rígidas (prioridade máxima)" icon={<Sparkles className="size-3.5" />}>
                <p className="text-[12px] text-muted-foreground -mt-1">
                  Regras que a IA NUNCA deve quebrar, mesmo se o cliente insistir. Uma por linha. Ex: "Nunca prometer prazo abaixo de 3 dias"; "Nunca dar desconto acima de 10% sem confirmar com atendente".
                </p>
                <Textarea
                  value={cfg.regras_rigidas || ""}
                  onChange={(e) => up("regras_rigidas", e.target.value)}
                  rows={6}
                  placeholder={"Ex:\n- Nunca prometer entrega no mesmo dia\n- Nunca dar desconto sem cupom\n- Sempre confirmar endereço antes de fechar pedido"}
                />
              </Section>

              <Section title="Exemplos de atendimento (few-shot)" icon={<Sparkles className="size-3.5" />}>
                <p className="text-[12px] text-muted-foreground -mt-1">
                  Ensine pelo exemplo. Adicione diálogos reais mostrando como a IA deve responder. Máximo 6 exemplos.
                </p>
                <FewShotEditor
                  items={Array.isArray(cfg.exemplos_few_shot) ? cfg.exemplos_few_shot : []}
                  onChange={(items) => up("exemplos_few_shot", items)}
                />
              </Section>
            </TabsContent>

            <TabsContent value="regras" className="space-y-3">
              <Section>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Area label="O que PODE fazer" value={cfg.pode_fazer} onChange={(v) => up("pode_fazer", v)} rows={4} />
                  <Area label="O que NÃO pode fazer" value={cfg.nao_pode_fazer} onChange={(v) => up("nao_pode_fazer", v)} rows={4} />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Telefone p/ transferência" value={cfg.telefone_transferencia} onChange={(v) => up("telefone_transferencia", v)} />
                  <Field label="Palavra para pausar" value={cfg.palavra_pausar} onChange={(v) => up("palavra_pausar", v)} />
                  <Field label="Palavra para despausar" value={cfg.palavra_despausar} onChange={(v) => up("palavra_despausar", v)} />
                </div>
                <SliderRow label="Esperar antes de responder (segundos)" v={cfg.segundos_buffer} max={20} on={(v) => up("segundos_buffer", v)} unit="s" />
                <Toggle label="Responder em partes (1-3 bolhas)" v={cfg.responder_em_partes} on={(v) => up("responder_em_partes", v)} />
              </Section>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 self-start">
          <Section title="Prompt gerado" icon={<Bot className="size-3.5" />}>
            <pre className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 font-mono text-[12px] leading-relaxed text-[var(--brand-text)] whitespace-pre-wrap max-h-[360px] overflow-auto">
{promptPreview}
            </pre>
          </Section>
          <Section title="Testar resposta" icon={<Sparkles className="size-3.5" />}>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 space-y-2 min-h-[140px]">
              <div className="flex justify-end">
                <div className="max-w-[78%] bg-[var(--panel)] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px]">{testMsg}</div>
              </div>
              {testReply.map((p, i) => (
                <div key={i} className="flex justify-start gap-2 items-end">
                  <InitialsAvatar name="IA" size={24} />
                  <div className="max-w-[78%] bg-[var(--brand)]/15 text-foreground rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px]">
                    {p}
                  </div>
                </div>
              ))}
              {testing && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="size-3 animate-spin" />pensando…</div>}
            </div>
            <div className="flex gap-2 mt-3">
              <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="Mensagem do cliente…" />
              <Button onClick={runTest} disabled={testing} size="icon">
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-3">
      {title && (
        <h3 className="font-display text-[12px] font-semibold uppercase tracking-wider text-[var(--brand-text)] flex items-center gap-1.5">
          {icon}{title}
        </h3>
      )}
      {children}
    </div>
  );
}

function FewShotEditor({ items, onChange }: { items: any[]; onChange: (items: any[]) => void }) {
  const list = Array.isArray(items) ? items : [];
  const add = () => onChange([...list, { cliente: "", agente: "" }]);
  const patch = (i: number, k: "cliente" | "agente", v: string) => {
    const next = list.slice();
    next[i] = { ...(next[i] || { cliente: "", agente: "" }), [k]: v };
    onChange(next);
  };
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      {list.map((ex, i) => (
        <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exemplo {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-red-500">
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Cliente diz</Label>
            <Textarea rows={2} value={ex?.cliente || ""} onChange={(e) => patch(i, "cliente", e.target.value)} placeholder="Ex: quanto custa a entrega?" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Agente responde</Label>
            <Textarea rows={2} value={ex?.agente || ""} onChange={(e) => patch(i, "agente", e.target.value)} placeholder="Ex: A entrega até 5km é grátis, acima disso combinamos pelo CEP. Me passa o seu?" />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} disabled={list.length >= 6}>
        <Plus className="size-3.5 mr-1.5" /> Adicionar exemplo
      </Button>
    </div>
  );
}
function Field({ label, value, onChange, type }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
}
function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={rows} /></div>;
}
function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={!!v} onCheckedChange={on} />
    </div>
  );
}
function SliderRow({ label, v, on, max = 100, unit = "" }: { label: string; v: number; on: (v: number) => void; max?: number; unit?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground font-mono">{v}{unit}</span>
      </div>
      <Slider value={[v]} max={max} step={1} onValueChange={([x]) => on(x)} />
    </div>
  );
}
