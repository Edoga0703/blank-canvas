import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listStorePlugins,
  installPlugin,
  setPluginAtivo,
  uninstallPlugin,
  type StorePlugin,
} from "@/lib/plugin-store.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { brand } from "@/config/brand";
import { toast } from "sonner";
import { Loader2, Puzzle, Search, Lock, SlidersHorizontal, Lightbulb } from "lucide-react";
import { PluginBanners } from "@/components/plugins/plugin-banners";
import { listPluginBanners, type PluginBanner } from "@/lib/plugin-banners.functions";
import { suggestPlugin } from "@/lib/plugin-suggestions.functions";
import { PluginTile, PluginDetailDialog } from "@/components/plugins/plugin-detail-dialog";
import { invalidateCapacidades } from "@/hooks/use-capacidades";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


export const Route = createFileRoute("/app/plugins")({
  head: () => ({
    meta: [
      { title: `Plugins — ${brand.name}` },
      { name: "description", content: "Loja de plugins: instale e ative integrações no seu CRM." },
      { property: "og:title", content: `Plugins — ${brand.name}` },
      { property: "og:description", content: "Instale integrações no seu CRM em um clique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PluginsStorePage,
});

const CATS = [
  "todos",
  "canal",
  "automacao",
  "produtividade",
  "comercial",
  "ecommerce",
  "financeiro",
  "marketing",
  "ia",
  "integracao",
];

const CATEGORIA_LABELS: Record<string, string> = {
  canal: "Canais",
  ia: "Inteligência Artificial",
  automacao: "Automação",
  comercial: "Comercial",
  marketing: "Marketing",
  financeiro: "Financeiro",
  produtividade: "Produtividade",
  ecommerce: "E-commerce",
  integracao: "Integrações",
};



function PluginsStorePage() {
  const list = useServerFn(listStorePlugins);
  const listBanners = useServerFn(listPluginBanners);
  const install = useServerFn(installPlugin);
  const toggle = useServerFn(setPluginAtivo);
  const remove = useServerFn(uninstallPlugin);
  const suggest = useServerFn(suggestPlugin);

  const [items, setItems] = useState<StorePlugin[]>([]);
  const [banners, setBanners] = useState<PluginBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("todos");
  const [soInstalados, setSoInstalados] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestForm, setSuggestForm] = useState({ titulo: "", descricao: "" });
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<StorePlugin | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const next = await list();
      setItems(next);
      setDetail((d) => (d ? next.find((x) => x.id === d.id) ?? null : null));
      setErro(null);
      try { setBanners(await listBanners()); } catch { /* banners opcionais */ }
    } catch (e: any) {
      if (!silent) setErro(e?.message || "Erro ao carregar");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);



  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter((p) => {
        if (soInstalados && !p.instalado) return false;
        if (cat !== "todos" && p.categoria !== cat) return false;
        if (!s) return true;
        return `${p.nome} ${p.slug} ${p.descricao ?? ""}`.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        const ab = a.status === "em_breve" ? 1 : 0;
        const bb = b.status === "em_breve" ? 1 : 0;
        return ab - bb || a.ordem - b.ordem;
      });
  }, [items, q, cat, soInstalados]);

  const instalados = items.filter((p) => p.instalado).length;

  async function doInstall(p: StorePlugin) {
    setBusy(p.id);
    try {
      const r: any = await install({ data: { pluginId: p.id } });
      if (r?.requiresCheckout) {
        const url = r.checkoutUrl || p.checkout_url;
        if (!url) {
          toast.error("Checkout indisponível. Fale com o suporte para contratar este plugin.");
          return;
        }
        window.open(url, "_blank", "noopener");
        toast.info("Finalize o pagamento. A instalação é liberada automaticamente após a confirmação.");
        return;
      }
      // atualização otimista: sem recarregar a página
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, instalado: true, ativo: true } : x)));
      setDetail((d) => (d && d.id === p.id ? { ...d, instalado: true, ativo: true } : d));
      toast.success(`${p.nome} instalado`);
      invalidateCapacidades();
      void load(true);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(null); }
  }


  async function doToggle(p: StorePlugin, ativo: boolean) {
    setBusy(p.id);
    try {
      await toggle({ data: { pluginId: p.id, ativo } });
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, ativo } : x)));
      setDetail((d) => (d && d.id === p.id ? { ...d, ativo } : d));
      invalidateCapacidades();
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(null); }
  }

  async function doRemove(p: StorePlugin) {
    if (!confirm(`Desinstalar ${p.nome}? O plugin será removido da sua conta.`)) return;
    setBusy(p.id);
    try {
      await remove({ data: { pluginId: p.id } });
      setItems((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? { ...x, instalado: false, ativo: false, assinatura_status: null as any, dias_trial_restantes: null as any }
            : x,
        ),
      );
      setDetail(null);
      toast.success(`${p.nome} desinstalado`);
      invalidateCapacidades();
      void load(true);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(null); }
  }



  if (erro) {
    return (
      <Card className="p-10 text-center max-w-md mx-auto mt-10">
        <Lock className="size-8 mx-auto mb-3 text-muted-foreground/60" />
        <div className="font-semibold mb-1">Módulo interno</div>
        <p className="text-sm text-muted-foreground">{erro}</p>
      </Card>
    );
  }

  const grupos = useMemo(() => {
    const map = new Map<string, StorePlugin[]>();
    for (const p of filtered) {
      const k = p.categoria || "integracao";
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    const PRIORIDADE = ["canal", "ia", "automacao", "comercial", "marketing", "financeiro", "produtividade", "ecommerce", "integracao"];
    return [...map.entries()].sort((a, b) => {
      const ia = PRIORIDADE.indexOf(a[0]); const ib = PRIORIDADE.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
    });
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Loja de Plugins</h1>
        <p className="text-sm text-muted-foreground">Turbine seu CRM com novas funcionalidades e integrações.</p>
      </div>


      <PluginBanners
        banners={banners}
        onSelect={(b) => {
          const p = items.find((x) => x.id === b.plugin_id);
          if (p) setDetail(p);
          else if (b.link_url) window.open(b.link_url, "_blank", "noopener");
        }}
      />



      {/* Barra de Busca e Filtros - Nova Abordagem com Popover/Dropdown de Filtros */}
      <div className="-mx-1 px-4 py-4 bg-background border-b border-border/40 space-y-4">
        <div className="flex items-center gap-2 max-w-full">
          <div className="relative flex-1 group">
            <Search className="size-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="O que você deseja integrar ao seu CRM hoje?"
              className="pl-12 h-12 text-base bg-muted/20 border-none rounded-xl focus-visible:ring-2 focus-visible:ring-primary/20 transition-all hover:bg-muted/40"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className={`h-12 px-4 rounded-xl transition-all font-medium ${soInstalados ? "bg-primary/10 text-primary border-primary/20" : "bg-muted/20 border-none hover:bg-muted/40"}`}
              onClick={() => setSoInstalados((v) => !v)}
            >
              Instalados
              <Badge variant="secondary" className="ml-2">{instalados}</Badge>
            </Button>

            <Button
              variant="outline"
              size="icon"
              className={`h-12 w-12 rounded-xl transition-all ${showFilters ? "bg-primary/10 text-primary border-primary/20" : "bg-muted/20 border-none hover:bg-muted/40"}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="size-5" />
            </Button>


            <Button
              variant="outline"
              className="h-12 px-4 rounded-xl bg-muted/20 border-none hover:bg-muted/40 gap-2 font-medium"
              onClick={() => setShowSuggest(true)}
            >
              <Lightbulb className="size-4 text-amber-500" />
              <span className="hidden sm:inline">Sugerir Integração</span>
            </Button>
          </div>

          <div className="relative">

            {showFilters && (
              <div className="absolute right-0 top-full mt-2 w-64 p-4 bg-background border border-border shadow-2xl rounded-2xl z-50 animate-in fade-in zoom-in-95 duration-200">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filtrar Categoria</span>
                    <button 
                      onClick={() => { setCat("todos"); setShowFilters(false); }}
                      className="text-[10px] text-primary hover:underline font-medium"
                    >
                      Limpar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {CATS.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setCat(c);
                          setShowFilters(false);
                        }}
                        className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          cat === c
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <span className="capitalize">{c === "todos" ? "Todos os Plugins" : c}</span>
                        {cat === c && <div className="ml-auto size-1.5 rounded-full bg-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Overlay para fechar filtros ao clicar fora */}
        {showFilters && (
          <div 
            className="fixed inset-0 z-40 bg-transparent" 
            onClick={() => setShowFilters(false)} 
          />
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-16 text-center text-sm text-muted-foreground bg-muted/5 border-dashed">
          <Puzzle className="size-12 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-base font-medium text-foreground mb-1">Nada por aqui ainda</h3>
          <p>Tente buscar por termos diferentes ou explore as categorias.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {grupos.map(([categoria, plugins]) => (
            <section key={categoria} className="space-y-3">
              <h2 className="text-lg font-semibold capitalize">{CATEGORIA_LABELS[categoria] ?? categoria}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-10">
                {plugins.map((p) => (
                  <PluginTile
                    key={p.id}
                    plugin={p}
                    busy={busy === p.id}
                    onOpen={() => setDetail(p)}
                    onInstall={() => doInstall(p)}
                    onUninstall={() => doRemove(p)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}



      <Dialog open={showSuggest} onOpenChange={setShowSuggest}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Sugerir Integração</DialogTitle>
            <DialogDescription>
              Não encontrou o plugin que precisava? Diga-nos qual ferramenta você gostaria de ver aqui.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Nome da Ferramenta</Label>
              <Input
                id="title"
                placeholder="Ex: Trello, Slack, RD Station..."
                value={suggestForm.titulo}
                onChange={(e) => setSuggestForm(s => ({ ...s, titulo: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="desc">Como você usaria essa integração?</Label>
              <Textarea
                id="desc"
                placeholder="Descreva brevemente quais funções você gostaria que esse plugin tivesse..."
                value={suggestForm.descricao}
                onChange={(e) => setSuggestForm(s => ({ ...s, descricao: e.target.value }))}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={suggesting || !suggestForm.titulo}
              onClick={async () => {
                setSuggesting(true);
                try {
                  await suggest({ data: suggestForm });
                  toast.success("Sugestão enviada com sucesso! Nossa equipe irá analisar.");
                  setSuggestForm({ titulo: "", descricao: "" });
                  setShowSuggest(false);
                } catch (e: any) {
                  toast.error(e?.message || "Erro ao enviar sugestão");
                } finally {
                  setSuggesting(false);
                }
              }}
            >
              {suggesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar Sugestão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PluginDetailDialog
        plugin={detail}
        busy={busy === detail?.id}
        onClose={() => setDetail(null)}
        onInstall={doInstall}
        onToggle={doToggle}
        onRemove={doRemove}
      />
    </div>
  );
}
