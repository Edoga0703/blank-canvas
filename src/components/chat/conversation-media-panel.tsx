import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ImageIcon, Mic, Play, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getConversationMedia, type ConversationMediaItem } from "@/lib/chat-media.functions";
import { openMediaLightbox } from "@/components/chat/media-lightbox";
import { DrivePanel } from "@/components/chat/drive-panel";
import { useCapacidadeAtiva } from "@/hooks/use-capacidades";

const FILTERS = [
  { key: "tudo", label: "Tudo" },
  { key: "image", label: "Fotos" },
  { key: "video", label: "Vídeos" },
  { key: "audio", label: "Áudios" },
  { key: "document", label: "Documentos" },
] as const;

function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function MediaThumb({ item, onClick }: { item: ConversationMediaItem; onClick: () => void }) {
  const tipo = item.tipo === "unknown" && item.mime?.startsWith("image/") ? "image" : item.tipo;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      title={item.nome || undefined}
      className="group relative aspect-square h-auto w-full overflow-hidden rounded-lg border border-[color:var(--hairline)] bg-[color:var(--panel-2)] p-0"
    >
      {tipo === "image" ? (
        <img
          src={item.url}
          alt={item.nome || "Imagem"}
          loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
        />
      ) : tipo === "video" ? (
        <>
          <video src={item.url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/25">
            <Play className="size-7 text-white drop-shadow" />
          </span>
        </>
      ) : tipo === "audio" ? (
        <span className="grid h-full w-full place-items-center text-muted-foreground">
          <Mic className="size-8" />
        </span>
      ) : (
        <span className="grid h-full w-full place-items-center text-muted-foreground">
          <FileText className="size-8" />
        </span>
      )}
      <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {fmtData(item.data)}
      </span>
      {item.direcao === "out" && (
        <span className="absolute right-1 top-1 rounded-md bg-black/55 px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
          Enviado
        </span>
      )}
    </Button>
  );
}

export function ConversationMediaTab({
  numero,
  contatoNome,
}: {
  numero: string | null;
  contatoNome?: string | null;
}) {
  const fetchMedia = useServerFn(getConversationMedia);
  const [items, setItems] = useState<ConversationMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<(typeof FILTERS)[number]["key"]>("tudo");
  const [fonteSel, setFonte] = useState<"conversa" | "drive">("conversa");
  const temDrive = useCapacidadeAtiva("google-drive");
  const fonte = temDrive ? fonteSel : ("conversa" as const);

  useEffect(() => {
    if (!numero) return;
    setLoading(true);
    setItems([]);
    fetchMedia({ data: { numero } })
      .then((r) => setItems((r as ConversationMediaItem[]) ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero]);

  const filtered = useMemo(
    () => (filtro === "tudo" ? items : items.filter((i) => i.tipo === filtro)),
    [items, filtro],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { tudo: items.length };
    for (const f of FILTERS.slice(1)) c[f.key] = items.filter((i) => i.tipo === f.key).length;
    return c;
  }, [items]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs text-muted-foreground">{contatoNome || numero || "Mídia da conversa"}</span>
          </div>
          {fonte === "conversa" && (
            <span className="shrink-0 text-xs text-muted-foreground">{items.length} arquivo{items.length === 1 ? "" : "s"}</span>
          )}
        </div>

        <div className={cn("mb-2 grid-cols-2 gap-1 rounded-lg bg-[color:var(--panel-2)] p-1", temDrive ? "grid" : "hidden")}>
          {([["conversa", "Da conversa"], ["drive", "Drive"]] as const).map(([k, label]) => (
            <Button
              key={k}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFonte(k)}
              className={cn(
                "h-7 rounded-md text-[11.5px] font-medium",
                fonte === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </Button>
          ))}
        </div>

        {fonte === "drive" ? (
          <DrivePanel numero={numero} contatoNome={contatoNome} />
        ) : (
        <>


        <div className="flex gap-1.5 overflow-x-auto border-y border-[color:var(--hairline)] py-2 no-scrollbar">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFiltro(f.key)}
              className={cn(
                "h-7 shrink-0 rounded-full px-3 text-[11.5px] font-medium",
                filtro === f.key
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-[color:var(--hairline)] text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} {counts[f.key] ? `(${counts[f.key]})` : ""}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pt-3 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {loading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "Nenhum arquivo nesta conversa ainda."
                : "Nenhum arquivo deste tipo nesta conversa."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((item) => (
                <MediaThumb
                  key={item.id}
                  item={item}
                  onClick={() => openMediaLightbox({ url: item.url, tipo: item.tipo, nome: item.nome })}
                />
              ))}
            </div>
          )}
        </div>
        </>
        )}
    </div>
  );
}
