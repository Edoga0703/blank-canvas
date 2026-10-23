import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, PlugZap, CheckCircle2, XCircle, Activity, AlertTriangle,
  RefreshCw, Wifi, PauseCircle, Clock, Gauge, Pencil, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { HelpTip } from "@/components/help-tip";
import { getProvidersHealth, getWhatsappFleet, setProviderCapacity, type ProviderHealth, type WhatsappFleet } from "@/lib/provider-monitor.functions";
import { WhatsappFleetPanel } from "@/components/master/whatsapp-fleet-panel";
import { Input } from "@/components/ui/input";
import {
  testUazapiConnection,
  type ProviderTestResult,
} from "@/lib/uazapi-test.functions";

export const Route = createFileRoute("/master/diagnostico")({
  component: DiagnosticoPage,
});

type Key = "dapi";
type Sample = { t: number; ok: boolean; latencyMs: number };

const HISTORY_KEY = "master_provider_history";

function loadHistory(): Record<string, Sample[]> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}"); } catch { return {}; }
}

function DiagnosticoPage() {
  const fetchHealth = useServerFn(getProvidersHealth);
  const fetchFleet = useServerFn(getWhatsappFleet);
  const runUazapi = useServerFn(testUazapiConnection);

  const [fleet, setFleet] = useState<WhatsappFleet | null>(null);
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<Record<string, Sample[]>>({});
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState<Key | "all" | null>(null);
  const [results, setResults] = useState<Partial<Record<Key, ProviderTestResult>>>({});
  const prevOk = useRef<Record<string, boolean>>({});

  useEffect(() => { setHistory(loadHistory()); }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [r, f] = await Promise.all([
        fetchHealth(),
        fetchFleet().catch(() => null),
      ]);
      if (f) setFleet(f as WhatsappFleet);
      setHealth(r.providers);
      setCheckedAt(r.checkedAt);
      setHistory((prev) => {
        const next = { ...prev };
        for (const p of r.providers) {
          if (!p.configured) continue;
          const arr = [...(next[p.provider] ?? []), { t: Date.now(), ok: p.ok && !p.degraded, latencyMs: p.latencyMs }];
          next[p.provider] = arr.slice(-40);
        }
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* noop */ }
        return next;
      });
      for (const p of r.providers) {
        if (!p.configured) continue;
        const before = prevOk.current[p.provider];
        if (before === true && !p.ok) toast.error(`${p.label} caiu`, { description: p.message, duration: 10000 });
        if (before === false && p.ok) toast.success(`${p.label} restabelecida`);
        prevOk.current[p.provider] = p.ok;
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao consultar provedores");
    } finally {
      setRefreshing(false);
    }
  }, [fetchHealth, fetchFleet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => { if (!document.hidden) void refresh(); }, 20_000);
    return () => clearInterval(t);
  }, [auto, refresh]);

  async function test(key: Key) {
    const fn = runUazapi;
    try {
      const r = (await fn()) as any;
      const normalized: ProviderTestResult = { provider: key, ...r };
      setResults((p) => ({ ...p, [key]: normalized }));
      normalized.ok ? toast.success(normalized.message) : toast.error(normalized.message);
    } catch (e: any) {
      setResults((p) => ({
        ...p,
        [key]: { provider: key, ok: false, step: "error", latencyMs: 0, message: e?.message || "Erro" },
      }));
      toast.error(e?.message || "Falha ao testar");
    }
  }

  async function runOne(key: Key) {
    setLoading(key);
    await test(key);
    setLoading(null);
  }

  async function runAll() {
    setLoading("all");
    await test("dapi");
    setLoading(null);
  }

  const degradedCount = health.filter((p) => p.configured && (!p.ok || p.degraded)).length;
  const uaz = health[0];
  const samples = uaz ? history[uaz.provider] ?? [] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(20px,3vw,26px)] font-display font-bold tracking-tight flex items-center gap-2">
            Monitoramento WhatsApp
            <HelpTip text="Validação contínua da API de WhatsApp, capacidade de conexões e métricas da frota." />
          </h1>
          <p className="text-sm text-muted-foreground">
            Verificação automática a cada 20 segundos.
            {checkedAt && <> · última às {new Date(checkedAt).toLocaleTimeString("pt-BR")}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAuto((v) => !v)}>
            <Activity className={`h-4 w-4 mr-2 ${auto ? "text-emerald-600" : ""}`} />
            {auto ? "Tempo real: ativo" : "Tempo real: pausado"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar
          </Button>
          <Button size="sm" onClick={runAll} disabled={loading !== null}>
            {loading === "all" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
            Testar credenciais
          </Button>
        </div>
      </div>

      {degradedCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <div className="text-[13px]">
            <strong>API instável.</strong> Novas conexões e envios podem falhar enquanto o status não normalizar.
          </div>
        </div>
      )}

      {uaz ? (
        <StatusStrip p={uaz} samples={samples} result={results.dapi} auto={auto} onSaved={() => void refresh()} />
      ) : (
        <Card className="rounded-2xl p-6 text-sm text-muted-foreground">Consultando a API…</Card>
      )}

      <WhatsappFleetPanel fleet={fleet} />
    </div>
  );
}

