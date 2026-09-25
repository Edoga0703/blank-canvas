import { useEffect, useMemo, useState } from "react";
import { X, FileText, Send, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  files: File[];
  busy?: boolean;
  onRemove: (index: number) => void;
  onCancel: () => void;
  onSend: (caption: string) => void;
};

/** Pré-visualização antes de enviar arquivos/imagens no chat. */
export function MediaPreviewDialog({ files, busy, onRemove, onCancel, onSend }: Props) {
  const [caption, setCaption] = useState("");
  const [index, setIndex] = useState(0);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  useEffect(() => () => { urls.forEach((u) => URL.revokeObjectURL(u)); }, [urls]);
  useEffect(() => { if (index >= files.length) setIndex(Math.max(0, files.length - 1)); }, [files.length, index]);

  const open = files.length > 0;
  const current = files[index];
  const currentUrl = current ? urls[index] : null;
  const isImg = current?.type.startsWith("image/") ?? false;
  const isVid = current?.type.startsWith("video/") ?? false;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        className={cn(
          "flex max-h-[92vh] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden border bg-background p-0 shadow-2xl sm:w-[calc(100%-2rem)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        )}
        overlayClassName="bg-black/70 backdrop-blur-md"
        hideClose
      >
        <DialogHeader className="border-b bg-muted/40 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="min-w-0 truncate text-xs font-medium sm:text-sm sm:text-base">
              Enviar {files.length > 1 ? `${files.length} arquivos` : "arquivo"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Pré-visualize e envie arquivos para a conversa.
            </DialogDescription>
            <button
              onClick={onCancel}
              className="grid size-9 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              title="Cancelar"
            >
              <X className="size-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/5 p-2 sm:p-5">
          {current && currentUrl && (
            isImg ? (
              <img
                src={currentUrl}
                alt={current.name}
                className="max-h-[50vh] sm:max-h-[55vh] w-auto max-w-full rounded-xl object-contain shadow-sm"
              />
            ) : isVid ? (
              <video
                src={currentUrl}
                controls
                playsInline
                className="max-h-[50vh] sm:max-h-[55vh] w-full max-w-full rounded-xl object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/40 px-6 py-8 sm:px-8 sm:py-10 text-center">
                <FileText className="size-10 sm:size-12 text-muted-foreground/70" />
                <div className="mt-3 max-w-xs break-all text-xs font-medium sm:text-sm">{current.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{(current.size / 1024).toFixed(0)} KB</div>
              </div>
            )
          )}
        </div>

        {files.length > 1 && (
          <div className="border-t bg-muted/40 px-4 py-3 sm:px-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {files.map((f, i) => (
                <div key={i} className="relative shrink-0">
                  <button
                    onClick={() => setIndex(i)}
                    className={cn(
                      "relative size-16 overflow-hidden rounded-xl border-2 transition-colors",
                      i === index ? "border-primary bg-primary/5" : "border-transparent bg-muted hover:bg-muted/80"
                    )}
                  >
                    {f.type.startsWith("image/") ? (
                      <img src={urls[i]} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="grid size-full place-items-center">
                        <FileText className="size-5 text-muted-foreground" />
                      </div>
                    )}
                    {i === index && (
                      <div className="absolute inset-0 ring-inset ring-2 ring-primary/20 rounded-xl" />
                    )}
                  </button>
                  <button
                    onClick={() => onRemove(i)}
                    className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-transform hover:scale-110"
                    title="Remover"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t bg-muted/40 p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Adicione uma legenda…"
              className="flex-1 bg-background"
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) onSend(caption); }}
              autoFocus
            />
            <Button
              onClick={() => onSend(caption)}
              disabled={busy}
              className="shrink-0 gap-2"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              <span className="hidden sm:inline">Enviar</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
