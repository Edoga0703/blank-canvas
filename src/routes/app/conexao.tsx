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
import { MessengerGlyph, WhatsAppGlyph, TelegramGlyph } from "@/components/ui/channel-icons";
import { brand } from "@/config/brand";
import {
  connectWhatsapp, checkWhatsappStatus, disconnectWhatsapp, deleteWhatsapp,
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
  evolution: "WhatsApp Web",
  uazapi: "WhatsApp Premium",
  official: "WhatsApp Oficial",
  meta: "Meta (FB/IG)",
  telegram: "Telegram",
};

function ConexoesPage() {
  const connect = useServerFn(connectWhatsapp);
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
  const [initialProvider, setInitialProvider] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "connecting" | "disconnected" | "paused">("all");
  const [qrDialog, setQrDialog] = useState<{ instanceName: string; qr: string | null } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void refresh();
    void loadPlugins();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    const anyPending = instances.some((i) => i.status !== "connected");
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
          canal: i.provider === "meta_instagram" ? "instagram" : i.provider === "meta_messenger" ? "messenger" : i.provider === "telegram" ? "telegram" : null
        };
      });
      setInstances(list);
      for (const inst of list) {
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

  async function doCreate(displayName: string, provider?: "evolution" | "uazapi") {
    setCreating(true);
    try {
      const r: any = await connect({ data: { instanceName: null, createNew: true, displayName, provider: provider ?? null } });
      if (r?.error) { toast.error(r.error); return; }
      const instanceName = r?.instanceName as string;
      if (instanceName) {
        if (r?.qrBase64) setQrByInstance((prev) => ({ ...prev, [instanceName]: r.qrBase64 }));
        // Batched: fecha o popup de "Nova Conexão" e abre o de QR no mesmo render.
        setQrDialog({ instanceName, qr: r?.qrBase64 ?? null });
        setNewConnOpen(false);
      }
      // refresh em background para não atrasar a abertura do QR
      void plan.refresh();
      void refresh(true);
    } catch (e: any) { toast.error(e?.message || "Falha ao criar conexão"); }
    finally { setCreating(false); }
  }

  async function doReconnect(inst: Instance) {
    setBusy(inst.instance_name);
    try {
      const r: any = await connect({ data: { instanceName: inst.instance_name, createNew: false } });
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
      toast.success("Webhook reconfigurado.");
    } catch (e: any) { toast.error(e?.message || "Falha ao reconfigurar webhook"); }
    finally { setBusy(null); }
  }




  // Nome exibido = nome do plugin instalado (cadastrado na Loja de Plugins)
  function pluginName(slug: string, fallback: string) {
    return plugins.find((p) => p.slug === slug)?.nome || fallback;
  }
  const PROVIDER_SLUG: Record<string, string> = {
    evolution: "whatsapp-evolution",
    uazapi: "whatsapp-uazapi",
    telegram: "telegram",
    meta_instagram: "instagram",
    meta_messenger: "messenger",
    official: "meta-official-api",
  };
  function providerLabel(provider?: string | null) {
    const key = provider || "evolution";
    const slug = PROVIDER_SLUG[key];
    return (slug ? pluginName(slug, PROVIDER_LABEL[key] || "WhatsApp Web") : PROVIDER_LABEL[key]) || "WhatsApp Web";
  }

  const FREE_KEYS = ["instagram", "messenger", "telegram", "uazapi"];
  const WA_KEYS = ["evolution", "uazapi", "official"];
  const waInstances = instances.filter((i) => WA_KEYS.includes((i.provider ?? "evolution") as string) || i.provider_type === "oficial_meta");
  const waUsed = waInstances.length;
  const waLimit = plan.limites.instancias;
  const canAddWa = waLimit >= 2147483647 || waUsed < waLimit;
  const waProviderAtivo = (waInstances[0]?.provider ?? null) as string | null;
  // Exclusividade Evolution ↔ Uazapi só vale em planos de 1 conexão.
  // Com limite maior que 1, o cliente pode usar as duas APIs ao mesmo tempo.
  const exclusivo = waLimit <= 1;
  const bloqueadoPor = (key: string) =>
    exclusivo && WA_KEYS.includes(key) && waProviderAtivo && waProviderAtivo !== key
      ? waProviderAtivo === "uazapi" ? "WhatsApp Premium" : waProviderAtivo === "evolution" ? "WhatsApp Web" : "outra conexão"
      : null;
  const canAddChannel = (key: string) => (FREE_KEYS.includes(key) ? true : canAddWa && !bloqueadoPor(key));
  const canAdd = canAddWa;


  // Só aparece em Conexões o plugin realmente instalado, ativo, liberado e publicado.
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
      key: "uazapi",
      title: pluginName("whatsapp-uazapi", "WhatsApp"),
      icon: <WhatsAppGlyph className="size-6 text-emerald-500" />,
      // inclui conexões antigas (evolution) para não sumirem da lista
      match: (i) => (i.provider ?? "uazapi") === "uazapi" || i.provider === "evolution",
      onIntegrate: () => { setInitialProvider("uazapi"); setNewConnOpen(true); },
      multi: true,
    },
  ];


  if (pluginAtivo("telegram")) channels.push({
    key: "telegram",
    title: pluginName("telegram", "Telegram"),
    icon: <TelegramGlyph className="size-6 text-[#229ED9]" />,
    match: (i) => i.provider === "telegram",
    onIntegrate: () => setTelegramOpen(true),
    multi: true,
  });

  // Instagram Business e Facebook temporariamente fora do módulo de Conexões
  // (canais ainda não liberados para uso pelos clientes).


  if (pluginAtivo("meta-official-api")) channels.push({
    key: "official",
    title: pluginName("meta-official-api", "WhatsApp API Oficial (Meta)"),
    icon: <WhatsAppGlyph className="size-6 text-[#25D366]" />,
    match: (i) => i.provider === "official" || i.provider_type === "oficial_meta",
    onIntegrate: () => { setInitialProvider("oficial_meta"); setNewConnOpen(true); },
    multi: true,
  });



  const totalConectadas = instances.filter((i) => i.status === "connected").length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 px-0 sm:px-4">

        {/* Título + subtítulo */}
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

        {/* Busca (só quando há muitas contas) */}
        {instances.length > 3 && (
          <div className="relative w-full sm:max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conta..." className="pl-9 h-9" />
          </div>
        )}

        {/* Cards de canal — cada card carrega suas próprias contas */}
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
                      {bloqueadoPor(ch.key) && accounts.length === 0
                        ? `Bloqueado — você já usa ${bloqueadoPor(ch.key)}`
                        : accounts.length === 0
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
                      return (
                        <div key={inst.instance_name} className="bg-muted/20">
                          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                            <button className="flex items-center gap-2 min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : inst.instance_name)}>
                              <span className="text-sm font-medium truncate">{inst.display_name || inst.numero || "Nova conexão"}</span>
                              <StatusBadge status={inst.status} paused={inst.paused} />
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <IconAction tip="Reconectar / Gerar QR" onClick={() => doReconnect(inst)} disabled={isBusy}>
                                <QrCode className="size-4" />
                              </IconAction>
                              <IconAction tip={inst.paused ? "Retomar" : "Pausar"} onClick={() => doTogglePause(inst)} disabled={isBusy || inst.status !== "connected"}>
                                {inst.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                              </IconAction>
                              {inst.status === "connected" && (
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
                              <DetailRow label="Status" value={inst.status} />
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
            {exclusivo
              ? "Seu plano permite 1 conexão de WhatsApp."
              : "Você atingiu o limite de conexões WhatsApp do seu plano."}
          </p>
        )}

        {/* Retorno do login da Meta — as contas aparecem nos cards dos plugins */}
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
          onCreateEvolution={async (displayName) => {
            await doCreate(displayName, "evolution");
          }}
          onCreateUazapi={async (displayName) => {
            await doCreate(displayName, "uazapi");
          }}
          onStartOficialMeta={async () => {
            setCreating(true);
            try {
              const { startWablastOnboarding } = await import("@/lib/wablast.functions");
              const redirectUri = `${window.location.origin}/wa/callback`;
              const sess = await startWablastOnboarding({ data: { redirectUri } });
              setNewConnOpen(false);
              window.location.href = sess.embed_url;
            } catch (e: any) {
              toast.error(e?.message || "Falha ao iniciar conexão oficial");
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
  if (status === "connecting") return <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 gap-1.5"><Loader2 className="size-3 animate-spin" /> Conectando</Badge>;
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
          onClick={(e) => { e.stopPropagation(); onClick(); }}
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
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}
