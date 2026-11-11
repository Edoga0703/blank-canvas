import { useState, useMemo } from "react";
import {
  MessageCircle,
  Send,
  Sparkles,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  Zap,
  ExternalLink,
  CornerDownRight,
  User,
  ShoppingBag,
  CreditCard,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  InstagramGlyph,
  FacebookGlyph,
  TikTokGlyph,
  YouTubeGlyph,
} from "@/components/ui/channel-icons";
import type { ContentComment, SocialPlatform } from "@/lib/social-content.types";

const INITIAL_COMMENTS: ContentComment[] = [
  {
    id: "c-1",
    platform: "tiktok",
    external_comment_id: "tt-101",
    author_name: "Carlos Mendoza",
    author_username: "carlos_mendoza98",
    text: "¿Tienen disponible Paramount+ y a qué precio en bolívares a la tasa de hoy?",
    like_count: 14,
    status: "pending",
    commented_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: "c-2",
    platform: "youtube",
    external_comment_id: "yt-202",
    author_name: "Tech Reviewer",
    author_username: "TechReviewerPro",
    text: "Excelente servicio, la cuenta de Gemini Pro de 5TB me funcionó perfecto. ¿La anualidad de Canva Pro está en $8?",
    like_count: 32,
    status: "pending",
    commented_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
  },
  {
    id: "c-3",
    platform: "instagram",
    external_comment_id: "ig-303",
    author_name: "Valentina Gómez",
    author_username: "valengomez_fit",
    text: "Hola! ¿Aceptan pago por Binance (USDT)? ¿Cómo hago para comprar?",
    like_count: 8,
    status: "pending",
    commented_at: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
  },
  {
    id: "c-4",
    platform: "facebook",
    external_comment_id: "fb-404",
    author_name: "Roberto Da Silva",
    author_username: "roberto.dasilva",
    text: "Me interesa el combo de Disney+ y Max. ¿Dónde puedo contactar a un asesor?",
    like_count: 5,
    status: "replied",
    commented_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    replied_at: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
  },
];

const QUICK_RESPONSES = [
  {
    label: "Precios Streaming",
    icon: ShoppingBag,
    text: "¡Hola! Precios en USD (o Bs tasa del día): Paramount+ $1.00/mes | Max $1.50/mes | Disney+ $1.50/mes | Prime Video $1.50/mes. Escríbenos al WhatsApp para activarla de inmediato.",
  },
  {
    label: "Enlace WhatsApp",
    icon: Phone,
    text: "¡Hola! Con gusto te atendemos directamente por WhatsApp con entrega inmediata: https://wa.me/584122146880",
  },
  {
    label: "Métodos de Pago",
    icon: CreditCard,
    text: "¡Hola! Aceptamos Pago Móvil (a tasa del día), Binance Pay (USDT), Zinli y Wally con activación inmediata.",
  },
];

