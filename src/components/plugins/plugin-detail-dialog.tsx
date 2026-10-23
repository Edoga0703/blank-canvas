import { isPluginFixo } from "@/lib/plugins-fixos";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { StorePlugin } from "@/lib/plugin-store.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GoogleCalendarPanel } from "@/components/plugins/google-calendar-panel";
import { GoogleMeetPanel } from "@/components/plugins/google-meet-panel";
import { GoogleDrivePanel } from "@/components/plugins/google-drive-panel";
import { GoogleSheetsPanel } from "@/components/plugins/google-sheets-panel";
import { WebhooksOutPanel } from "@/components/plugins/webhooks-out-panel";
import { IaResumoPanel } from "@/components/plugins/ia-resumo-panel";
import { IaSentimentoPanel } from "@/components/plugins/ia-sentimento-panel";
import { IaVozPanel } from "@/components/plugins/ia-voz-panel";
import { WebhooksEntradaPanel } from "@/components/plugins/webhooks-entrada-panel";
import { OlistPanel } from "@/components/plugins/olist-panel";
import { IntegracaoPanel } from "@/components/plugins/integracao-panel";
import { SLUGS_INTEGRACAO } from "@/lib/integracoes/catalogo";
import { GoogleMarketingPanel } from "@/components/plugins/google-marketing-panel";
import { Puzzle, Plus, Check, Trash2, ExternalLink, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

/** Plugins que pedem conexão de conta logo após a instalação. */
const PAINEIS: Record<string, () => import("react").ReactNode> = {
  "google-calendar": () => <GoogleCalendarPanel />,
  "google-meet": () => <GoogleMeetPanel />,
  "google-drive": () => <GoogleDrivePanel />,
  "google-sheets": () => <GoogleSheetsPanel />,
  "webhooks-out": () => <WebhooksOutPanel />,
  "ia-resumo": () => <IaResumoPanel />,
  "ia-sentimento": () => <IaSentimentoPanel />,
  "ia-voz": () => <IaVozPanel />,
  "webhooks-entrada": () => <WebhooksEntradaPanel />,
  olist: () => <OlistPanel />,
  ...Object.fromEntries(
    SLUGS_INTEGRACAO.map((slug) => [slug, () => <IntegracaoPanel servico={slug} />]),
  ),
  "google-analytics": () => <GoogleMarketingPanel servico="google-analytics" />,
  "google-ads": () => <GoogleMarketingPanel servico="google-ads" />,
};

export function PluginTile({
  plugin: p,
  busy,
  onOpen,
  onInstall,
  onUninstall,
}: {
  plugin: StorePlugin;
  busy: boolean;
  onOpen: () => void;
  onInstall: () => void;
  onUninstall?: () => void;
}) {
  const cover = p.capa_url || p.icone;
  const emBreve = p.status === "em_breve";
  const [progresso, setProgresso] = useState(0);

  useEffect(() => {
    if (!busy) { setProgresso(0); return; }
    setProgresso(8);
    const t = setInterval(() => {
      setProgresso((v) => (v >= 92 ? 92 : v + Math.max(1, (95 - v) * 0.12)));
    }, 120);
    return () => clearInterval(t);
  }, [busy]);

  return (

    <div className="group flex flex-col h-full">
      <button
        onClick={onOpen}
        style={p.cor_fundo ? { backgroundColor: p.cor_fundo } : undefined}
        className="relative w-full aspect-[1.8/1] rounded-lg border border-border/50 bg-card overflow-hidden grid place-items-center transition-all duration-300 group-hover:shadow-lg group-hover:border-primary/40"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {cover && /^https?:\/\//.test(cover) ? (
          <img
            src={cover}
            alt={p.nome}
            loading="lazy"
            className={`${p.capa_url ? "size-full object-cover" : "size-12 object-contain"} ${emBreve ? "opacity-50 grayscale" : ""}`}
          />
        ) : (
          <div className="size-full grid place-items-center bg-gradient-to-br from-primary/10 to-primary/5">
            <Puzzle className={`size-8 text-primary ${emBreve ? "opacity-50" : ""}`} />
          </div>
        )}
        {p.instalado && !emBreve && (
          <span className="absolute top-2 right-2 size-5 rounded-full bg-emerald-500 text-white grid place-items-center shadow-sm">
            <Check className="size-3" />
          </span>
        )}
        {emBreve && (
          <span className="absolute top-2 left-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/20">
            Em breve
          </span>
        )}
        {p.status === "beta" && (
          <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded bg-background/90 border">beta</span>
        )}
        {busy && (
          <>
            <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] grid place-items-center">
              <span className="text-[11px] font-semibold text-foreground">
                {p.instalado ? "Desinstalando…" : "Instalando…"}
              </span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-muted/60 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-150 ease-out"
                style={{ width: `${progresso}%` }}
              />
            </div>
          </>
        )}
      </button>


      <div className="mt-3 px-0.5 min-w-0">
        <div className="text-[14px] font-semibold text-foreground truncate">{p.nome}</div>
        <div className="mt-1 flex items-center gap-2">
          {emBreve ? (
            <span className="text-[11px] font-semibold text-muted-foreground">Em desenvolvimento</span>
          ) : p.gratuito ? (
            <span className="text-[11px] font-semibold text-emerald-600">Grátis</span>
          ) : (
            <span className="text-[11px] font-semibold text-primary">
              R$ {p.preco_mensal.toFixed(2).replace(".", ",")}/mês
            </span>
          )}
          {p.assinatura_status === "trial" && p.dias_trial_restantes != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-semibold">
              Teste · {p.dias_trial_restantes}d
            </span>
          )}
          {p.assinatura_status === "cancelada" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
              Cancelado
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {emBreve ? (
          <Button
            size="sm"
            variant="secondary"
            className="w-full h-10 text-[14px] font-semibold rounded-md bg-muted/40 text-muted-foreground cursor-not-allowed"
            disabled
          >
            Em breve
          </Button>
        ) : p.instalado ? (
          <>
            {CONFIG_ROUTE[p.slug] ? (
              <Link to={CONFIG_ROUTE[p.slug]!} className="block w-full">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full h-10 text-[14px] font-semibold rounded-md bg-muted/50 hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  {CONFIG_LABEL[p.slug] ?? "Abrir módulo"}
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="w-full h-10 text-[14px] font-semibold rounded-md bg-muted/50 hover:bg-primary hover:text-primary-foreground transition-all"
                onClick={onOpen}
              >
                Detalhes
              </Button>
            )}
            {onUninstall && !isPluginFixo(p.slug) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                className="w-full h-9 text-[13px] font-semibold rounded-md text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); onUninstall(); }}
              >
                {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Trash2 className="size-4 mr-2" />}
                Desinstalar
              </Button>
            )}
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-10 text-[14px] font-bold rounded-md text-foreground border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all bg-background shadow-sm"
            disabled={busy}
            onClick={onInstall}
          >
            {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
            {p.gratuito || p.pago_liberado ? "Instalar" : "Adquirir"}

          </Button>
        )}
      </div>



    </div>
  );
}

