import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listQuickReplies, saveQuickReply, deleteQuickReply, toggleQuickReplyFavorito, type QuickReply, type QuickReplyTipo } from "@/lib/quick-replies.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Pencil, Upload, FileText, Image as ImageIcon, Video, Mic, Search, Loader2, Star, MessageSquare } from "lucide-react";
import { HelpTip } from "@/components/help-tip";
import { brand } from "@/config/brand";

export const Route = createFileRoute("/app/respostas-rapidas")({
  head: () => ({ meta: [{ title: `${brand.name} — Respostas Rápidas` }] }),
  component: Page,
});

const TIPOS: { value: QuickReplyTipo; label: string; icon: any }[] = [
  { value: "texto", label: "Texto", icon: FileText },
  { value: "imagem", label: "Imagem", icon: ImageIcon },
  { value: "video", label: "Vídeo", icon: Video },
  { value: "audio", label: "Áudio", icon: Mic },
  { value: "documento", label: "Documento", icon: FileText },
];


const TABS: { value: string; label: string; icon: any }[] = [
  { value: "todos", label: "Todos", icon: Zap },
  { value: "favoritos", label: "Favoritos", icon: Star },
  { value: "texto", label: "Texto", icon: MessageSquare },
  { value: "audio", label: "Voz", icon: Mic },
  { value: "imagem", label: "Imagem", icon: ImageIcon },
  { value: "documento", label: "Arquivo", icon: FileText },
  { value: "video", label: "Vídeo", icon: Video },
];

