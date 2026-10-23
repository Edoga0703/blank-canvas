import { useEffect, useState } from "react";
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsappAudio } from "@/components/chat/whatsapp-audio";

export type LightboxMedia = { url: string; tipo: string; nome?: string | null };

const EVENT = "chat:lightbox";

/** Abre a mídia em um visualizador dentro do próprio sistema. */
export function openMediaLightbox(media: LightboxMedia) {
  window.dispatchEvent(new CustomEvent<LightboxMedia>(EVENT, { detail: media }));
}

function ToolbarButton({
  onClick,
  title,
  children,
  active,
  as: Component = "button",
  ...props
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  as?: React.ElementType;
} & Record<string, any>) {
  return (
    <Component
      onClick={onClick}
      title={title}
      className={cn(
        "grid size-9 place-items-center rounded-full transition-colors",
        "text-foreground/70 hover:bg-muted hover:text-foreground",
        active && "bg-primary/10 text-primary"
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function MediaLightbox() {
  const [media, setMedia] = useState<LightboxMedia | null>(null);
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setMedia((e as CustomEvent<LightboxMedia>).detail);
      setZoom(1);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener(EVENT, onOpen as EventListener);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENT, onOpen as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const isImage = media?.tipo === "image" || media?.tipo === "sticker";
  const isVideo = media?.tipo === "video";
  const isAudio = media?.tipo === "audio";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "flex max-h-[92vh] w-[calc(100%-1rem)] max-w-4xl flex-col gap-0 overflow-hidden border bg-background p-0 shadow-2xl sm:w-[calc(100%-2rem)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        )}
        overlayClassName="bg-black/70 backdrop-blur-md"
        hideClose
      >
        <DialogHeader className="border-b bg-muted/40 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-xs font-medium sm:text-sm sm:text-base">
              <span className="truncate">{media?.nome ?? "Visualizar mídia"}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Visualização ampliada da mídia selecionada.
            </DialogDescription>
            <div className="flex shrink-0 items-center gap-1">
              {isImage && (
                <>
                  <ToolbarButton
                    title="Reduzir"
                    onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  >
                    <ZoomOut className="size-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    title="Ampliar"
                    onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                  >
                    <ZoomIn className="size-4" />
                  </ToolbarButton>
                </>
              )}
              <ToolbarButton
                as="a"
                title="Baixar"
                href={media?.url}
                download
                target="_blank"
                rel="noreferrer"
              >
                <Download className="size-4" />
              </ToolbarButton>
              <ToolbarButton title="Fechar" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </ToolbarButton>
            </div>
          </div>
        </DialogHeader>

        <div
          className="relative flex min-h-0 flex-1 overflow-auto bg-black/5 p-2 sm:p-5"
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo ? (
            <video
              src={media?.url}
              controls
              autoPlay
              playsInline
              className="m-auto max-h-[60vh] sm:max-h-[70vh] w-full max-w-full rounded-xl object-contain"
            />
          ) : isAudio && media?.url ? (
            <div className="m-auto w-full max-w-xl rounded-lg border bg-background p-4 shadow-sm">
              <WhatsappAudio src={media.url} outbound={false} />
            </div>
          ) : (
            <img
              src={media?.url}
              alt={media?.nome ?? "Imagem"}
              style={{ maxHeight: `${(zoom > 1 ? 70 : 60) * zoom}vh`, maxWidth: zoom > 1 ? "none" : undefined }}
              className="m-auto max-h-[60vh] sm:max-h-[70vh] max-w-full rounded-xl object-contain transition-[max-height] duration-200 ease-out"
            />
          )}
        </div>

        {isImage && (
          <div className="flex items-center justify-center gap-2 border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <span>Zoom {Math.round(zoom * 100)}%</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
