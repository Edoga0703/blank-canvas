import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ThumbsUp, ThumbsDown, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { registrarFeedback, type KbArtigo } from "@/lib/support-kb";

/** Renderiza markdown simples: **negrito**, `código`, listas "- " e passos "1. " */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`"))
          return <code key={i} className="px-1 py-0.5 rounded bg-muted text-[12px]">{p.slice(1, -1)}</code>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Conteudo({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
      {linhas.map((l, i) => {
        const t = l.trim();
        if (!t) return null;
        if (/^-\s+/.test(t))
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-muted-foreground">•</span>
              <span className="flex-1"><Inline text={t.replace(/^-\s+/, "")} /></span>
            </div>
          );
        const num = t.match(/^(\d+)\.\s+(.*)$/);
        if (num)
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span
                className="shrink-0 size-5 rounded-full grid place-items-center text-[11px] font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                {num[1]}
              </span>
              <span className="flex-1 pt-0.5"><Inline text={num[2]} /></span>
            </div>
          );
        return <p key={i}><Inline text={t} /></p>;
      })}
    </div>
  );
}

export function SupportArticle({
  artigo,
  onTalkToAgent,
  onClose,
}: {
  artigo: KbArtigo;
  onTalkToAgent: (assunto: string, contexto: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [resolvido, setResolvido] = useState(false);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <div>
          <span
            className="inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)", color: "var(--brand)" }}
          >
            {artigo.categoria}
          </span>
          <h3 className="mt-2 text-base font-bold leading-snug">{artigo.titulo}</h3>
        </div>

        <Conteudo texto={artigo.conteudo} />

        {artigo.rotaRelacionada && (
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => {
              navigate({ to: artigo.rotaRelacionada! }).catch(() => {});
              onClose();
            }}
          >
            {artigo.rotaLabel ?? "Abrir tela"}
            <ArrowUpRight className="size-4" />
          </Button>
        )}
      </div>

      <div className="shrink-0 border-t p-3">
        {resolvido ? (
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 font-medium py-1">
            <CheckCircle2 className="size-4" /> Que bom! Precisando é só chamar.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-1">Isso resolveu sua dúvida?</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { registrarFeedback(artigo.id, true); setResolvido(true); }}
            >
              <ThumbsUp className="size-4 mr-1" /> Sim
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                registrarFeedback(artigo.id, false);
                onTalkToAgent(artigo.titulo, `Li o artigo "${artigo.titulo}" mas não resolveu.\n\n`);
              }}
            >
              <ThumbsDown className="size-4 mr-1" /> Não
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