function Page() {
  const ctx = Route.useRouteContext() as any;
  const companyId = ctx?.company?.id as string | undefined;
  const list = useServerFn(listQuickReplies);
  const save = useServerFn(saveQuickReply);
  const del = useServerFn(deleteQuickReply);
  const toggleFav = useServerFn(toggleQuickReplyFavorito);

  const [rows, setRows] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string>("todos");
  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);

  async function reload() {
    setLoading(true);
    try { setRows(await list()); } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: rows.length, favoritos: rows.filter((r) => r.favorito).length };
    for (const r of rows) c[r.tipo] = (c[r.tipo] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => tab === "todos" || (tab === "favoritos" ? r.favorito : r.tipo === tab))
      .filter((r) =>
        !q ||
        r.atalho.toLowerCase().includes(q) ||
        (r.titulo || "").toLowerCase().includes(q) ||
        (r.texto || "").toLowerCase().includes(q) ||
        (r.categoria || "").toLowerCase().includes(q),
      )
      .sort((a, b) => Number(b.favorito) - Number(a.favorito) || (a.titulo || a.atalho).localeCompare(b.titulo || b.atalho));
  }, [rows, search, tab]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta resposta rápida?")) return;
    try { await del({ data: { id } }); toast.success("Excluído"); void reload(); }
    catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function handleFav(r: QuickReply) {
    if (!r.favorito && rows.filter((item) => item.favorito).length >= 5) {
      toast.error("Você pode favoritar no máximo 5 mensagens rápidas");
      return;
    }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, favorito: !x.favorito } : x)));
    try { await toggleFav({ data: { id: r.id, favorito: !r.favorito } }); }
    catch (e: any) { toast.error(e?.message ?? "Erro"); void reload(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight flex items-center gap-2">
            Respostas Rápidas <HelpTip text="Crie mensagens prontas (texto, voz, imagem, arquivo ou vídeo). As favoritas viram atalhos no rodapé do chat." />
          </h1>
          <p className="text-sm text-muted-foreground">
            Use <code className="bg-muted px-1 rounded font-mono text-[12px]">/atalho</code> ou <code className="bg-muted px-1 rounded font-mono text-[12px]">Ctrl + /</code> no chat. Favoritas aparecem como botão logo acima do campo de digitação.
          </p>
        </div>
        <Button onClick={() => setEditing({ tipo: "texto", categoria: "Geral" })} className="gap-2">
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {TABS.map((t) => {
          const I = t.icon;
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition ${
                active
                  ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-text)]"
                  : "border-[color:var(--hairline)] bg-[color:var(--panel)] hover:bg-[color:var(--panel-2)]"
              }`}
            >
              <I className="size-4" />
              <span className="text-[12px] font-semibold">{t.label}</span>
              <span className="text-[11px] text-muted-foreground">{counts[t.value] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] overflow-hidden">
        <div className="p-4 border-b border-[color:var(--hairline)]">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título, atalho ou categoria" className="pl-9 h-11 rounded-xl" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="size-4 animate-spin" /> Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            Nenhuma mensagem rápida aqui. Clique em <b>Adicionar</b> para criar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[color:var(--panel-2)] text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Título</th>
                  <th className="px-5 py-3 font-semibold w-[110px]">Favorito</th>
                  <th className="px-5 py-3 font-semibold w-[180px]">Categoria</th>
                  <th className="px-5 py-3 font-semibold w-[140px] text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--hairline)]">
                {filtered.map((r) => {
                  const T = TIPOS.find((t) => t.value === r.tipo)?.icon ?? FileText;
                  return (
                    <tr key={r.id} className="hover:bg-[color:var(--panel-2)] transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <T className="size-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.titulo || `/${r.atalho}`}</div>
                            <div className="text-[12px] text-muted-foreground truncate max-w-[420px]">
                              {r.tipo === "texto" ? r.texto : (r.media_nome || "(mídia)")}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {r.favorito ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-amber-300 text-amber-600">Sim</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground truncate">{r.categoria || "Geral"}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" title={r.favorito ? "Remover dos favoritos" : "Favoritar"} onClick={() => void handleFav(r)}>
                            <Star className={`size-4 ${r.favorito ? "fill-amber-400 text-amber-400" : ""}`} />
                          </Button>
                          <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditing(r)}><Pencil className="size-4" /></Button>
                          <Button size="icon" variant="ghost" title="Excluir" onClick={() => handleDelete(r.id)}><Trash2 className="size-4 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditDialog
          initial={editing}
          companyId={companyId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload(); }}
          onSave={save}
        />
      )}
    </div>
  );
}

function EditDialog({
  initial, companyId, onClose, onSaved, onSave,
}: {
  initial: Partial<QuickReply>;
  companyId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
  onSave: (args: { data: any }) => Promise<any>;
}) {
  const [atalho, setAtalho] = useState(initial.atalho || "");
  const [titulo, setTitulo] = useState(initial.titulo || "");
  const [categoria, setCategoria] = useState(initial.categoria || "Geral");
  const [tipo, setTipo] = useState<QuickReplyTipo>((initial.tipo as QuickReplyTipo) || "texto");
  const [texto, setTexto] = useState(initial.texto || "");
  const [mediaUrl, setMediaUrl] = useState(initial.media_url || "");
  const [mediaMime, setMediaMime] = useState(initial.media_mime || "");
  const [mediaNome, setMediaNome] = useState(initial.media_nome || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(f: File) {
    if (!companyId) { toast.error("Empresa não identificada"); return; }
    setUploading(true);
    try {
      const ext = f.name.split(".").pop() || "bin";
      const path = `${companyId}/quick-replies/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, f, { contentType: f.type || "application/octet-stream" });
      if (error) throw error;
      const { data } = await supabase.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      setMediaUrl(data?.signedUrl ?? "");
      setMediaMime(f.type || "application/octet-stream");
      setMediaNome(f.name);
      toast.success("Upload concluído");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      await onSave({ data: {
        id: initial.id, atalho, titulo, categoria, tipo, favorito: !!initial.favorito,
        texto: tipo === "texto" ? texto : null,
        media_url: tipo === "texto" ? null : mediaUrl,
        media_mime: tipo === "texto" ? null : mediaMime,
        media_nome: tipo === "texto" ? null : mediaNome,
      } });
      toast.success("Salvo");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const acceptForTipo = tipo === "imagem" ? "image/*" : tipo === "video" ? "video/*" : tipo === "audio" ? "audio/*" : "application/pdf,.doc,.docx,.xls,.xlsx,.txt";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Editar resposta rápida" : "Nova resposta rápida"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Atalho</Label>
              <div className="flex items-center">
                <span className="text-muted-foreground px-2">/</span>
                <Input value={atalho} onChange={(e) => setAtalho(e.target.value.toLowerCase())} placeholder="boasvindas" />
              </div>
            </div>
            <div>
              <Label>Categoria</Label>
              <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Geral" />
            </div>
          </div>
          <div>
            <Label>Título (opcional)</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Saudação inicial" />
          </div>
          <div>
            <Label>Tipo</Label>
            <div className="grid grid-cols-5 gap-1.5 mt-1">
              {TIPOS.map((t) => {
                const I = t.icon;
                const active = tipo === t.value;
                return (
                  <button key={t.value} type="button" onClick={() => setTipo(t.value)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[11px] transition ${active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-text)]" : "border-[color:var(--hairline)] hover:bg-muted"}`}>
                    <I className="size-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {tipo === "texto" ? (
            <div>
              <Label>Texto</Label>
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} placeholder="Olá {{nome}}! Como posso ajudar?" />
              <div className="text-[11px] text-muted-foreground mt-1">Você pode usar variáveis: <code>{"{{nome}}"}</code></div>
            </div>
          ) : (
            <div>
              <Label>Arquivo</Label>
              <input ref={fileRef} type="file" hidden accept={acceptForTipo} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }} />
              <div className="mt-1 space-y-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  {mediaUrl ? "Trocar arquivo" : "Selecionar arquivo"}
                </Button>
                {mediaUrl && (
                  <div className="text-[12px] text-muted-foreground truncate">📎 {mediaNome || mediaUrl}</div>
                )}
              </div>
              <div>
                <Label className="mt-3 block">Legenda (opcional)</Label>
                <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Texto que acompanha a mídia" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || uploading}>
            {saving && <Loader2 className="size-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
