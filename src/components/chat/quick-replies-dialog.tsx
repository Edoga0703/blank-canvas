import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Star, Trash2, Send, MessageSquare, Image as ImageIcon, Video, Mic, FileText, Plus } from "lucide-react";
import type { QuickReply } from "@/lib/quick-replies.functions";

const TIPO_ICON: Record<string, any> = {
  texto: MessageSquare,
  imagem: ImageIcon,
  video: Video,
  audio: Mic,
  documento: FileText,
};

export function QuickRepliesDialog({
  open,
  onOpenChange,
  items,
  onSend,
  onInsert,
  onToggleFavorito,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: QuickReply[];
  onSend: (qr: QuickReply) => void;
  onInsert: (qr: QuickReply) => void;
  onToggleFavorito: (qr: QuickReply) => void;
  onDelete: (qr: QuickReply) => void;
}) {
  const [q, setQ] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const favoriteCount = items.filter((item) => item.favorito).length;

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((r) => (!onlyFav || r.favorito))
      .filter((r) =>
        !term ||
        r.atalho.toLowerCase().includes(term) ||
        (r.titulo || "").toLowerCase().includes(term) ||
        (r.texto || "").toLowerCase().includes(term) ||
        (r.categoria || "").toLowerCase().includes(term),
      )
      .sort((a, b) => Number(b.favorito) - Number(a.favorito) || (a.titulo || a.atalho).localeCompare(b.titulo || b.atalho));
  }, [items, q, onlyFav]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-[17px]">Mensagens rápidas</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título" className="pl-9 h-10 rounded-xl" />
          </div>
          <Button
            type="button"
            variant={onlyFav ? "default" : "outline"}
            className="h-10 rounded-xl gap-1.5 shrink-0"
            onClick={() => setOnlyFav((v) => !v)}
          >
            <Star className={`size-4 ${onlyFav ? "fill-current" : ""}`} /> Favoritos
          </Button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-3 pb-3 space-y-1.5">
          {list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma mensagem rápida encontrada.
            </div>
          ) : (
            list.map((r) => {
              const Icon = TIPO_ICON[r.tipo] ?? MessageSquare;
              return (
                <div
                  key={r.id}
                  className="group flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)] hover:bg-[color:var(--panel)] transition"
                >
                  <button
                    type="button"
                    onClick={() => onInsert(r)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                    title={r.tipo === "texto" ? "Inserir no campo de mensagem" : "Enviar arquivo (pede confirmação)"}
                  >
                    <Icon className="size-4 text-muted-foreground shrink-0" />
                    <span className="truncate text-[14px] font-medium">{r.titulo || `/${r.atalho}`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(r)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
                    title="Excluir"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorito(r)}
                    disabled={!r.favorito && favoriteCount >= 5}
                    className={`p-1.5 rounded-lg hover:bg-amber-400/10 ${r.favorito ? "text-amber-400" : "text-muted-foreground"}`}
                    title={r.favorito ? "Remover dos favoritos" : favoriteCount >= 5 ? "Limite de 5 favoritos atingido" : "Favoritar"}
                  >
                    <Star className={`size-4 ${r.favorito ? "fill-current" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { onSend(r); onOpenChange(false); }}
                    className="p-1.5 rounded-lg text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]"
                    title="Enviar agora"
                  >
                    <Send className="size-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-[color:var(--hairline)] px-5 py-3 flex items-center justify-between text-[12px] text-muted-foreground">
          <span>Atalho: <code className="bg-muted px-1 rounded font-mono">/</code> no chat</span>
          <a href="/app/respostas-rapidas" className="inline-flex items-center gap-1 text-[color:var(--brand)] font-medium">
            <Plus className="size-3.5" /> Gerenciar
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
