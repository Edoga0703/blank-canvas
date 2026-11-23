import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Loader2, ImageIcon, X, Star, Plus } from "lucide-react";
import type { Produto } from "@/lib/produtos.functions";

export function ProdutoEditDialog({
  initial,
  companyId,
  onClose,
  onSaved,
  onSave,
}: {
  initial: Partial<Produto>;
  companyId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
  onSave: (args: { data: any }) => Promise<any>;
}) {
  const [nome, setNome] = useState(initial.nome || "");
  const [preco, setPreco] = useState<string>(initial.preco != null ? String(initial.preco) : "");
  const [descricao, setDescricao] = useState(initial.descricao || "");
  const [categoria, setCategoria] = useState(initial.categoria || "");
  const [sku, setSku] = useState(initial.sku || "");
  const [fotos, setFotos] = useState<string[]>(() => {
    if (Array.isArray((initial as any).fotos) && (initial as any).fotos.length > 0) {
      return (initial as any).fotos.filter(Boolean);
    }
    return initial.foto_url ? [initial.foto_url] : [];
  });
  const [fotoUrl, setFotoUrl] = useState(initial.foto_url || "");
  const [ativo, setAtivo] = useState(initial.ativo ?? true);
  const [tipo, setTipo] = useState<"produto" | "servico">((initial.tipo as any) === "servico" ? "servico" : "produto");
  const [duracaoMin, setDuracaoMin] = useState<string>(initial.duracao_min != null ? String(initial.duracao_min) : "30");
  const [agendavel, setAgendavel] = useState<boolean>(initial.agendavel ?? false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(filesInput: FileList | File[]) {
    if (!companyId) { toast.error("Empresa não identificada"); return; }
    const list = Array.from(filesInput);
    if (!list.length) return;
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const f of list) {
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const safeName = f.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${companyId}/produtos/${Date.now()}-${Math.random().toString(36).slice(2, 7)}_${safeName}`;
        
        // Try uploading to 'produtos' bucket first, fallback to 'chat-media'
        let uploadErr: any = null;
        let bucketUsed = "produtos";
        const res = await supabase.storage.from("produtos").upload(path, f, { contentType: f.type || "image/jpeg", upsert: true });
        if (res.error) {
          uploadErr = res.error;
          const fb = await supabase.storage.from("chat-media").upload(path, f, { contentType: f.type || "image/jpeg", upsert: true });
          if (!fb.error) {
            uploadErr = null;
            bucketUsed = "chat-media";
          }
        }
        if (uploadErr) throw uploadErr;

        const { data: pubData } = supabase.storage.from(bucketUsed).getPublicUrl(path);
        if (pubData?.publicUrl) {
          uploadedUrls.push(pubData.publicUrl);
        }
      }

      setFotos((prev) => {
        const next = [...prev, ...uploadedUrls];
        if (!fotoUrl && next.length > 0) setFotoUrl(next[0]!);
        return next;
      });

      if (!fotoUrl && uploadedUrls.length > 0) {
        setFotoUrl(uploadedUrls[0]!);
      }

      toast.success(list.length > 1 ? `${list.length} fotos carregadas com sucesso` : "Foto carregada com sucesso");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleSetPrincipal(url: string) {
    setFotoUrl(url);
    setFotos((prev) => [url, ...prev.filter((u) => u !== url)]);
    toast.success("Foto principal atualizada");
  }

  function handleRemoveFoto(url: string) {
    const next = fotos.filter((u) => u !== url);
    setFotos(next);
    if (fotoUrl === url) {
      setFotoUrl(next[0] || "");
    }
  }

  async function submit() {
    if (!nome.trim()) { toast.error("Informe o nome do item"); return; }
    setSaving(true);
    try {
      const cover = fotoUrl || fotos[0] || null;
      await onSave({ data: {
        id: initial.id,
        nome: nome.trim(),
        preco: Number(String(preco).replace(",", ".")) || 0,
        descricao: descricao.trim() || null,
        categoria: categoria.trim() || null,
        sku: sku.trim() || null,
        foto_url: cover,
        fotos: fotos.length > 0 ? fotos : (cover ? [cover] : []),
        ativo,
        tipo,
        duracao_min: tipo === "servico" ? Number(duracaoMin) || null : null,
        agendavel: tipo === "servico" ? agendavel : false,
      } });
      toast.success("Salvo");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const activePrincipal = fotoUrl || fotos[0] || "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Editar item" : tipo === "servico" ? "Novo serviço" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <div className="mt-1 inline-flex rounded-xl border border-[color:var(--hairline)] p-1">
              {([["produto", "Produto"], ["servico", "Serviço"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTipo(v)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${tipo === v ? "bg-[#0B22FE] text-white" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Fotos do item {fotos.length > 0 && `(${fotos.length})`}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="h-7 text-xs gap-1 text-[color:var(--brand)] hover:text-[color:var(--brand)]"
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Adicionar fotos
              </Button>
            </div>

            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files) void handleUpload(e.target.files);
              }}
            />

            {fotos.length === 0 ? (
              <div
                onClick={() => fileRef.current?.click()}
                className="mt-2 border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition bg-muted/20 hover:bg-muted/40"
              >
                <div className="size-12 rounded-full bg-muted grid place-items-center text-muted-foreground">
                  {uploading ? <Loader2 className="size-6 animate-spin text-primary" /> : <ImageIcon className="size-6" />}
                </div>
                <div className="text-center">
                  <span className="text-xs font-medium text-foreground">Clique para enviar uma ou mais fotos</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">PNG, JPG ou WEBP (múltiplas permitidas)</p>
                </div>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {fotos.map((url, idx) => {
                  const isPrimary = url === activePrincipal || (idx === 0 && !fotoUrl);
                  return (
                    <div
                      key={url + idx}
                      className={`group relative aspect-square rounded-lg overflow-hidden border bg-muted transition ${
                        isPrimary ? "ring-2 ring-primary border-primary" : "border-border"
                      }`}
                    >
                      <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      
                      {isPrimary && (
                        <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
                          <Star className="size-2.5 fill-current" /> Capa
                        </span>
                      )}

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 p-1">
                        {!isPrimary && (
                          <button
                            type="button"
                            onClick={() => handleSetPrincipal(url)}
                            title="Tornar foto de capa"
                            className="size-7 rounded-full bg-background/90 text-foreground hover:bg-primary hover:text-white grid place-items-center transition"
                          >
                            <Star className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFoto(url)}
                          title="Remover foto"
                          className="size-7 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 grid place-items-center transition"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition bg-muted/10 hover:bg-muted/30"
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  <span className="text-[10px] font-medium">+ Foto</span>
                </button>
              </div>
            )}
          </div>

          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Pneu Aro 15 175/65" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Preço (R$)</Label>
              <Input value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="299,90" inputMode="decimal" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Pneus" />
            </div>
          </div>

          <div>
            <Label>SKU / Código (opcional)</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="PN-175-65-15" />
          </div>

          {tipo === "servico" && (
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>Duração (minutos)</Label>
                <Input value={duracaoMin} onChange={(e) => setDuracaoMin(e.target.value)} inputMode="numeric" placeholder="30" />
              </div>
              <label className="flex items-center gap-2 h-10 text-sm font-medium cursor-pointer">
                <input type="checkbox" checked={agendavel} onChange={(e) => setAgendavel(e.target.checked)} className="size-4 accent-[#0B22FE]" />
                Permitir agendamento
              </label>
            </div>
          )}

          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Detalhes do produto, medidas, marca, garantia..." />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[color:var(--hairline)] px-3 py-2">
            <div>
              <div className="text-sm font-medium">Item ativo</div>
              <div className="text-[12px] text-muted-foreground">Itens inativos ficam ocultos das listagens.</div>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
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
