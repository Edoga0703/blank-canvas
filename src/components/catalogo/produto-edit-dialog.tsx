import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Loader2, ImageIcon } from "lucide-react";
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
  const [fotoUrl, setFotoUrl] = useState(initial.foto_url || "");
  const [ativo, setAtivo] = useState(initial.ativo ?? true);
  const [tipo, setTipo] = useState<"produto" | "servico">((initial.tipo as any) === "servico" ? "servico" : "produto");
  const [duracaoMin, setDuracaoMin] = useState<string>(initial.duracao_min != null ? String(initial.duracao_min) : "30");
  const [agendavel, setAgendavel] = useState<boolean>(initial.agendavel ?? false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(f: File) {
    if (!companyId) { toast.error("Empresa não identificada"); return; }
    setUploading(true);
    try {
      const ext = f.name.split(".").pop() || "jpg";
      const path = `${companyId}/produtos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, f, { contentType: f.type || "image/jpeg" });
      if (error) throw error;
      const { data } = await supabase.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      setFotoUrl(data?.signedUrl ?? "");
      toast.success("Foto carregada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!nome.trim()) { toast.error("Informe o nome do item"); return; }
    setSaving(true);
    try {
      await onSave({ data: {
        id: initial.id,
        nome,
        preco: Number(String(preco).replace(",", ".")) || 0,
        descricao, categoria, sku,
        foto_url: fotoUrl || null,
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Editar item" : tipo === "servico" ? "Novo serviço" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
            <Label>Foto</Label>
            <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }} />
            <div className="mt-1 flex items-center gap-3">
              <div className="size-24 rounded-lg bg-muted overflow-hidden shrink-0 grid place-items-center">
                {fotoUrl ? <img src={fotoUrl} className="w-full h-full object-cover" /> : <ImageIcon className="size-8 text-muted-foreground" />}
              </div>
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {fotoUrl ? "Trocar foto" : "Enviar foto"}
              </Button>
            </div>
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
