import { createFileRoute } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Loader2, Power, QrCode, Trash2, Pause, Play,
  Plus, ChevronDown, ChevronRight, Search, WifiOff,
  Plug,
} from "lucide-react";
import { InstagramGlyph, MessengerGlyph, WhatsAppGlyph, TelegramGlyph } from "@/components/ui/channel-icons";
import { brand } from "@/config/brand";
import { betaConfig } from "@/config/beta";
import {
  connectWhatsapp, connectDapiOfficial, checkWhatsappStatus, disconnectWhatsapp, deleteWhatsapp,
  reconfigureWebhook, listWhatsappInstances,
  setWhatsappPaused,
} from "@/lib/evolution.functions";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { PlanUsageBadge } from "@/components/plan-usage-badge";
import { NovaConexaoDialog } from "@/components/conexao/nova-conexao-dialog";
import { QrCodeDialog } from "@/components/conexao/qr-code-dialog";
import { MetaOAuthHandler } from "@/components/conexao/meta-oauth-handler";
import { listStorePlugins } from "@/lib/plugin-store.functions";
import { TelegramConnectDialog } from "@/components/conexao/telegram-connect-dialog";
import { MetaConnectDialog } from "@/components/conexao/meta-connect-dialog";

export const Route = createFileRoute("/app/conexao")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search?.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({ meta: [{ title: `${brand.name} — Conexões` }] }),
  component: ConexoesPage,
});

type Instance = {
  instance_name: string;
  display_name?: string | null;
  status: string;
  numero: string | null;
  updated_at?: string;
  paused?: boolean;
  provider?: string | null;
  provider_type?: string | null;
  canal?: string | null;
};

const PROVIDER_LABEL: Record<string, string> = {
  dapi: "WhatsApp (D-API)",
  dapi_official: "WhatsApp Oficial Meta (D-API)",
  official: "WhatsApp Oficial Meta (D-API)",
  meta_instagram: "Instagram Direct",
  meta_messenger: "Facebook Messenger",
  telegram: "Telegram",
};

