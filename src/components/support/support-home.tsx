import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, Search, MessageCircle } from "lucide-react";
import mascotAsset from "@/assets/mascot-support.png.asset.json";
import {
  KB_CATEGORIAS, artigosPorCategoria, buscarKb, sugestoesPorContexto,
  type KbArtigo, type KbCategoria,
} from "@/lib/support-kb";

export function SupportHome({
  userName,
  onOpenArticle,
  onTalkToAgent,
  onClose,
}: {
  userName?: string | null;
  onOpenArticle: (a: KbArtigo) => void;
  onTalkToAgent: (assuntoSugerido?: string) => void;
  onClose: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<KbCategoria | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const resultados = useMemo(() => {
    if (q.trim().length >= 2) return buscarKb(q);
    if (cat) return artigosPorCategoria(cat);
    return sugestoesPorContexto(pathname, 5);
  }, [q, cat, pathname]);

  const buscando = q.trim().length >= 2;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Saudação */}
        <div className="px-5 pt-6 pb-4 text-center">
          <img src={mascotAsset.url} alt="" className="size-16 mx-auto rounded-full object-cover" />
          <h2 className="mt-3 text-lg font-bold">
            Olá{userName ? `, ${userName.split(" ")[0]}` : ""} 👋
          </h2>
          <p className="text-sm text-muted-foreground">Como posso te ajudar hoje?</p>
        </div>

        {/* Lista de artigos */}
        <div className="px-2">
          {!buscando && !cat && (
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Dúvidas rápidas
            </p>
          )}
          {resultados.length === 0 ? (
            <div className="px-5 py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Não encontrei nada sobre “{q.trim()}”.
              </p>
              <button
                onClick={() => onTalkToAgent(q.trim())}
                className="inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: "var(--brand)" }}
              >
                <MessageCircle className="size-4" /> Falar com um atendente
              </button>
            </div>
          ) : (
            <ul className="divide-y">
              {resultados.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => onOpenArticle(a)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/60 rounded-lg transition-colors"
                  >
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm flex-1 min-w-0">{a.titulo}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Chips de categoria */}
      <div className="shrink-0 border-t px-3 py-2 overflow-x-auto">
        <div className="flex gap-1.5 w-max">
          {KB_CATEGORIAS.map((c) => {
            const ativo = cat === c;
            return (
              <button
                key={c}
                onClick={() => { setCat(ativo ? null : c); setQ(""); }}
                className={`px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-colors ${
                  ativo ? "text-white border-transparent" : "hover:bg-muted"
                }`}
                style={ativo ? { background: "var(--brand)" } : undefined}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca + falar com atendente */}
      <div className="shrink-0 border-t p-3 space-y-2">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); if (e.target.value) setCat(null); }}
            placeholder="Pergunte qualquer coisa ao Metrix…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border-0 bg-muted/60 text-sm outline-none focus:outline-none focus:ring-0"
          />
        </div>
        <button
          onClick={() => onTalkToAgent(buscando ? q.trim() : undefined)}
          className="w-full text-center text-xs font-semibold py-1 hover:underline"
          style={{ color: "var(--brand)" }}
        >
          Falar com um atendente →
        </button>
      </div>
    </div>
  );
}
