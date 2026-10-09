import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Wand2, MessageSquareQuote, Sparkles } from "lucide-react";
import {
  assistenteChatDisponivel,
  sugerirProximaMensagem,
  estruturarMensagem,
} from "@/lib/chat-assist.functions";

/**
 * Assistente de IA do chat (em teste, apenas plano Cortesia).
 * Gera o texto e devolve para o campo de digitação — o envio continua manual.
 */
export function AiAssistButton({
  numero,
  rascunho,
  onTexto,
  disabled,
}: {
  numero: string;
  rascunho: string;
  onTexto: (texto: string) => void;
  disabled?: boolean;
}) {
  const checar = useServerFn(assistenteChatDisponivel);
  const sugerir = useServerFn(sugerirProximaMensagem);
  const estruturar = useServerFn(estruturarMensagem);

  const [liberado, setLiberado] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"sugerir" | "estruturar" | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    void checar().then((v) => { if (vivo) setLiberado(!!v); }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!liberado) return null;

  async function run(tipo: "sugerir" | "estruturar") {
    if (busy) return;
    if (tipo === "estruturar" && rascunho.trim().length < 2) {
      toast.error("Escreva uma ideia rápida no campo para a IA estruturar.");
      return;
    }
    setBusy(tipo);
    try {
      const r = tipo === "sugerir"
        ? await sugerir({ data: { numero } })
        : await estruturar({ data: { rascunho, numero } });
      const texto = (r?.texto || "").trim();
      if (!texto) throw new Error("A IA não retornou texto.");
      onTexto(texto);
      setOpen(false);
      toast.success("Mensagem gerada — revise e envie.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível gerar a mensagem.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Assistente de IA"
        aria-label="Assistente de IA"
        className="size-10 shrink-0 rounded-full grid place-items-center text-muted-foreground hover:bg-[color:var(--panel-2)] hover:text-[color:var(--brand)] transition disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-50 w-64 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel)] p-1.5 shadow-xl">
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Assistente de IA · teste
          </div>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("sugerir")}
            className="w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-[color:var(--panel-2)] disabled:opacity-50"
          >
            <MessageSquareQuote className="size-4 mt-0.5 text-[color:var(--brand)]" />
            <span>
              <span className="block text-[13px] font-medium">Sugerir resposta</span>
              <span className="block text-[11px] text-muted-foreground">Lê a conversa e propõe a próxima mensagem</span>
            </span>
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("estruturar")}
            className="w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-[color:var(--panel-2)] disabled:opacity-50"
          >
            <Wand2 className="size-4 mt-0.5 text-[color:var(--brand)]" />
            <span>
              <span className="block text-[13px] font-medium">Estruturar minha ideia</span>
              <span className="block text-[11px] text-muted-foreground">Melhora o texto que você digitou</span>
            </span>
          </button>
          <div className="px-2 pt-1 pb-1.5 text-[10.5px] text-muted-foreground">
            O texto vai para o campo de digitação. O envio é sempre seu.
          </div>
        </div>
      )}
    </div>
  );
}
