import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  AlertTriangle,
  Building2,
  Cpu,
  DollarSign,
  Edit3,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteAiPoolKeyFn,
  getMasterAiUsageSummaryFn,
  listAiPoolKeysFn,
  resetAiPoolKeyCooldownFn,
  saveAiPoolKeyFn,
  testAiPoolKeyFn,
} from "@/lib/ai-admin.functions";

type UsageRange = "24h" | "7d" | "30d" | "mes";

const RANGES: Array<{ v: UsageRange; label: string }> = [
  { v: "24h", label: "Últimas 24h" },
  { v: "7d", label: "Últimos 7 dias" },
  { v: "30d", label: "Últimos 30 dias" },
  { v: "mes", label: "Este mês" },
];

const nf = new Intl.NumberFormat("pt-BR");
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4 rounded-2xl border-[color:var(--hairline)]">
      <div className="flex items-center gap-2 text-muted-foreground text-[12px]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}

const FEATURE_LABELS: Record<string, string> = {
  chat_agent: "Atendimento IA (Chat)",
  agent_copilot: "Copiloto de Agentes",
  agent_rules_audit: "Auditoria de Regras",
  crm_copilot: "Copiloto CRM",
  crm_lead_analyzer: "Analisador de Leads",
  automation_classify: "Automação · Classificador",
  automation_extract: "Automação · Extração",
  chat_summary: "Resumo de Conversas",
  chat_sentiment: "Análise de Sentimento",
  audio_transcribe: "Transcrição Whisper",
};

const EMPTY_FORM = {
  id: "" as string,
  provider: "drael" as "drael" | "gemini" | "openai" | "anthropic" | "groq",
  alias: "",
  api_key: "",
  max_concurrency: 4,
  priority: 1,
  active: true,
};