function ConexoesPage() {
  const connect = useServerFn(connectWhatsapp);
  const connectOfficial = useServerFn(connectDapiOfficial);
  const check = useServerFn(checkWhatsappStatus);
  const disconnect = useServerFn(disconnectWhatsapp);
  const removeInstance = useServerFn(deleteWhatsapp);
  const reconfWebhook = useServerFn(reconfigureWebhook);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [metaDialog, setMetaDialog] = useState<"facebook" | "instagram" | null>(null);
  const setPaused = useServerFn(setWhatsappPaused);
  const listInstances = useServerFn(listWhatsappInstances);

  const plan = usePlanFeatures();
  const listPlugins = useServerFn(listStorePlugins);

  const [instances, setInstances] = useState<Instance[]>([]);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [qrByInstance, setQrByInstance] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newConnOpen, setNewConnOpen] = useState(false);
  const [initialProvider, setInitialProvider] = useState<"dapi" | "oficial_meta" | null>(null);
  const [search, setSearch] = useState("");
  const [qrDialog, setQrDialog] = useState<{ instanceName: string; qr: string | null } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const routeSearch = Route.useSearch();

  useEffect(() => {
    void refresh();
    void loadPlugins();
    if (routeSearch?.tab === "instagram") setMetaDialog("instagram");
    else if (routeSearch?.tab === "facebook" || routeSearch?.tab === "messenger") setMetaDialog("facebook");
    else if (routeSearch?.tab === "telegram") setTelegramOpen(true);
    else if (routeSearch?.tab === "whatsapp") { setInitialProvider(null); setNewConnOpen(true); }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [routeSearch?.tab]);

  useEffect(() => {
    const anyPending = instances.some(
      (i) => i.status !== "connected" && i.provider === "dapi",
    );
    if (anyPending) {
      if (!pollRef.current) pollRef.current = setInterval(() => { void refresh(true); }, 5000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [instances]);

  async function loadPlugins() {
    try {
      const p = await listPlugins();
      setPlugins(p);
    } catch {}
  }

  async function refresh(silent = false) {
    try {
      const listed: any = await listInstances();
      const list: Instance[] = (listed?.instances ?? []).map((i: any) => {
        const status = i.status === "expired" ? "disconnected" : i.status;
        return {
          ...i,
          status,
          canal:
            i.provider === "meta_instagram"
              ? "instagram"
              : i.provider === "meta_messenger"
                ? "messenger"
                : i.provider === "telegram"
                  ? "telegram"
                  : "whatsapp",
        };
      });
      setInstances(list);
      for (const inst of list) {
        if (inst.provider !== "dapi") continue;
        if (inst.status !== "connected") {
          try {
            const r: any = await check({ data: { instanceName: inst.instance_name } });
            if (r?.qrBase64) setQrByInstance((prev) => ({ ...prev, [inst.instance_name]: r.qrBase64 }));
            if (r?.status === "connected") setQrByInstance((prev) => ({ ...prev, [inst.instance_name]: null }));
          } catch {}
        } else {
          setQrByInstance((prev) => ({ ...prev, [inst.instance_name]: null }));
        }
      }
    } catch (e: any) { if (!silent) toast.error(e?.message || "Erro ao carregar conexões"); }
  }

  async function doCreate(displayName: string) {
    setCreating(true);
    try {
      const r: any = await connect({ data: { instanceName: null, createNew: true, displayName, provider: "dapi" } });
      if (r?.error) { toast.error(r.error); return; }
      const instanceName = r?.instanceName as string;
      if (instanceName) {
        if (r?.qrBase64) setQrByInstance((prev) => ({ ...prev, [instanceName]: r.qrBase64 }));
        setQrDialog({ instanceName, qr: r?.qrBase64 ?? null });
        setNewConnOpen(false);
      }
      void plan.refresh();
      void refresh(true);
    } catch (e: any) { toast.error(e?.message || "Falha ao criar conexão"); }
    finally { setCreating(false); }
  }

  async function doReconnect(inst: Instance) {
    if (inst.provider === "dapi_official" || inst.provider_type === "dapi_official") {
      await doReconfWebhook(inst);
      return;
    }
    setBusy(inst.instance_name);
    try {
      const r: any = await connect({ data: { instanceName: inst.instance_name, createNew: false, provider: "dapi" } });
      if (r?.qrBase64) setQrByInstance((prev) => ({ ...prev, [inst.instance_name]: r.qrBase64 }));
      setQrDialog({ instanceName: inst.instance_name, qr: r?.qrBase64 ?? null });
      await refresh(true);
    } catch (e: any) { toast.error(e?.message || "Falha ao reconectar"); }
    finally { setBusy(null); }
  }

  async function doTogglePause(inst: Instance) {
    setBusy(inst.instance_name);
    try {
      await setPaused({ data: { instanceName: inst.instance_name, paused: !inst.paused } });
      await refresh(true);
      toast.success(inst.paused ? "Conexão retomada" : "Conexão pausada — a IA não vai responder");
    } catch (e: any) { toast.error(e?.message || "Falha ao pausar"); }
    finally { setBusy(null); }
  }

  async function doDisconnect(inst: Instance) {
    if (!confirm(`Desconectar "${inst.numero || inst.instance_name}"?`)) return;
    setBusy(inst.instance_name);
    try {
      await disconnect({ data: { instanceName: inst.instance_name } });
      await refresh(true);
      toast.success("Desconectado");
    } catch (e: any) { toast.error(e?.message || "Falha ao desconectar"); }
    finally { setBusy(null); }
  }

  async function doDelete(inst: Instance) {
    if (!confirm("Excluir conexão? A instância será removida e você precisará reconectar.")) return;
    setBusy(inst.instance_name);
    try {
      if ((inst.provider ?? "").startsWith("meta_")) {
        const { disconnectMetaChannel } = await import("@/lib/meta.functions");
        await disconnectMetaChannel({ data: { instanceName: inst.instance_name } } as any);
      } else {
        await removeInstance({ data: { instanceName: inst.instance_name } });
      }
      await refresh(true);
      await plan.refresh();
      if (expanded === inst.instance_name) setExpanded(null);
      toast.success("Conexão excluída");
    } catch (e: any) { toast.error(e?.message || "Falha ao excluir conexão"); }
    finally { setBusy(null); }
  }

  async function doReconfWebhook(inst: Instance) {
    setBusy(inst.instance_name);
    try {
      await reconfWebhook({ data: { instanceName: inst.instance_name } as any });
      toast.success("Webhook D-API sincronizado.");
    } catch (e: any) { toast.error(e?.message || "Falha ao sincronizar webhook"); }
    finally { setBusy(null); }
  }

  function pluginName(slug: string, fallback: string) {
    return plugins.find((p) => p.slug === slug)?.nome || fallback;
  }

  const FREE_KEYS = ["instagram", "messenger", "telegram"];
  const WA_KEYS = ["dapi", "dapi_official"];
  const waInstances = instances.filter((i) => WA_KEYS.includes((i.provider ?? "dapi") as string));
  const waUsed = waInstances.length;
  const waLimit = plan.limites.instancias;
  const canAddWa = waLimit >= 2147483647 || waUsed < waLimit;
  const canAddChannel = (key: string) => (FREE_KEYS.includes(key) ? true : canAddWa);
  const canAdd = canAddWa;

  const pluginAtivo = (slug: string) =>
    plugins.some(
      (p) => p.slug === slug && p.instalado && p.ativo && p.liberado !== false && p.status === "ativo",
    );

  type Channel = {
    key: string;
    title: string;
    icon: React.ReactNode;
    match: (i: Instance) => boolean;
    onIntegrate: () => void;
    multi?: boolean;
  };

  const channels: Channel[] = [
    {
      key: "dapi",
      title: "WhatsApp (D-API)",
      icon: <WhatsAppGlyph className="size-6 text-emerald-500" />,
      match: (i) => {
        const p = i.provider ?? i.provider_type ?? "dapi";
        const officialCardSeparate = pluginAtivo("meta-official-api");
        if (officialCardSeparate && (p === "dapi_official" || p === "official" || i.provider_type === "oficial_meta")) {
          return false;
        }
        return p === "dapi" || p === "dapi_official";
      },
      onIntegrate: () => { setInitialProvider("dapi"); setNewConnOpen(true); },
      multi: true,
    },
  ];

  if (pluginAtivo("telegram")) {
    channels.push({
      key: "telegram",
      title: pluginName("telegram", "Telegram"),
      icon: <TelegramGlyph className="size-6 text-[#229ED9]" />,
      match: (i) => i.provider === "telegram",
      onIntegrate: () => setTelegramOpen(true),
      multi: true,
    });
  }

  if (betaConfig.metaChannelsEnabled) {
    channels.push({
      key: "instagram",
      title: pluginName("instagram", "Instagram Direct"),
      icon: <InstagramGlyph className="size-6 text-[#E4405F]" />,
      match: (i) => i.provider === "meta_instagram",
      onIntegrate: () => setMetaDialog("instagram"),
      multi: true,
    });
    channels.push({
      key: "messenger",
      title: pluginName("messenger", "Facebook Messenger"),
      icon: <MessengerGlyph className="size-6 text-[#0084FF]" />,
      match: (i) => i.provider === "meta_messenger",
      onIntegrate: () => setMetaDialog("facebook"),
      multi: true,
    });
  }

  if (pluginAtivo("meta-official-api")) {
    channels.push({
      key: "official",
      title: pluginName("meta-official-api", "WhatsApp API Oficial (D-API Meta)"),
      icon: <WhatsAppGlyph className="size-6 text-[#25D366]" />,
      match: (i) => i.provider === "dapi_official" || i.provider_type === "dapi_official",
      onIntegrate: () => { setInitialProvider("oficial_meta"); setNewConnOpen(true); },
      multi: true,
    });
  }

  const totalConectadas = instances.filter((i) => i.status === "connected").length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 px-0 sm:px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              Conexões <HelpTip text="Cada card é um canal. Ao conectar, a conta aparece dentro do próprio card." />
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {totalConectadas > 0 ? `${totalConectadas} conta(s) conectada(s)` : "Nenhuma conta conectada ainda."}
            </p>
          </div>
          {!plan.loading && (
            <div className="hidden sm:block">
              <PlanUsageBadge label="conexões WhatsApp" used={waUsed} limit={waLimit} />
            </div>
          )}
        </div>

        {instances.length > 3 && (
          <div className="relative w-full sm:max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conta..." className="pl-9 h-9" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {channels.map((ch) => {
            const accounts = instances.filter(ch.match).filter((i) => {
              if (!search) return true;
              const q = search.toLowerCase();
              return (i.numero || "").toLowerCase().includes(q) || (i.display_name || "").toLowerCase().includes(q) || i.instance_name.toLowerCase().includes(q);
            });
            const connected = accounts.some((a) => a.status === "connected");
            return (
              <Card key={ch.key} className={`overflow-hidden transition-colors ${connected ? "border-emerald-500/40" : ""}`}>
                <div className="flex items-center gap-3 p-4">
                  <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${connected ? "bg-emerald-500/10" : "bg-muted"}`}>
                    {ch.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{ch.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {accounts.length === 0
                        ? FREE_KEYS.includes(ch.key) ? "Nenhuma conta · grátis" : "Nenhuma conta"
                        : `${accounts.length} conta${accounts.length > 1 ? "s" : ""}`}
                    </div>
                  </div>
                  {accounts.length === 0 ? (
                    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={ch.onIntegrate} disabled={!canAddChannel(ch.key)}>
                      <Plug className="size-3.5" /> Integrar
                    </Button>
                  ) : ch.multi && canAddChannel(ch.key) ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="size-8" onClick={ch.onIntegrate}>
                          <Plus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Adicionar outra conta</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>

                {accounts.length > 0 && (
                  <div className="divide-y border-t">
                    {accounts.map((inst) => {
                      const isBusy = busy === inst.instance_name;
                      const isOpen = expanded === inst.instance_name;
                      const isOfficial = inst.provider === "dapi_official" || inst.provider_type === "dapi_official";
                      return (
                        <div key={inst.instance_name} className="bg-muted/20">
                          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                            <button className="flex items-center gap-2 min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : inst.instance_name)}>
                              <span className="text-sm font-medium truncate">{inst.display_name || inst.numero || "Nova conexão"}</span>
                              <StatusBadge status={inst.status} paused={inst.paused} />
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {isOfficial ? (
                                <IconAction tip="Sincronizar Webhook Oficial" onClick={() => doReconfWebhook(inst)} disabled={isBusy}>
                                  <Plug className="size-4" />
                                </IconAction>
                              ) : inst.provider === "dapi" ? (
                                <IconAction tip="Reconectar / Gerar QR" onClick={() => doReconnect(inst)} disabled={isBusy}>
                                  <QrCode className="size-4" />
                                </IconAction>
                              ) : null}
                              <IconAction tip={inst.paused ? "Retomar" : "Pausar"} onClick={() => doTogglePause(inst)} disabled={isBusy || inst.status !== "connected"}>
                                {inst.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                              </IconAction>
                              {inst.status === "connected" && (inst.provider === "dapi" || isOfficial) && (
                                <IconAction tip="Desconectar" onClick={() => doDisconnect(inst)} disabled={isBusy}>
                                  <Power className="size-4" />
                                </IconAction>
                              )}
                              <IconAction tip="Excluir conexão" onClick={() => doDelete(inst)} disabled={isBusy} destructive>
                                <Trash2 className="size-4" />
                              </IconAction>
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => setExpanded(isOpen ? null : inst.instance_name)}>
                                {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              </Button>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="grid grid-cols-2 gap-3 px-4 pb-4 text-sm border-t pt-3">
                              <DetailRow label="Nome" value={inst.display_name || "—"} />
                              <DetailRow label="Número" value={inst.numero || "—"} />
                              <DetailRow label="Provedor" value={PROVIDER_LABEL[inst.provider || "dapi"] || "D-API"} />
                              <DetailRow label="Última atualização" value={inst.updated_at ? new Date(inst.updated_at).toLocaleString() : "—"} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {!canAdd && (
          <p className="text-xs text-muted-foreground text-center">
            {waLimit <= 1
              ? "Seu plano permite 1 conexão de WhatsApp."
              : "Você atingiu o limite de conexões WhatsApp do seu plano."}
          </p>
        )}

        <MetaOAuthHandler onConnected={() => void refresh()} />

        <MetaConnectDialog
          open={!!metaDialog}
          mode={metaDialog ?? "facebook"}
          onOpenChange={(v) => { if (!v) setMetaDialog(null); }}
        />

        <TelegramConnectDialog
          open={telegramOpen}
          onOpenChange={setTelegramOpen}
          onConnected={() => void refresh()}
        />

        <NovaConexaoDialog
          open={newConnOpen}
          onOpenChange={(v) => {
            setNewConnOpen(v);
            if (!v) setInitialProvider(null);
          }}
          initialProvider={initialProvider}
          creating={creating}
          onCreateDapi={async (displayName) => {
            await doCreate(displayName);
          }}
          onCreateDapiOfficial={async (params) => {
            setCreating(true);
            try {
              await connectOfficial({ data: params });
              setNewConnOpen(false);
              await refresh(true);
              await plan.refresh();
              toast.success("WhatsApp Oficial (Meta Cloud API) conectado via D-API!");
            } catch (e: any) {
              toast.error(e?.message || "Falha ao conectar WhatsApp Oficial");
            } finally {
              setCreating(false);
            }
          }}
        />

        <QrCodeDialog
          open={!!qrDialog}
          instanceName={qrDialog?.instanceName ?? null}
          initialQr={qrDialog?.qr ?? null}
          onOpenChange={(v) => { if (!v) setQrDialog(null); }}
          onConnected={() => { void refresh(true); void plan.refresh(); }}
        />
      </div>
    </TooltipProvider>
  );
}

function StatusBadge({ status, paused }: { status: string; paused?: boolean }) {
  if (paused) return <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1.5"><Pause className="size-3" /> Pausada</Badge>;
  if (status === "connected") return <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1.5"><span className="size-1.5 rounded-full bg-white animate-pulse" /> Conectado</Badge>;
  if (status === "connecting" || status === "pending") return <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 gap-1.5"><Loader2 className="size-3 animate-spin" /> {status === "pending" ? "Esperando evento" : "Conectando"}</Badge>;
  return <Badge variant="outline" className="gap-1.5"><WifiOff className="size-3" /> Desconectado</Badge>;
}

function IconAction({ children, tip, onClick, disabled, destructive }: { children: React.ReactNode; tip: string; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`size-8 ${destructive ? "text-destructive hover:text-destructive hover:bg-destructive/10" : ""}`}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}
