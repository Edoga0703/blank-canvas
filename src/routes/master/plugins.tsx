import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPluginsMaster, savePlugin, deletePlugin, type Plugin } from "@/lib/plugins.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { brand } from "@/config/brand";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Puzzle, Edit3, Image as ImageIcon, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listPluginBannersMaster,
  savePluginBanner,
  deletePluginBanner,
  type PluginBanner,
} from "@/lib/plugin-banners.functions";
import { PluginRevenueCard } from "@/components/plugins/plugin-revenue-card";


export const Route = createFileRoute("/master/plugins")({
  head: () => ({ meta: [{ title: `${brand.name} — Plugins` }] }),
  component: PluginsPage,
});

const empty: Partial<Plugin> = {
  slug: "",
  nome: "",
  descricao: "",
  categoria: "integracao",
  auth_tipo: "none",
  plano_minimo: "starter",
  status: "rascunho",
  visivel_para_clientes: false,
  docs_url: "",
  ordem: 0,
  capa_url: "",
  cor_fundo: "",
  tagline: "",
  descricao_longa: "",
  screenshots: [],
  destaque: false,
  banner_url: "",
  banner_titulo: "",
  banner_subtitulo: "",
};

const CATEGORIAS = [
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
const AUTHS = ["none", "api_key", "oauth"];
const PLANOS = ["starter", "pro", "business"];
const STATUS = ["rascunho", "em_breve", "beta", "ativo", "descontinuado"];

function PluginsPage() {
  const list = useServerFn(listPluginsMaster);
  const save = useServerFn(savePlugin);
  const del = useServerFn(deletePlugin);

  const [items, setItems] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<Plugin> | null>(null);
  const [filtro, setFiltro] = useState("");

  async function load() {
    setLoading(true);
    try { setItems(await list()); }
    catch (e: any) { toast.error(e?.message || "Erro ao carregar"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => `${p.nome} ${p.slug} ${p.categoria}`.toLowerCase().includes(q));
  }, [items, filtro]);

  async function submit() {
    if (!editing) return;
    setSaving(true);
    try {
      await save({ data: editing as any });
      toast.success("Plugin salvo");
      setEditing(null);
      await load();
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este plugin do catálogo?")) return;
    try { await del({ data: { id } }); toast.success("Excluído"); await load(); }
    catch (e: any) { toast.error(e?.message || "Erro ao excluir"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Plugins</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo interno de integrações. Nada aqui aparece para os clientes enquanto “Visível para clientes” estiver desligado.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...empty })}><Plus className="size-4 mr-1.5" /> Novo plugin</Button>
      </div>

      <PluginRevenueCard />

      <BannersManager plugins={items} />

      <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar plugin..." className="max-w-sm" />


      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Puzzle className="size-8 mx-auto mb-3 text-muted-foreground/50" />
          Nenhum plugin encontrado.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{p.categoria}</div>
                  <div className="font-bold truncate">{p.nome}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{p.slug}</div>
                </div>
                <Badge variant={p.status === "ativo" ? "default" : "secondary"} className="shrink-0">{p.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 min-h-8">{p.descricao}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">auth: {p.auth_tipo}</Badge>
                <Badge variant="outline" className="text-[10px]">plano: {p.plano_minimo}</Badge>
                <Badge variant="outline" className={`text-[10px] ${p.visivel_para_clientes ? "text-emerald-600" : ""}`}>
                  {p.visivel_para_clientes ? "visível" : "oculto"}
                </Badge>
              </div>
              <div className="flex gap-1.5 mt-auto pt-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(p)}>
                  <Edit3 className="size-3.5 mr-1" /> Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="size-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar plugin" : "Novo plugin"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nome</Label><Input value={editing.nome ?? ""} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} /></div>
                <div><Label>Slug</Label><Input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="telegram" /></div>
              </div>
              <div><Label>Descrição</Label><Textarea rows={3} value={editing.descricao ?? ""} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Categoria" value={editing.categoria ?? "integracao"} options={CATEGORIAS} onChange={(v) => setEditing({ ...editing, categoria: v })} />
                <SelectField label="Autenticação" value={editing.auth_tipo ?? "none"} options={AUTHS} onChange={(v) => setEditing({ ...editing, auth_tipo: v })} />
                <SelectField label="Plano mínimo" value={editing.plano_minimo ?? "starter"} options={PLANOS} onChange={(v) => setEditing({ ...editing, plano_minimo: v })} />
                <SelectField label="Status" value={editing.status ?? "rascunho"} options={STATUS} onChange={(v) => setEditing({ ...editing, status: v })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Tipo de efeito"
                  value={editing.tipo_efeito ?? "capacidade"}
                  options={["canal", "capacidade", "modulo"]}
                  onChange={(v) => setEditing({ ...editing, tipo_efeito: v })}
                />
                <div><Label>Capacidade (slug interno)</Label><Input value={editing.capacidade_slug ?? ""} onChange={(e) => setEditing({ ...editing, capacidade_slug: e.target.value })} placeholder="telegram" /></div>
                <div><Label>Rota do módulo (se tipo = módulo)</Label><Input value={editing.modulo_rota ?? ""} onChange={(e) => setEditing({ ...editing, modulo_rota: e.target.value })} placeholder="/app/fluxos" /></div>
                <div><Label>Preço mensal (R$)</Label><Input type="number" step="0.01" value={editing.preco_mensal ?? 0} onChange={(e) => setEditing({ ...editing, preco_mensal: Number(e.target.value) })} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.gratuito !== false} onCheckedChange={(v) => setEditing({ ...editing, gratuito: v })} />
                Plugin gratuito
              </label>
              {editing.gratuito === false && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>URL de checkout (Kiwify / Cakto / Perfectpay)</Label>
                    <Input value={editing.checkout_url ?? ""} onChange={(e) => setEditing({ ...editing, checkout_url: e.target.value })} placeholder="https://pay.kiwify.com.br/xxxxxx" />
                  </div>
                  <div>
                    <Label>ID do produto na plataforma</Label>
                    <Input value={editing.external_product_id ?? ""} onChange={(e) => setEditing({ ...editing, external_product_id: e.target.value })} placeholder="product_id do webhook" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Docs URL</Label><Input value={editing.docs_url ?? ""} onChange={(e) => setEditing({ ...editing, docs_url: e.target.value })} /></div>
                <div><Label>Ordem</Label><Input type="number" value={editing.ordem ?? 0} onChange={(e) => setEditing({ ...editing, ordem: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Frase curta (tagline)</Label><Input value={editing.tagline ?? ""} onChange={(e) => setEditing({ ...editing, tagline: e.target.value })} placeholder="Sincronize reuniões com sua agenda" /></div>
              <div><Label>Descrição longa (uma linha = um parágrafo)</Label><Textarea rows={5} value={editing.descricao_longa ?? ""} onChange={(e) => setEditing({ ...editing, descricao_longa: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Ícone (URL)</Label><Input value={editing.icone ?? ""} onChange={(e) => setEditing({ ...editing, icone: e.target.value })} /></div>
                <div><Label>Capa do card (URL)</Label><Input value={editing.capa_url ?? ""} onChange={(e) => setEditing({ ...editing, capa_url: e.target.value })} /></div>
                <div><Label>Cor de fundo</Label><Input value={editing.cor_fundo ?? ""} onChange={(e) => setEditing({ ...editing, cor_fundo: e.target.value })} placeholder="#0b2ffe" /></div>
                <div><Label>Banner (URL da imagem)</Label><Input value={editing.banner_url ?? ""} onChange={(e) => setEditing({ ...editing, banner_url: e.target.value })} /></div>
                <div><Label>Banner — título</Label><Input value={editing.banner_titulo ?? ""} onChange={(e) => setEditing({ ...editing, banner_titulo: e.target.value })} /></div>
                <div><Label>Banner — subtítulo</Label><Input value={editing.banner_subtitulo ?? ""} onChange={(e) => setEditing({ ...editing, banner_subtitulo: e.target.value })} /></div>
              </div>
              <div>
                <Label>Imagens das funcionalidades (uma URL por linha)</Label>
                <Textarea
                  rows={4}
                  value={(editing.screenshots ?? []).join("\n")}
                  onChange={(e) => setEditing({ ...editing, screenshots: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!editing.destaque} onCheckedChange={(v) => setEditing({ ...editing, destaque: v })} />
                Exibir como banner de destaque no topo da loja
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!editing.visivel_para_clientes} onCheckedChange={(v) => setEditing({ ...editing, visivel_para_clientes: v })} />
                Visível para clientes (mantenha desligado durante o MVP)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

const emptyBanner: Partial<PluginBanner> = {
  imagem_url: "",
  imagem_mobile_url: "",
  alt: "",
  link_url: "",
  plugin_id: null,
  ordem: 0,
  ativo: true,
};

function BannersManager({ plugins }: { plugins: Plugin[] }) {
  const listB = useServerFn(listPluginBannersMaster);
  const saveB = useServerFn(savePluginBanner);
  const delB = useServerFn(deletePluginBanner);

  const [banners, setBanners] = useState<PluginBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<PluginBanner> | null>(null);

  async function load() {
    setLoading(true);
    try { setBanners(await listB()); }
    catch (e: any) { toast.error(e?.message || "Erro ao carregar banners"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function submit() {
    if (!editing) return;
    setSaving(true);
    try {
      await saveB({ data: editing as any });
      toast.success("Banner salvo");
      setEditing(null);
      await load();
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este banner?")) return;
    try { await delB({ data: { id } }); toast.success("Excluído"); await load(); }
    catch (e: any) { toast.error(e?.message || "Erro ao excluir"); }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="font-bold flex items-center gap-2"><ImageIcon className="size-4" /> Banners da loja</div>
          <p className="text-xs text-muted-foreground mt-1">
            Artes rotativas exibidas no topo da loja (novidades, novos plugins, avisos). Recomendado 1600×320px.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing({ ...emptyBanner })}>
          <Plus className="size-4 mr-1.5" /> Novo banner
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
      ) : banners.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nenhum banner cadastrado.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {banners.map((b) => (
            <div key={b.id} className="rounded-xl border overflow-hidden">
              <img src={b.imagem_url} alt={b.alt || "Banner"} className="w-full h-28 object-cover bg-muted" />
              <div className="p-2.5 flex items-center gap-2">
                <Badge variant={b.ativo ? "default" : "secondary"} className="text-[10px]">{b.ativo ? "ativo" : "inativo"}</Badge>
                <span className="text-[11px] text-muted-foreground">ordem {b.ordem}</span>
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)}><Edit3 className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar banner" : "Novo banner"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Tamanhos recomendados</strong><br />
                Desktop: 1600×320px (proporção 5:1) — JPG/PNG/WebP até 5MB.<br />
                Mobile: 800×600px (proporção 4:3). Deixe textos no centro para não cortar.
              </div>
              <div>
                <Label>Imagem (arte principal)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={editing.imagem_url ?? ""} onChange={(e) => setEditing({ ...editing, imagem_url: e.target.value })} placeholder="Cole uma URL ou envie um arquivo" />
                  <UploadButton onDone={(url) => setEditing((p) => ({ ...(p ?? {}), imagem_url: url }))} />
                </div>
              </div>
              {editing.imagem_url ? <img src={editing.imagem_url} alt="Prévia" className="w-full h-32 object-cover rounded-lg border bg-muted" /> : null}
              <div>
                <Label>Imagem mobile (opcional)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={editing.imagem_mobile_url ?? ""} onChange={(e) => setEditing({ ...editing, imagem_mobile_url: e.target.value })} placeholder="Cole uma URL ou envie um arquivo" />
                  <UploadButton onDone={(url) => setEditing((p) => ({ ...(p ?? {}), imagem_mobile_url: url }))} />
                </div>
              </div>
              <div><Label>Texto alternativo</Label><Input value={editing.alt ?? ""} onChange={(e) => setEditing({ ...editing, alt: e.target.value })} /></div>
              <div><Label>Link ao clicar (opcional)</Label><Input value={editing.link_url ?? ""} onChange={(e) => setEditing({ ...editing, link_url: e.target.value })} placeholder="https://..." /></div>
              <div>
                <Label>Abrir plugin ao clicar (opcional)</Label>
                <select
                  value={editing.plugin_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, plugin_id: e.target.value || null })}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Nenhum</option>
                  {plugins.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div><Label>Ordem</Label><Input type="number" value={editing.ordem ?? 0} onChange={(e) => setEditing({ ...editing, ordem: Number(e.target.value) })} /></div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={editing.ativo ?? true} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} />
                Ativo (exibir na loja)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


function UploadButton({ onDone }: { onDone: (url: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function pick(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Arquivo maior que 5MB"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("plugin-assets")
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) throw error;
      const { data } = await supabase.storage
        .from("plugin-assets")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (!data?.signedUrl) throw new Error("Não foi possível gerar o link da imagem");
      onDone(data.signedUrl);
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar imagem");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="shrink-0">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { void pick(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
      />
      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm cursor-pointer hover:bg-muted">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        Enviar
      </span>
    </label>
  );
}
