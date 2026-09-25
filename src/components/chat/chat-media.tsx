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
 * Renderiza imagem/vídeo/documento do chat.
 * URLs assinadas do storage expiram — quando a mídia falha, pedimos ao servidor
 * uma URL nova (ou o download da mídia no provedor) e trocamos a origem.
 */
export function ChatMedia({ messageId, tipo, url, nome, outbound, onOpen }: Props) {
  const resolveFn = useServerFn(resolveChatMediaUrl);
  const [src, setSrc] = useState<string | null>(url);
  const [resolvedTipo, setResolvedTipo] = useState(tipo);
  const [state, setState] = useState<"ok" | "loading" | "failed">(url ? "ok" : "failed");
  // Limite de tentativas automáticas: evita laço infinito quando a mídia
  // reassinada continua sem renderizar (objeto ausente/criptografado).
  const attempts = useRef(0);
  const MAX_AUTO = 2;

  async function recover(manual = false) {
    if (state === "loading") return;
    if (!manual && attempts.current >= MAX_AUTO) {
      setState("failed");
      return;
    }
    if (manual) attempts.current = 0;
    attempts.current += 1;
    setState("loading");
    try {
      const res: any = await resolveFn({ data: { messageId } });
      if (res?.url) {
        setSrc(`${res.url}${res.url.includes("?") ? "&" : "?"}r=${Date.now()}`);
        if (res.tipo) setResolvedTipo(res.tipo);
        setState("ok");
        return;
      }
    } catch {
      /* ignora */
    }
    setState("failed");
  }

  useEffect(() => {
    attempts.current = 0;
    if (!url) void recover();
  }, [url, messageId]);


  if (state === "failed" || !src) {
    // Sem tipo conhecido e sem mídia recuperável = evento que o WhatsApp não
    // entrega de volta (figurinha antiga, reação, etc.).
    const exhausted = tipo === "unknown" && attempts.current >= MAX_AUTO;
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


  if (state === "loading") {
    return (
      <div className="mb-1.5 flex items-center gap-2 rounded-md bg-black/10 px-2 py-1.5 text-[12px]">
        <Loader2 className="size-4 animate-spin" /> Recuperando mídia…
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
        <img src={src} alt={nome ?? "Imagem"} className="rounded-lg max-h-64 w-auto" onError={() => void recover()} />
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

  // Força download (arquivos como .pfx não abrem no navegador).
  const fileName = nome || "arquivo";
  const downloadHref = src.includes("/storage/v1/object/sign/")
    ? `${src}${src.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`
    : src;
  return (
    <a
      href={downloadHref}
      download={fileName}
      rel="noreferrer"
      className="flex items-center gap-2 mb-1.5 px-2 py-1.5 rounded-md bg-black/10 hover:bg-black/20"
    >
      <FileText className="size-4" /> <span className="truncate text-[12px]">{nome ?? "Documento"}</span>
      <Download className="size-3.5 shrink-0 opacity-70" />
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