export function OmnichannelCommentsInbox() {
  const [comments, setComments] = useState<ContentComment[]>(INITIAL_COMMENTS);
  const [activeFilter, setActiveFilter] = useState<"all" | "pending" | "replied">("pending");
  const [platformFilter, setPlatformFilter] = useState<SocialPlatform | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Filtragem
  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      if (activeFilter === "pending" && c.status !== "pending") return false;
      if (activeFilter === "replied" && c.status !== "replied") return false;
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.text.toLowerCase().includes(q) ||
          (c.author_username || "").toLowerCase().includes(q) ||
          (c.author_name || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [comments, activeFilter, platformFilter, searchQuery]);

  const pendingCount = useMemo(() => {
    return comments.filter((c) => c.status === "pending").length;
  }, [comments]);

  // Enviar resposta pública
  const handleSendReply = (commentId: string) => {
    const text = replyTextMap[commentId]?.trim();
    if (!text) {
      toast.error("Escreva uma resposta para enviar.");
      return;
    }

    setSendingId(commentId);
    setTimeout(() => {
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, status: "replied", replied_at: new Date().toISOString() }
            : c
        )
      );
      setReplyTextMap((prev) => ({ ...prev, [commentId]: "" }));
      setSendingId(null);
      toast.success("Resposta pública enviada com sucesso!");
    }, 600);
  };

  // Preencher resposta rápida
  const applyQuickResponse = (commentId: string, text: string) => {
    setReplyTextMap((prev) => ({ ...prev, [commentId]: text }));
  };

  // Sugerir resposta com IA
  const handleAiSuggest = (comment: ContentComment) => {
    let suggested = `¡Hola ${comment.author_name || ""}! Con gusto te damos información. `;
    if (comment.text.toLowerCase().includes("binance") || comment.text.toLowerCase().includes("pago")) {
      suggested += "Aceptamos Binance USDT y Pago Móvil con entrega en 5 minutos. Escríbenos al WhatsApp para activar tu cuenta: https://wa.me/584122146880";
    } else if (comment.text.toLowerCase().includes("canva")) {
      suggested += "Sí, Canva Pro Anual está en $8.00 con garantía total de 12 meses. Escríbenos al WhatsApp para activarla al instante: https://wa.me/584122146880";
    } else {
      suggested += "Tenemos promociones activas en streaming y software. Escríbenos por WhatsApp para enviarte el catálogo completo: https://wa.me/584122146880";
    }

    setReplyTextMap((prev) => ({ ...prev, [comment.id]: suggested }));
    toast.success("Resposta comercial sugerida pela IA!");
  };

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Busca */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[var(--panel)] border border-[color:var(--hairline)] rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <div className="inline-flex p-1 rounded-xl bg-muted/50 border border-[color:var(--hairline)]">
            <button
              type="button"
              onClick={() => setActiveFilter("pending")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeFilter === "pending"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Sem responder</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("replied")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeFilter === "replied"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Respondidos
            </button>
          </div>

          {/* Platform Filter */}
          <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-[color:var(--hairline)]">
            <button
              type="button"
              onClick={() => setPlatformFilter("all")}
              className={`px-2 py-1 rounded-lg text-xs font-medium ${
                platformFilter === "all" ? "bg-muted font-bold text-foreground" : "text-muted-foreground"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setPlatformFilter("tiktok")}
              className={`p-1.5 rounded-lg transition-colors ${
                platformFilter === "tiktok" ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"
              }`}
              title="TikTok"
            >
              <TikTokGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPlatformFilter("instagram")}
              className={`p-1.5 rounded-lg transition-colors ${
                platformFilter === "instagram" ? "bg-[#E1306C] text-white" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Instagram"
            >
              <InstagramGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPlatformFilter("youtube")}
              className={`p-1.5 rounded-lg transition-colors ${
                platformFilter === "youtube" ? "bg-[#FF0000] text-white" : "hover:bg-muted text-muted-foreground"
              }`}
              title="YouTube"
            >
              <YouTubeGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPlatformFilter("facebook")}
              className={`p-1.5 rounded-lg transition-colors ${
                platformFilter === "facebook" ? "bg-[#0084FF] text-white" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Facebook"
            >
              <FacebookGlyph className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Input de Busca */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar comentários ou autores..."
            className="pl-8 h-8 text-xs bg-muted/40 rounded-xl"
          />
        </div>
      </div>

      {/* Lista de Comentários */}
      <div className="space-y-3">
        {filteredComments.length === 0 ? (
          <div className="p-12 text-center bg-[var(--panel)] border border-[color:var(--hairline)] rounded-2xl">
            <CheckCircle2 className="size-10 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold text-foreground">Todos os comentários estão atendidos!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Nenhuma mensagem pendente no momento. As vendas e o engajamento estão em dia.
            </p>
          </div>
        ) : (
          filteredComments.map((comment) => {
            const isPending = comment.status === "pending";
            const replyValue = replyTextMap[comment.id] || "";

            return (
              <div
                key={comment.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isPending
                    ? "bg-[var(--panel)] border-amber-500/30 shadow-sm ring-1 ring-amber-500/10"
                    : "bg-[var(--panel)]/70 border-[color:var(--hairline)] opacity-85"
                }`}
              >
                {/* Cabeçalho do Comentário */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Badge da Rede Social */}
                    <span className="p-1.5 rounded-lg bg-muted shrink-0">
                      {comment.platform === "tiktok" && <TikTokGlyph className="size-3.5" />}
                      {comment.platform === "youtube" && <YouTubeGlyph className="size-3.5 text-[#FF0000]" />}
                      {comment.platform === "instagram" && <InstagramGlyph className="size-3.5 text-[#E1306C]" />}
                      {comment.platform === "facebook" && <FacebookGlyph className="size-3.5 text-[#0084FF]" />}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">
                          {comment.author_name || comment.author_username}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          @{comment.author_username}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        Em {comment.platform} • {new Date(comment.commented_at || "").toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {isPending ? (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-semibold">
                      Pendente
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-semibold flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      <span>Respondido</span>
                    </Badge>
                  )}
                </div>

                {/* Texto do Comentário do Cliente */}
                <div className="my-3 pl-3 border-l-2 border-primary/40 py-0.5">
                  <p className="text-xs text-foreground font-medium leading-relaxed">
                    "{comment.text}"
                  </p>
                </div>

                {/* Barra de Ações Rápidas (Plantillas & IA) */}
                <div className="pt-2 border-t border-[color:var(--hairline)] space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10.5px] font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                      <Zap className="size-3" /> Respostas Rápidas:
                    </span>
                    {QUICK_RESPONSES.map((qr, idx) => {
                      const Icon = qr.icon;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => applyQuickResponse(comment.id, qr.text)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-medium bg-muted/60 hover:bg-muted text-foreground border border-[color:var(--hairline)] transition-colors"
                        >
                          <Icon className="size-2.5 text-primary" />
                          <span>{qr.label}</span>
                        </button>
                      );
                    })}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAiSuggest(comment)}
                      className="h-6 text-[10.5px] gap-1 px-2 ml-auto text-primary border-primary/20 hover:bg-primary/10"
                    >
                      <Sparkles className="size-3" />
                      <span>Sugerir com IA</span>
                    </Button>
                  </div>

                  {/* Campo de Resposta Pública */}
                  <div className="flex items-center gap-2">
                    <CornerDownRight className="size-4 text-muted-foreground shrink-0 ml-1" />
                    <Input
                      value={replyValue}
                      onChange={(e) =>
                        setReplyTextMap((prev) => ({ ...prev, [comment.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply(comment.id);
                        }
                      }}
                      placeholder={`Responder publicamente a @${comment.author_username} em ${comment.platform}...`}
                      className="h-9 text-xs bg-muted/30 rounded-xl"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!replyValue.trim() || sendingId === comment.id}
                      onClick={() => handleSendReply(comment.id)}
                      className="h-9 px-3.5 bg-primary text-primary-foreground font-semibold rounded-xl text-xs gap-1.5 shrink-0"
                    >
                      <Send className="size-3.5" />
                      <span className="hidden sm:inline">Responder</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