const CONFIG_ROUTE: Record<string, string> = {
  "whatsapp-uazapi": "/app/conexao",
  "whatsapp-evolution": "/app/conexao",
  "meta-official-api": "/app/conexao",
  messenger: "/app/conexao",
  instagram: "/app/conexao",
  telegram: "/app/conexao",
  webhooks: "/app/configuracoes",
  "api-publica": "/app/configuracoes",
};

const CONFIG_LABEL: Record<string, string> = {
  "whatsapp-uazapi": "Ir para Conexões",
  "whatsapp-evolution": "Ir para Conexões",
  "meta-official-api": "Ir para Conexões",
  messenger: "Ir para Conexões",
  instagram: "Ir para Conexões",
  telegram: "Ir para Conexões",
  webhooks: "Ir para Configurações",
  "api-publica": "Ir para Configurações",
};


export function PluginDetailDialog({
  plugin,
  busy,
  onClose,
  onInstall,
  onToggle,
  onRemove,
}: {
  plugin: StorePlugin | null;
  busy: boolean;
  onClose: () => void;
  onInstall: (p: StorePlugin) => void;
  onToggle: (p: StorePlugin, ativo: boolean) => void;
  onRemove: (p: StorePlugin) => void;
}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [plugin?.id]);
  if (!plugin) return null;

  const shots = plugin.screenshots ?? [];
  const hero = shots[idx] || plugin.banner_url || plugin.capa_url;
  const route = CONFIG_ROUTE[plugin.slug];

  return (
    <Dialog open={!!plugin} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
        <div className="grid md:grid-cols-[280px_1fr] h-[85vh] md:h-[600px]">
          {/* Lado Esquerdo: Identidade e Ação */}
          <aside className="p-8 bg-muted/20 flex flex-col items-start gap-6 border-r border-border/40">
            <div
              style={plugin.cor_fundo ? { backgroundColor: plugin.cor_fundo } : undefined}
              className="w-full aspect-square rounded-2xl border border-border/50 overflow-hidden grid place-items-center bg-card shadow-sm"
            >
              {plugin.icone && /^https?:\/\//.test(plugin.icone) ? (
                <img src={plugin.icone} alt={plugin.nome} className="size-20 object-contain p-4" />
              ) : (
                <Puzzle className="size-12 text-primary" />
              )}
            </div>
            
            <div className="space-y-2 w-full">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{plugin.nome}</h2>
              <p className="text-sm text-muted-foreground leading-snug">
                {plugin.tagline || plugin.descricao}
              </p>
            </div>

            <div className="w-full pt-4 mt-auto">
              {plugin.instalado ? (
                <div className="space-y-4 w-full">
                  <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border/60">
                    <span className="text-sm font-medium">{plugin.ativo ? "Plugin Ativo" : "Desativado"}</span>
                    <Switch checked={plugin.ativo} disabled={busy} onCheckedChange={(v) => onToggle(plugin, v)} />
                  </div>
                  {route && (
                    <Link to={route} onClick={onClose} className="w-full block">
                      <Button variant="outline" className="w-full rounded-lg h-10 border-primary/20 hover:bg-primary/5 text-primary">
                        {CONFIG_LABEL[plugin.slug] ?? "Abrir módulo"}
                      </Button>
                    </Link>
                  )}

                  {!isPluginFixo(plugin.slug) && (
                    <Button variant="ghost" size="sm" className="w-full text-destructive hover:bg-destructive/5 h-8 mt-2" onClick={() => onRemove(plugin)}>
                      <Trash2 className="size-4 mr-2" /> Desinstalar
                    </Button>
                  )}
                </div>
              ) : plugin.status === "em_breve" ? (
                <Button 
                  className="w-full h-11 text-base font-semibold rounded-xl bg-muted text-muted-foreground cursor-not-allowed" 
                  disabled
                >
                  Em breve
                </Button>
              ) : (
                <Button 
                  className="w-full h-11 text-base font-semibold rounded-xl shadow-lg shadow-primary/20" 
                  disabled={busy} 
                  onClick={() => onInstall(plugin)}
                >
                  {busy ? <Loader2 className="size-5 mr-2 animate-spin" /> : <Plus className="size-5 mr-2" />}
                  {plugin.gratuito || plugin.pago_liberado ? "Instalar" : "Adquirir"}
                </Button>
              )}
              {plugin.status === "em_breve" && (
                <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
                  Integração em desenvolvimento. Avisaremos assim que estiver disponível na sua conta.
                </p>
              )}
              {!plugin.gratuito && plugin.status !== "em_breve" && (
                <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
                  {plugin.pago_liberado
                    ? `Assinatura ativa — R$ ${plugin.preco_mensal.toFixed(2).replace(".", ",")}/mês.`
                    : plugin.assinatura_status === "cancelada"
                      ? "Assinatura cancelada. O acesso segue até o fim do ciclo e seus dados são preservados."
                      : `R$ ${plugin.preco_mensal.toFixed(2).replace(".", ",")}/mês. Ao adquirir, você será levado ao checkout seguro; a instalação é liberada após a confirmação do pagamento.`}
                </p>
              )}

            </div>
          </aside>

          {/* Lado Direito: Visual e Info */}
          <div className="flex flex-col h-full bg-background overflow-hidden">
            <div className="flex-1 p-8 overflow-y-auto space-y-8 scrollbar-hide">
              {/* Carrossel de Imagens Principal */}
              {hero && (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden border border-border/60 bg-muted/30 aspect-video group/hero shadow-inner">
                    <img src={hero} alt={plugin.nome} className="size-full object-cover animate-in fade-in duration-500" />
                    
                    {shots.length > 1 && (
                      <>
                        <button
                          aria-label="Anterior"
                          onClick={() => setIdx((i) => (i - 1 + shots.length) % shots.length)}
                          className="absolute left-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-background/80 backdrop-blur border border-border/50 grid place-items-center opacity-0 group-hover/hero:opacity-100 transition-all hover:bg-background"
                        >
                          <ChevronLeft className="size-5" />
                        </button>
                        <button
                          aria-label="Próxima"
                          onClick={() => setIdx((i) => (i + 1) % shots.length)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-background/80 backdrop-blur border border-border/50 grid place-items-center opacity-0 group-hover/hero:opacity-100 transition-all hover:bg-background"
                        >
                          <ChevronRight className="size-5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Thumbnails */}
                  {shots.length > 1 && (
                    <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {shots.map((s, i) => (
                        <button
                          key={s + i}
                          onClick={() => setIdx(i)}
                          className={`shrink-0 w-32 aspect-[16/10] rounded-xl overflow-hidden border-2 transition-all ${
                            i === idx ? "border-primary ring-2 ring-primary/20" : "border-border/40 opacity-60 hover:opacity-100 hover:border-border"
                          }`}
                        >
                          <img src={s} alt="" className="size-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Descrição e Info Adicional */}
              <div className="space-y-6">
                <div className="space-y-4">
                  {(plugin.descricao_longa || plugin.descricao || "")
                    .split("\n")
                    .filter(Boolean)
                    .map((par, i) => (
                      <p key={i} className="text-[15px] text-muted-foreground leading-relaxed italic">
                        {par}
                      </p>
                    ))}
                </div>

                {/* Footer de Info com links */}
                <div className="pt-6 border-t border-border/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-muted/30 text-[11px] px-2.5 py-0.5 capitalize border-border/60">
                      {plugin.categoria}
                    </Badge>
                    <Badge variant="outline" className="bg-muted/30 text-[11px] px-2.5 py-0.5 border-border/60">
                      Plano {plugin.plano_minimo}
                    </Badge>
                  </div>
                  
                  {plugin.docs_url && (
                    <a
                      href={plugin.docs_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-primary inline-flex items-center gap-1.5 hover:underline"
                    >
                      Saiba mais <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>

                {/* Área de conexão específica do plugin */}
                {plugin.instalado && PAINEIS[plugin.slug] && (
                  <div className="p-4 bg-muted/20 rounded-2xl border border-dashed border-border/80">
                    {PAINEIS[plugin.slug]!()}
                  </div>
                )}
                {/* Canais Meta/WhatsApp: configuração é feita no módulo Conexões */}

              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