export function AiTelemetryPanel() {
  const loadSummary = useServerFn(getMasterAiUsageSummaryFn);
  const loadPool = useServerFn(listAiPoolKeysFn);
  const savePoolKey = useServerFn(saveAiPoolKeyFn);
  const deletePoolKey = useServerFn(deleteAiPoolKeyFn);
  const resetCooldown = useServerFn(resetAiPoolKeyCooldownFn);
  const testPoolKey = useServerFn(testAiPoolKeyFn);

  const [range, setRange] = useState<UsageRange>("30d");
  const [summary, setSummary] = useState<any | null>(null);
  const [poolKeys, setPoolKeys] = useState<any[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingPool, setLoadingPool] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [savingKey, setSavingKey] = useState(false);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

  const refreshSummary = useCallback(async (selectedRange: UsageRange) => {
    setLoadingSummary(true);
    try {
      const res = await loadSummary({ data: { range: selectedRange } });
      setSummary(res);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar telemetria de IA");
    } finally {
      setLoadingSummary(false);
    }
  }, [loadSummary]);

  const refreshPool = useCallback(async () => {
    setLoadingPool(true);
    try {
      const rows = await loadPool();
      setPoolKeys(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar pool de contas");
    } finally {
      setLoadingPool(false);
    }
  }, [loadPool]);

  useEffect(() => {
    void refreshSummary(range);
  }, [range, refreshSummary]);

  useEffect(() => {
    void refreshPool();
  }, [refreshPool]);

  function openNewDialog() {
    setForm({
      ...EMPTY_FORM,
      alias: `Drael Conta ${poolKeys.filter((k) => k.provider === "drael").length + 1}`,
      priority: poolKeys.length + 1,
    });
    setDialogOpen(true);
  }

  function openEditDialog(k: any) {
    setForm({
      id: k.id,
      provider: k.provider || "drael",
      alias: k.alias || "",
      api_key: "",
      max_concurrency: Number(k.max_concurrency ?? 4),
      priority: Number(k.priority ?? 1),
      active: Boolean(k.active),
    });
    setDialogOpen(true);
  }

  async function handleSavePoolKey() {
    if (!form.alias.trim()) {
      toast.error("Informe um apelido para a conta.");
      return;
    }
    if (!form.id && !form.api_key.trim()) {
      toast.error("Informe a API Key.");
      return;
    }
    setSavingKey(true);
    try {
      await savePoolKey({
        data: {
          ...(form.id ? { id: form.id } : {}),
          provider: form.provider,
          alias: form.alias.trim(),
          api_key: form.api_key.trim() || undefined,
          max_concurrency: Number(form.max_concurrency) || 4,
          priority: Number(form.priority) || 1,
          active: form.active,
        },
      });
      toast.success(form.id ? "Conta do pool atualizada" : "Conta adicionada ao pool");
      setDialogOpen(false);
      void refreshPool();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar a conta");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleToggleActive(k: any) {
    setBusyKeyId(k.id);
    try {
      await savePoolKey({
        data: {
          id: k.id,
          provider: k.provider,
          alias: k.alias,
          max_concurrency: Number(k.max_concurrency ?? 4),
          priority: Number(k.priority ?? 1),
          active: !k.active,
        },
      });
      toast.success(k.active ? "Conta pausada no pool" : "Conta ativada no pool");
      void refreshPool();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao alterar status");
    } finally {
      setBusyKeyId(null);
    }
  }

  async function handleDeleteKey(k: any) {
    if (!confirm(`Remover "${k.alias}" do pool?`)) return;
    setBusyKeyId(k.id);
    try {
      await deletePoolKey({ data: { id: k.id } });
      toast.success("Conta removida do pool");
      void refreshPool();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao remover conta");
    } finally {
      setBusyKeyId(null);
    }
  }

  async function handleResetCooldown(k: any) {
    setBusyKeyId(k.id);
    try {
      await resetCooldown({ data: { id: k.id } });
      toast.success("Cooldown limpo");
      void refreshPool();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao resetar cooldown");
    } finally {
      setBusyKeyId(null);
    }
  }

  async function handleTestKey(k: any) {
    setTestingKeyId(k.id);
    try {
      const res: any = await testPoolKey({ data: { id: k.id } });
      if (res?.ok) {
        toast.success(`${k.alias}: OK (${res.ms}ms)`);
      } else {
        toast.error(`${k.alias}: HTTP ${res?.status ?? 0} — ${res?.error || "Falha"}`);
      }
      void refreshPool();
    } catch (e: any) {
      toast.error(e?.message || "Erro no teste");
    } finally {
      setTestingKeyId(null);
    }
  }

  const totals = summary?.totals ?? {
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    credits_charged: 0,
    cost_usd: 0,
    rate_limited_count: 0,
  };
  const dailySeries = (summary?.daily_series ?? []) as Array<{
    date: string;
    requests: number;
    cost_usd: number;
    credits_charged: number;
  }>;
  const maxDayReqs = dailySeries.length ? Math.max(1, ...dailySeries.map((d) => d.requests)) : 1;

  const activeDraelKeys = poolKeys.filter((k) => k.provider === "drael" && k.active);
  const totalSlots = activeDraelKeys.reduce((acc, k) => acc + Number(k.max_concurrency ?? 4), 0);
  const usedSlots = activeDraelKeys.reduce((acc, k) => acc + Number(k.active_leases ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Telemetria Unificada Multi-Provedor */}
      <Card className="p-5 sm:p-6 rounded-2xl border-[color:var(--hairline)] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold flex items-center gap-2">
              <Activity className="size-4 text-[color:var(--brand-text)]" />
              Telemetria e Custos de IA (Multi-Provedor)
            </h2>
            <p className="text-xs text-muted-foreground">
              Consumo real unificado de Drael, Gemini, OpenAI, Anthropic e Whisper por empresa e módulo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => void refreshSummary(range)}
              disabled={loadingSummary}
            >
              <RefreshCw className={`size-3.5 ${loadingSummary ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Select value={range} onValueChange={(v) => setRange(v as UsageRange)}>
              <SelectTrigger className="w-[170px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.v} value={r.v}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Zap className="size-4 text-blue-600" />}
            label="Chamadas registradas"
            value={nf.format(totals.requests)}
            hint={`${nf.format(totals.rate_limited_count)} rate-limit(s) 429`}
          />
          <KpiCard
            icon={<DollarSign className="size-4 text-emerald-600" />}
            label="Custo estimado (USD)"
            value={usd.format(totals.cost_usd ?? 0)}
            hint="Soma real + amortizado Drael"
          />
          <KpiCard
            icon={<Cpu className="size-4 text-violet-600" />}
            label="Tokens (In / Out)"
            value={`${nf.format(totals.input_tokens)} / ${nf.format(totals.output_tokens)}`}
            hint="Captura direta das APIs"
          />
          <KpiCard
            icon={<Sparkles className="size-4 text-amber-600" />}
            label="Créditos computados"
            value={nf.format(totals.credits_charged)}
            hint="Base para consumo dos clientes"
          />
        </div>

        {loadingSummary && !summary ? (
          <div className="py-10 grid place-items-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            {dailySeries.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-xs font-medium text-muted-foreground">Volume diário de chamadas</div>
                <div className="flex items-end gap-1 h-24 rounded-xl border border-[color:var(--hairline)] bg-muted/20 p-3">
                  {dailySeries.map((d) => {
                    const pct = Math.max(6, Math.round((d.requests / maxDayReqs) * 100));
                    return (
                      <div
                        key={d.date}
                        title={`${d.date}: ${nf.format(d.requests)} chamadas · ${usd.format(d.cost_usd)}`}
                        className="flex-1 h-full flex items-end group"
                      >
                        <div
                          className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-all"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Por provedor */}
              <div className="rounded-xl border border-[color:var(--hairline)] p-3.5 space-y-2.5">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-muted-foreground" /> Por Provedor
                </div>
                {(summary?.by_provider ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sem eventos no período.</p>
                ) : (
                  <div className="space-y-2">
                    {(summary?.by_provider ?? []).map((p: any) => (
                      <div key={p.provider} className="flex items-center justify-between text-xs gap-2">
                        <div className="min-w-0">
                          <span className="font-medium uppercase">{p.provider}</span>
                          {p.rate_limited_count > 0 && (
                            <span className="ml-1.5 text-[10px] text-amber-600">({p.rate_limited_count}× 429)</span>
                          )}
                          <div className="text-[10.5px] text-muted-foreground">
                            {nf.format(p.requests)} req · {nf.format(p.input_tokens + p.output_tokens)} tok
                          </div>
                        </div>
                        <span className="font-semibold tabular-nums shrink-0">{usd.format(p.cost_usd)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Por empresa */}
              <div className="rounded-xl border border-[color:var(--hairline)] p-3.5 space-y-2.5">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-muted-foreground" /> Por Empresa
                </div>
                {(summary?.by_company ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sem eventos no período.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(summary?.by_company ?? []).slice(0, 12).map((c: any) => (
                      <div key={c.company_id || "sys"} className="flex items-center justify-between text-xs gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.company_name}</div>
                          <div className="text-[10.5px] text-muted-foreground">
                            {nf.format(c.requests)} chamadas · {nf.format(c.credits_charged)} créditos
                          </div>
                        </div>
                        <span className="font-semibold tabular-nums shrink-0">{usd.format(c.cost_usd)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Por módulo */}
              <div className="rounded-xl border border-[color:var(--hairline)] p-3.5 space-y-2.5">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="size-3.5 text-muted-foreground" /> Por Módulo
                </div>
                {(summary?.by_feature ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sem eventos no período.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(summary?.by_feature ?? []).map((f: any) => (
                      <div key={f.feature} className="flex items-center justify-between text-xs gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{FEATURE_LABELS[f.feature] || f.feature}</div>
                          <div className="text-[10.5px] text-muted-foreground">
                            {nf.format(f.requests)} chamadas · {nf.format(f.credits_charged)} créd.
                          </div>
                        </div>
                        <span className="font-semibold tabular-nums shrink-0">{usd.format(f.cost_usd)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Pool de Contas Drael AI (Rotação por Turnos) */}
      <Card className="p-5 sm:p-6 rounded-2xl border-[color:var(--hairline)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] font-semibold">Pool de Contas Drael AI (Rotação por Turnos)</h2>
              <Badge variant="outline" className="text-[11px]">
                {activeDraelKeys.length} ativa(s) · {usedSlots}/{totalSlots} hilos em uso
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Coordenação distribuída via PostgreSQL (4 hilos simultâneos por conta + cooldown automático em 429).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void refreshPool()} disabled={loadingPool}>
              <RefreshCw className={`size-3.5 ${loadingPool ? "animate-spin" : ""}`} /> Atualizar Pool
            </Button>
            <Button size="sm" className="h-9 gap-1.5" onClick={openNewDialog}>
              <Plus className="size-4" /> Adicionar conta
            </Button>
          </div>
        </div>

        {loadingPool && poolKeys.length === 0 ? (
          <div className="py-8 grid place-items-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : poolKeys.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
            <p className="text-sm font-medium">Nenhuma conta cadastrada no pool ainda</p>
            <p className="text-xs text-muted-foreground">
              Enquanto o pool estiver vazio, o sistema usa a chave única das Configurações Globais abaixo. Adicione contas Drael aqui para escalar até 4 hilos por chave.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {poolKeys.map((k) => {
              const inCooldown = k.cooldown_until && new Date(k.cooldown_until).getTime() > Date.now();
              const maxConc = Math.max(1, Number(k.max_concurrency ?? 4));
              const activeLeases = Number(k.active_leases ?? 0);
              const pct = Math.min(100, Math.round((activeLeases / maxConc) * 100));

              return (
                <div
                  key={k.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-[color:var(--hairline)] p-4 bg-card"
                >
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{k.alias}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {k.provider}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {k.api_key_masked}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Prioridade {k.priority}
                      </Badge>
                      {!k.active && (
                        <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600">
                          Pausada
                        </Badge>
                      )}
                      {inCooldown && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 gap-1">
                          <AlertTriangle className="size-3" />
                          Cooldown até {new Date(k.cooldown_until).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <span>
                          <strong className="text-foreground tabular-nums">{activeLeases}/{maxConc}</strong> em uso
                        </span>
                        <span className="inline-block w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                          <span
                            className={`block h-full rounded-full ${activeLeases >= maxConc ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      </span>
                      <span>
                        Turnos 3h: <strong className="text-foreground tabular-nums">{nf.format(k.turns_last_3h ?? 0)}</strong>
                      </span>
                      <span>
                        Total: <strong className="text-foreground tabular-nums">{nf.format(k.total_requests ?? 0)}</strong>
                      </span>
                      <span>
                        429 hits: <strong className="text-foreground tabular-nums">{nf.format(k.rate_limit_hits ?? 0)}</strong>
                      </span>
                    </div>

                    {k.last_error && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 truncate">
                        Último erro: {k.last_error}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <Switch
                      checked={!!k.active}
                      disabled={busyKeyId === k.id}
                      onCheckedChange={() => void handleToggleActive(k)}
                      title={k.active ? "Pausar conta" : "Ativar conta"}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      disabled={testingKeyId === k.id}
                      onClick={() => void handleTestKey(k)}
                    >
                      {testingKeyId === k.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                      Testar
                    </Button>
                    {inCooldown && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        disabled={busyKeyId === k.id}
                        onClick={() => void handleResetCooldown(k)}
                      >
                        <RotateCcw className="size-3.5" /> Liberar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditDialog(k)} title="Editar">
                      <Edit3 className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-red-500 hover:bg-red-50"
                      disabled={busyKeyId === k.id}
                      onClick={() => void handleDeleteKey(k)}
                      title="Remover"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar conta do pool" : "Adicionar conta ao pool de IA"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Provedor</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => setForm({ ...form, provider: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="drael">Drael AI</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="groq">Groq</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Apelido</Label>
                <Input
                  value={form.alias}
                  onChange={(e) => setForm({ ...form, alias: e.target.value })}
                  placeholder="Drael Conta 1"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{form.id ? "Nova API Key (opcional — deixe em branco para manter)" : "API Key"}</Label>
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder={form.id ? "Manter chave atual ou colar nova..." : "dk-..."}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hilos simultâneos</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={form.max_concurrency}
                  onChange={(e) => setForm({ ...form, max_concurrency: Number(e.target.value) || 4 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade (1 = maior)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Label>Conta ativa para rotação</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSavePoolKey()} disabled={savingKey}>
              {savingKey && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {form.id ? "Salvar alterações" : "Adicionar ao pool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
