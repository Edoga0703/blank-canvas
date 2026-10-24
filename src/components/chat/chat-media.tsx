import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AudioLines, Download, FileText, ImageOff, Loader2, Maximize2, RefreshCw } from "lucide-react";
import { resolveChatMediaUrl } from "@/lib/chat-media.functions";
import { transcribeChatAudio } from "@/lib/transcribe.functions";
import { useCapacidadeAtiva } from "@/hooks/use-capacidades";
import { WhatsappAudio } from "@/components/chat/whatsapp-audio";

type Props = {
  messageId: string;
  tipo: string;
  url: string | null;
  nome?: string | null;
  outbound?: boolean;
  onOpen?: (media: { url: string; tipo: string; nome?: string | null }) => void;
};

/**
 * Renderiza imagem/vídeo/áudio/sticker/documento do chat.
 * Se a URL direta não for informada ou expirar, recupera de forma segura
 * via server function autenticada (resolveChatMediaUrl).
 */
export function ChatMedia({ messageId, tipo, url, nome, outbound, onOpen }: Props) {
  const resolveFn = useServerFn(resolveChatMediaUrl);
  const [src, setSrc] = useState<string | null>(url);
  const [resolvedTipo, setResolvedTipo] = useState(tipo);
  const [loading, setLoading] = useState(!url);
  const [failed, setFailed] = useState(false);

  const attempts = useRef(0);
  const MAX_AUTO = 2;

  async function recover(manual = false) {
    if (!manual && attempts.current >= MAX_AUTO) {
      setFailed(true);
      setLoading(false);
      return;
    }
    if (manual) attempts.current = 0;
    attempts.current += 1;
    setLoading(true);
    setFailed(false);
    try {
      const res: any = await resolveFn({ data: { messageId } });
      if (res?.url) {
        setSrc(res.url);
        if (res.tipo) setResolvedTipo(res.tipo);
        setLoading(false);
        setFailed(false);
        return;
      }
    } catch (err) {
      console.error("[ChatMedia] recover error:", err);
    }
    setLoading(false);
    setFailed(true);
  }

  useEffect(() => {
    attempts.current = 0;
    // Se a URL direta for do Backblaze B2 ou D-API sem CORS, recupera a rota proxied com suporte a Range
    if (url && !url.includes("backblazeb2.com") && !url.includes("d-api-media")) {
      setSrc(url);
      setLoading(false);
      setFailed(false);
    } else {
      void recover(true);
    }
  }, [url, messageId]);

  if (loading) {
    return (
      <div className="mb-1.5 flex items-center gap-2 rounded-md bg-black/10 px-2 py-1.5 text-[12px]">
        <Loader2 className="size-4 animate-spin" /> Recuperando mídia…
      </div>
    );
  }

  if (failed || !src) {
    const exhausted = (tipo === "unknown" || tipo === "sticker") && attempts.current >= MAX_AUTO;
    return (
      <button
        type="button"
        onClick={() => void recover(true)}
        className="mb-1.5 flex items-center gap-2 rounded-md bg-black/10 px-2 py-1.5 text-[12px] hover:bg-black/20"
      >
        <ImageOff className="size-4 shrink-0" />
        <span>{exhausted ? "Mensagem não suportada" : "Mídia indisponível"}</span>
        <RefreshCw className="size-3 opacity-70" />
      </button>
    );
  }

  if (resolvedTipo === "sticker") {
    return (
      <div className="mb-1.5 -mx-1 select-none flex items-center justify-start">
        <img
          src={src}
          alt={nome ?? "Sticker"}
          className="size-36 object-contain bg-transparent rounded-none drop-shadow-sm pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
          loading="lazy"
          onClick={() => onOpen?.({ url: src!, tipo: "sticker", nome: nome ?? "Sticker" })}
          onError={() => void recover()}
        />
      </div>
    );
  }

  if (resolvedTipo === "audio") {
    return (
      <div className="mb-1.5 -mx-1">
        <WhatsappAudio src={src} outbound={!!outbound} />
        <TranscribeButton messageId={messageId} />
      </div>
    );
  }

  if (resolvedTipo === "image") {
    return (
      <button
        type="button"
        onClick={() => onOpen?.({ url: src!, tipo: "image", nome })}
        className="block mb-1.5 -mx-1 -mt-1 cursor-zoom-in"
      >
        <img
          src={src}
          alt={nome ?? "Imagem"}
          className="rounded-lg max-h-64 w-auto"
          onError={() => void recover()}
        />
      </button>
    );
  }

  if (resolvedTipo === "video") {
    return (
      <div className="relative block w-full mb-1.5 -mx-1 -mt-1">
        <video
          src={src}
          controls
          playsInline
          className="rounded-lg max-h-64 w-full"
          onError={() => void recover()}
        />
        <button
          type="button"
          title="Abrir em tela cheia"
          onClick={() => onOpen?.({ url: src!, tipo: "video", nome })}
          className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>
    );
  }

  // Documentos (PDF, DOCX, etc.): Força download sem bloqueios de navegação ou CORS
  const fileName = nome || "arquivo";

  function handleDocumentClick(e: React.MouseEvent) {
    if (src && src.startsWith("data:")) {
      e.preventDefault();
      try {
        const parts = src.split(",");
        const rawBase64 = parts[1] || "";
        const byteString = atob(rawBase64);
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } catch (err) {
        console.warn("[ChatMedia] Blob download error, falling back:", err);
      }
    }
  }

  const downloadHref = src.startsWith("data:")
    ? "#"
    : src.includes("/api/public/chat-media")
    ? `${src}&download=1&filename=${encodeURIComponent(fileName)}`
    : src.includes("/storage/v1/object/sign/")
    ? `${src}${src.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`
    : src;

  return (
    <a
      href={downloadHref}
      download={fileName}
      onClick={handleDocumentClick}
      target={src.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className="flex items-center gap-2 mb-1.5 px-2.5 py-2 rounded-md bg-black/10 hover:bg-black/20 cursor-pointer transition-colors"
      title={`Baixar ${fileName}`}
    >
      <FileText className="size-4 shrink-0 text-red-500" />
      <span className="truncate text-[12px] font-medium">{fileName}</span>
      <Download className="size-3.5 shrink-0 opacity-70 ml-auto" />
    </a>
  );
}

/** Botão "Transcrever" exibido sob os áudios quando o plugin ia-voz está instalado. */
function TranscribeButton({ messageId }: { messageId: string }) {
  const ativo = useCapacidadeAtiva("ia-voz");
  const transcribeFn = useServerFn(transcribeChatAudio);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (!ativo) return null;
  if (text) {
    return (
      <p className="mt-1 rounded-md bg-black/10 px-2 py-1.5 text-[12px] whitespace-pre-wrap">
        {text}
      </p>
    );
  }
  return (
    <div className="mt-1">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setErro(null);
          try {
            const res: any = await transcribeFn({ data: { messageId } });
            if (res?.text) setText(res.text);
            else setErro("Não consegui transcrever.");
          } catch (e: any) {
            setErro(e?.message?.slice(0, 120) || "Falha ao transcrever.");
          } finally {
            setLoading(false);
          }
        }}
        className="flex items-center gap-1.5 rounded-md bg-black/10 px-2 py-1 text-[11px] font-medium hover:bg-black/20 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-3 animate-spin" /> : <AudioLines className="size-3" />}
        {loading ? "Transcrevendo…" : "Transcrever"}
      </button>
      {erro && <p className="mt-1 text-[11px] text-red-500">{erro}</p>}
    </div>
  );
}