function StatusStrip({
  p, samples, result, auto, onSaved,
}: { p: ProviderHealth; samples: Sample[]; result?: ProviderTestResult; auto: boolean; onSaved: () => void }) {
  const state = !p.configured ? "off" : !p.ok ? "down" : p.degraded ? "slow" : "up";
  const tone = {
    up: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Operacional", ring: "border-emerald-200" },
    slow: { dot: "bg-amber-500", text: "text-amber-700", label: "Instável", ring: "border-amber-200" },
    down: { dot: "bg-red-500", text: "text-red-700", label: "Fora do ar", ring: "border-red-200" },
    off: { dot: "bg-slate-300", text: "text-slate-500", label: "Não configurado", ring: "border-slate-200" },
  }[state];

  const uptime = samples.length ? Math.round((samples.filter((s) => s.ok).length / samples.length) * 100) : null;
  const avg = samples.length ? Math.round(samples.reduce((a, s) => a + s.latencyMs, 0) / samples.length) : null;

  return (
    <Card className={`rounded-2xl p-5 border bg-white ${tone.ring} space-y-4`}>
      {/* Cabeçalho: status + credenciais */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`size-2.5 rounded-full shrink-0 ${tone.dot} ${auto ? "animate-pulse" : ""}`} />
          <span className="font-semibold text-[15px]">API de WhatsApp</span>
          <Badge variant="outline" className={`text-[10.5px] ${tone.text}`}>{tone.label}</Badge>
          <span className="text-[12px] text-muted-foreground truncate hidden sm:inline">— {p.message}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <PlugZap className="size-3.5 text-muted-foreground" />
          {result ? (
            <>
              {result.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              <span className="font-medium">{result.ok ? "Credenciais válidas" : "Falha nas credenciais"}</span>
              {result.status !== undefined && <Badge variant="outline" className="text-[10px]">HTTP {result.status}</Badge>}
              <Badge variant="outline" className="text-[10px]">{result.latencyMs} ms</Badge>
              <span className="text-muted-foreground hidden md:inline">Token: {result.tokenPreview || "—"}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Use “Testar credenciais” para validar a chave de acesso.</span>
          )}
        </div>
      </div>

      {/* Linha única de métricas */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
        <Metric icon={<Clock className="size-3.5" />} value={p.latencyMs} label="ms agora" tone="text-foreground" />
        <Metric icon={<Activity className="size-3.5" />} value={uptime ?? 0} label="% uptime" tone="text-emerald-600" />
        <Metric icon={<Gauge className="size-3.5" />} value={avg ?? 0} label="ms média" tone="text-sky-600" />
        <Metric icon={<Wifi className="size-3.5" />} value={p.connected} label="Ativas" tone="text-emerald-600" />
        <Metric icon={<Clock className="size-3.5" />} value={p.connecting} label="Conectando" tone="text-amber-600" />
        <Metric icon={<XCircle className="size-3.5" />} value={p.disconnected} label="Caídas" tone="text-red-600" />
        <Metric icon={<PauseCircle className="size-3.5" />} value={p.paused} label="Pausadas" tone="text-slate-500" />
      </div>

      {/* Histórico + capacidade */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px] items-stretch">
        <div className="rounded-xl border bg-muted/30 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
              <Activity className="size-3.5" /> Latência recente (tempo real)
            </span>
            <span className="text-[10.5px] text-muted-foreground break-all text-right">
              {p.url || "URL não configurada"}{p.status !== undefined && ` · HTTP ${p.status}`}
            </span>
          </div>
          <Sparkline samples={samples} />
        </div>
        <CapacityBlock p={p} onSaved={onSaved} />
      </div>
    </Card>
  );
}

function CapacityBlock({ p, onSaved }: { p: ProviderHealth; onSaved: () => void }) {
  const save = useServerFn(setProviderCapacity);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(p.capacity ?? ""));
  const [saving, setSaving] = useState(false);

  const used = p.instancesRemote ?? p.instancesLocal;
  const cap = p.capacity;
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : null;
  const barTone = pct === null ? "bg-slate-300" : pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  async function commit() {
    setSaving(true);
    try {
      const n = Number(value);
      await save({ data: { capacity: { [p.provider]: Number.isFinite(n) && n > 0 ? n : 0 } } });
      toast.success("Capacidade atualizada");
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
          <Gauge className="size-3.5" /> Conexões x capacidade
        </span>
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
              className="h-7 w-16 text-[12px]"
              placeholder="0"
            />
            <button onClick={() => void commit()} disabled={saving} className="text-emerald-600 hover:text-emerald-700" title="Salvar">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </button>
            <button onClick={() => { setEditing(false); setValue(String(p.capacity ?? "")); }} className="text-muted-foreground hover:text-destructive" title="Cancelar">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
            title="Definir limite contratado"
          >
            <Pencil className="size-3" /> limite
          </button>
        )}
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-[18px] font-bold leading-none">{used}</span>
        <span className="text-[12px] text-muted-foreground">/ {cap ?? "—"} conexões</span>
        {pct !== null && <span className="ml-auto text-[11px] font-medium text-muted-foreground">{pct}%</span>}
      </div>

      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${pct ?? 0}%` }} />
      </div>

      <div className="text-[10.5px] text-muted-foreground">
        {cap === undefined
          ? "Limite não informado pela API — defina o valor contratado."
          : p.capacitySource === "provider"
            ? "Limite lido automaticamente do provedor."
            : "Limite definido manualmente."}
        {cap !== undefined && ` · ${Math.max(0, cap - used)} disponível(is)`}
      </div>
    </div>
  );
}


function Metric({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: string }) {
  return (
    <div className="rounded-lg bg-muted/50 py-2">
      <div className={`flex items-center justify-center gap-1 ${tone}`}>{icon}<span className="text-[15px] font-bold">{value}</span></div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function Sparkline({ samples }: { samples: Sample[] }) {
  const last = samples.slice(-24);
  if (!last.length) return <div className="h-8 rounded-md bg-muted/40" />;
  const max = Math.max(...last.map((s) => s.latencyMs), 300);
  return (
    <div className="flex items-end gap-[3px] h-8">
      {last.map((s, i) => (
        <div
          key={i}
          title={`${new Date(s.t).toLocaleTimeString("pt-BR")} — ${s.latencyMs} ms`}
          className={`flex-1 rounded-sm ${s.ok ? "bg-emerald-400" : "bg-red-400"}`}
          style={{ height: `${Math.max(12, (s.latencyMs / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

