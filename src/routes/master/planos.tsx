import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Edit3,
  Globe,
  Loader2,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import {
  deletePlanMasterFn,
  listPlansMasterFn,
  savePlanMasterFn,
  togglePlanActiveMasterFn,
} from "@/lib/plan-admin.functions";
import {
  PLAN_MODULES,
  normalizePlanFeatures,
  type PlanModuleDef,
} from "@/lib/plan-features";
import { useMasterT } from "@/lib/i18n/master-translations";

export const Route = createFileRoute("/master/planos")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Planos e Preços · Master` },
      { name: "description", content: "Motor unificado de planos BRL/USD, cotas QR vs API Oficial e créditos de IA." },
    ],
  }),
  component: MasterPlanosPage,
});

type PlanFormState = {
  id: string | null;
  slug: string;
  nome: string;
  descricao: string;
  preco_brl: string;
  preco_usd: string;
  preco_anual_brl: string;
  preco_anual_usd: string;
  desconto_anual_pct: string;
  trial_days: string;
  limite_instancias: string;
  limite_conexoes_oficiais: string;
  limite_usuarios: string;
  creditos_mensais: string;
  creditos_trial: string;
  checkout_url: string;
  paddle_product_id: string;
  paddle_price_id: string;
  destaque: boolean;
  ativo: boolean;
  ordem: string;
  features: Record<string, boolean>;
};

const EMPTY_FORM: PlanFormState = {
  id: null,
  slug: "",
  nome: "",
  descricao: "",
  preco_brl: "97.00",
  preco_usd: "39.00",
  preco_anual_brl: "77.60",
  preco_anual_usd: "31.00",
  desconto_anual_pct: "20",
  trial_days: "7",
  limite_instancias: "1",
  limite_conexoes_oficiais: "2",
  limite_usuarios: "2",
  creditos_mensais: "1500",
  creditos_trial: "300",
  checkout_url: "",
  paddle_product_id: "",
  paddle_price_id: "",
  destaque: false,
  ativo: true,
  ordem: "10",
  features: normalizePlanFeatures({}, "starter"),
};

function formatBRL(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatUSD(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function parseMoneyToCents(raw: string): number {
  const normalized = String(raw || "0").replace(",", ".").replace(/[^0-9.]/g, "");
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function centsToInput(cents: unknown): string {
  return (Number(cents || 0) / 100).toFixed(2);
}

function planToForm(plan: any): PlanFormState {
  return {
    id: plan.id ?? null,
    slug: String(plan.slug ?? ""),
    nome: String(plan.nome ?? ""),
    descricao: String(plan.descricao ?? ""),
    preco_brl: centsToInput(plan.preco_cents),
    preco_usd: centsToInput(plan.preco_usd_cents),
    preco_anual_brl: centsToInput(plan.preco_anual_brl_cents),
    preco_anual_usd: centsToInput(plan.preco_anual_usd_cents),
    desconto_anual_pct: String(plan.desconto_anual_pct ?? 20),
    trial_days: String(plan.trial_days ?? 7),
    limite_instancias: String(plan.limite_instancias ?? 1),
    limite_conexoes_oficiais: String(plan.limite_conexoes_oficiais ?? 2),
    limite_usuarios: String(plan.limite_usuarios ?? 1),
    creditos_mensais: String(plan.creditos_mensais ?? 1500),
    creditos_trial: String(plan.creditos_trial ?? 300),
    checkout_url: String(plan.checkout_url ?? ""),
    paddle_product_id: String(plan.paddle_product_id ?? ""),
    paddle_price_id: String(plan.paddle_price_id ?? ""),
    destaque: Boolean(plan.destaque),
    ativo: plan.ativo !== false,
    ordem: String(plan.ordem ?? 0),
    features: normalizePlanFeatures(plan.features, plan.slug),
  };
}

const CATEGORY_LABELS: Record<PlanModuleDef["category"], string> = {
  canais: "Canais & Conexões",
  ia: "Inteligência Artificial",
  operacao: "Operação & Módulos CRM",
  controle: "Controles de Trial e Custo",
};

function MasterPlanosPage() {
  const { mt } = useMasterT();
  const fetchPlans = useServerFn(listPlansMasterFn);
  const savePlan = useServerFn(savePlanMasterFn);
  const togglePlan = useServerFn(togglePlanActiveMasterFn);
  const deletePlan = useServerFn(deletePlanMasterFn);

  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPlans();
      setPlans(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar planos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      ordem: String((plans.length + 1) * 10),
      features: normalizePlanFeatures({}, "starter"),
    });
    setModalOpen(true);
  };

  const openEdit = (plan: any) => {
    setForm(planToForm(plan));
    setModalOpen(true);
  };

  const recalcAnnualFromMonthly = () => {
    const pct = Math.max(0, Math.min(90, Number(form.desconto_anual_pct || 0)));
    const factor = 1 - pct / 100;
    const brlMonthly = parseMoneyToCents(form.preco_brl);
    const usdMonthly = parseMoneyToCents(form.preco_usd);
    setForm((prev) => ({
      ...prev,
      preco_anual_brl: (Math.round(brlMonthly * factor) / 100).toFixed(2),
      preco_anual_usd: (Math.round(usdMonthly * factor) / 100).toFixed(2),
    }));
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.slug.trim()) {
      toast.error("Nome e slug são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      await savePlan({
        data: {
          id: form.id,
          slug: form.slug.trim().toLowerCase(),
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || null,
          preco_cents: parseMoneyToCents(form.preco_brl),
          preco_usd_cents: parseMoneyToCents(form.preco_usd),
          preco_anual_brl_cents: parseMoneyToCents(form.preco_anual_brl),
          preco_anual_usd_cents: parseMoneyToCents(form.preco_anual_usd),
          desconto_anual_pct: Math.max(0, Math.min(90, Math.round(Number(form.desconto_anual_pct) || 0))),
          moeda: "BRL",
          intervalo: "month",
          trial_days: Math.max(0, Math.round(Number(form.trial_days) || 0)),
          limite_instancias: Math.max(0, Math.round(Number(form.limite_instancias) || 0)),
          limite_conexoes_oficiais: Math.max(0, Math.round(Number(form.limite_conexoes_oficiais) || 0)),
          limite_usuarios: Math.max(1, Math.round(Number(form.limite_usuarios) || 1)),
          creditos_mensais: Math.max(0, Math.round(Number(form.creditos_mensais) || 0)),
          creditos_trial: Math.max(0, Math.round(Number(form.creditos_trial) || 0)),
          features: form.features,
          checkout_url: form.checkout_url.trim() || null,
          paddle_product_id: form.paddle_product_id.trim() || null,
          paddle_price_id: form.paddle_price_id.trim() || null,
          destaque: form.destaque,
          ativo: form.ativo,
          ordem: Math.round(Number(form.ordem) || 0),
        },
      });
      toast.success(form.id ? "Plano atualizado com sucesso." : "Plano criado com sucesso.");
      setModalOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar plano");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: any) => {
    setBusyId(plan.id);
    try {
      await togglePlan({ data: { id: plan.id, ativo: !plan.ativo } });
      toast.success(plan.ativo ? "Plano desativado." : "Plano ativado.");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao alterar status");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (plan: any) => {
    if (!window.confirm(`Excluir o plano "${plan.nome}"?`)) return;
    setBusyId(plan.id);
    try {
      await deletePlan({ data: { id: plan.id } });
      toast.success("Plano excluído.");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir plano");
    } finally {
      setBusyId(null);
    }
  };

  const categories: PlanModuleDef["category"][] = ["canais", "ia", "operacao", "controle"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight leading-tight">
            Motor Unificado de Planos (BRL &amp; USD)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {mt("Separação de custo entre WhatsApp QR (D-API pago) e API Oficial Meta ($0), créditos de IA e preços públicos dinâmicos.")}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="size-4" />
          {mt("Novo Plano")}
        </Button>
      </div>

      {loading ? (
        <Card className="p-8 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="size-4 animate-spin" />
          {mt("Carregando planos...")}
        </Card>
      ) : plans.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {mt("Nenhum plano cadastrado.")}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const feats = normalizePlanFeatures(plan.features, plan.slug);
            const enabledCount = PLAN_MODULES.filter((m) => m.category !== "controle" && feats[m.key]).length;
            const allowsQrTrial = Boolean(feats.permite_dapi_trial);
            const isCore = ["starter", "pro", "business", "cortesia"].includes(String(plan.slug));

            return (
              <Card
                key={plan.id}
                className={`p-5 flex flex-col justify-between gap-4 border ${
                  plan.destaque ? "border-primary/60 shadow-sm ring-1 ring-primary/15" : ""
                } ${!plan.ativo ? "opacity-70 bg-muted/20" : ""}`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base">{plan.nome}</h3>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {plan.slug}
                        </Badge>
                        {plan.destaque && (
                          <Badge className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20">
                            <Star className="size-3" /> Destaque
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {plan.descricao || "Sem descrição pública."}
                      </p>
                    </div>
                    <Badge
                      variant={plan.ativo ? "default" : "secondary"}
                      className={
                        plan.ativo
                          ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                          : "bg-slate-200 text-slate-600"
                      }
                    >
                      {plan.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  {/* Preços BRL / USD */}
                  <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Brasil (BRL)</span>
                      <span className="font-bold text-sm text-foreground">
                        {formatBRL(plan.preco_cents)}/mês
                      </span>
                      <span className="text-[11px] text-emerald-700 block">
                        Anual: {formatBRL(plan.preco_anual_brl_cents)} (-{plan.desconto_anual_pct ?? 20}%)
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block flex items-center gap-1">
                        <Globe className="size-3" /> LATAM / VE (USD)
                      </span>
                      <span className="font-bold text-sm text-foreground">
                        {formatUSD(plan.preco_usd_cents)}/mês
                      </span>
                      <span className="text-[11px] text-emerald-700 block">
                        Anual: {formatUSD(plan.preco_anual_usd_cents)} (-{plan.desconto_anual_pct ?? 20}%)
                      </span>
                    </div>
                  </div>

                  {/* Limites QR vs Oficial vs Créditos */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border p-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="size-3 text-amber-600" /> WhatsApp QR (D-API)
                      </span>
                      <span className="font-semibold text-sm">{plan.limite_instancias ?? 0} conexões</span>
                      <span className="block text-[10px] text-amber-700">Custo por linha</span>
                    </div>
                    <div className="rounded-md border p-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="size-3 text-emerald-600" /> API Oficial Meta
                      </span>
                      <span className="font-semibold text-sm">{plan.limite_conexoes_oficiais ?? 0} números</span>
                      <span className="block text-[10px] text-emerald-700">Custo $0 plataforma</span>
                    </div>
                    <div className="rounded-md border p-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Users className="size-3" /> Equipe
                      </span>
                      <span className="font-semibold text-sm">{plan.limite_usuarios ?? 1} usuários</span>
                      <span className="block text-[10px] text-muted-foreground">Ordem #{plan.ordem ?? 0}</span>
                    </div>
                    <div className="rounded-md border p-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Coins className="size-3 text-primary" /> Créditos IA
                      </span>
                      <span className="font-semibold text-sm">
                        {Number(plan.creditos_mensais ?? 0).toLocaleString("pt-BR")}/mês
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        Trial: {Number(plan.creditos_trial ?? 0).toLocaleString("pt-BR")} ({plan.trial_days ?? 7}d)
                      </span>
                    </div>
                  </div>

                  {/* Resumo de módulos */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[11px] gap-1">
                      <Sparkles className="size-3" /> {enabledCount} módulos liberados
                    </Badge>
                    {allowsQrTrial ? (
                      <Badge className="text-[11px] gap-1 bg-amber-500/15 text-amber-700 border-amber-500/30">
                        <AlertTriangle className="size-3" /> QR liberado no Trial
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] text-emerald-700 border-emerald-500/30">
                        QR bloqueado no Trial (proteção de caixa)
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t">
                  <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={() => openEdit(plan)}>
                    <Edit3 className="size-3.5" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === plan.id}
                    onClick={() => handleToggleActive(plan)}
                  >
                    {busyId === plan.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : plan.ativo ? (
                      "Desativar"
                    ) : (
                      "Ativar"
                    )}
                  </Button>
                  {!isCore && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === plan.id}
                      onClick={() => handleDelete(plan)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? `Editar Plano: ${form.nome}` : mt("Novo Plano")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Identificação */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">{mt("Nome do Plano")}</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Capi Pro"
                />
              </div>
              <div>
                <Label className="text-xs">{mt("Slug (identificador)")}</Label>
                <Input
                  value={form.slug}
                  disabled={Boolean(form.id && ["starter", "pro", "business", "cortesia"].includes(form.slug))}
                  onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="pro"
                />
              </div>
              <div>
                <Label className="text-xs">{mt("Ordem de exibição")}</Label>
                <Input
                  type="number"
                  value={form.ordem}
                  onChange={(e) => setForm((p) => ({ ...p, ordem: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">{mt("Descrição pública (Pricing e Checkout)")}</Label>
              <Textarea
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex: Escala comercial com equipe completa, CRM Kanban e Agente de IA."
              />
            </div>

            {/* Preços BRL / USD */}
            <div className="rounded-lg border p-3.5 space-y-3 bg-muted/15">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preços Multimoeda (Brasil BRL &amp; LATAM/VE USD)
                </h4>
                <Button type="button" size="sm" variant="outline" onClick={recalcAnnualFromMonthly}>
                  Recalcular anual (-{form.desconto_anual_pct || 0}%)
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs">{mt("BRL Mensal (R$)")}</Label>
                  <Input
                    value={form.preco_brl}
                    onChange={(e) => setForm((p) => ({ ...p, preco_brl: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("BRL Anual/mês (R$)")}</Label>
                  <Input
                    value={form.preco_anual_brl}
                    onChange={(e) => setForm((p) => ({ ...p, preco_anual_brl: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("USD Mensal ($)")}</Label>
                  <Input
                    value={form.preco_usd}
                    onChange={(e) => setForm((p) => ({ ...p, preco_usd: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("USD Anual/mês ($)")}</Label>
                  <Input
                    value={form.preco_anual_usd}
                    onChange={(e) => setForm((p) => ({ ...p, preco_anual_usd: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("Desconto Anual (%)")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={form.desconto_anual_pct}
                    onChange={(e) => setForm((p) => ({ ...p, desconto_anual_pct: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Cotas e Créditos */}
            <div className="rounded-lg border p-3.5 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {mt("Cotas de Conexões, Equipe e Créditos de IA")}
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{mt("WhatsApp QR (D-API pago)")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.limite_instancias}
                    onChange={(e) => setForm((p) => ({ ...p, limite_instancias: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("WhatsApp API Oficial Meta ($0)")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.limite_conexoes_oficiais}
                    onChange={(e) => setForm((p) => ({ ...p, limite_conexoes_oficiais: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("Usuários / Equipe")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.limite_usuarios}
                    onChange={(e) => setForm((p) => ({ ...p, limite_usuarios: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("Créditos IA / mês")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.creditos_mensais}
                    onChange={(e) => setForm((p) => ({ ...p, creditos_mensais: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("Créditos IA no Trial")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.creditos_trial}
                    onChange={(e) => setForm((p) => ({ ...p, creditos_trial: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{mt("Dias de Trial Grátis")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={form.trial_days}
                    onChange={(e) => setForm((p) => ({ ...p, trial_days: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Módulos */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Módulos &amp; Regras de Acesso
              </h4>
              {categories.map((cat) => {
                const items = PLAN_MODULES.filter((m) => m.category === cat);
                if (!items.length) return null;
                return (
                  <div key={cat} className="rounded-lg border p-3 space-y-2">
                    <div className="text-xs font-semibold text-foreground">{CATEGORY_LABELS[cat]}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {items.map((mod) => {
                        const checked = Boolean(form.features[mod.key]);
                        return (
                          <div
                            key={mod.key}
                            className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 bg-background"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium leading-tight">{mod.label}</div>
                              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                                {mod.description}
                              </div>
                            </div>
                            <Switch
                              checked={checked}
                              onCheckedChange={(v) =>
                                setForm((p) => ({
                                  ...p,
                                  features: { ...p.features, [mod.key]: v },
                                }))
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Opções extras & Visibilidade */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <Label className="text-xs">{mt("URL Checkout Externo (opcional)")}</Label>
                <Input
                  value={form.checkout_url}
                  onChange={(e) => setForm((p) => ({ ...p, checkout_url: e.target.value }))}
                  placeholder={mt("Deixe vazio para usar AbacatePay / USD interno")}
                />
              </div>
              <div className="flex items-center gap-6 pt-5">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <Switch
                    checked={form.destaque}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, destaque: v }))}
                  />
                  {mt("Plano em Destaque")}
                </label>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <Switch
                    checked={form.ativo}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, ativo: v }))}
                  />
                  {mt("Ativo na Vitrine")}
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              {mt("Cancelar")}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {mt("Salvar Plano")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
