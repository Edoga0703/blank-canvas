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
  Heart,
  Copy,
  Smile,
  BadgeAlert,
  Flame,
  Calendar,
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

interface ExtendedComment extends ContentComment {
  isLiked?: boolean;
  intent?: "commercial" | "positive" | "question";
}

const INITIAL_COMMENTS: ExtendedComment[] = [
  {
    id: "c-1",
    platform: "tiktok",
    external_comment_id: "tt-101",
    author_name: "Carlos Silveira",
    author_username: "carlos.silveira",
    text: "Qual o valor do plano e como funciona a contratação para empresas? Têm desconto anual?",
    like_count: 14,
    isLiked: false,
    intent: "commercial",
    status: "pending",
    commented_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: "c-2",
    platform: "youtube",
    external_comment_id: "yt-202",
    author_name: "Mariana Costa",
    author_username: "mariana_costa",
    text: "Excelente apresentação das novidades! Vocês emitem nota fiscal e aceitam pagamento via Pix ou boleto?",
    like_count: 32,
    isLiked: true,
    intent: "commercial",
    status: "pending",
    commented_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
  },
  {
    id: "c-3",
    platform: "instagram",
    external_comment_id: "ig-303",
    author_name: "Rodrigo Almeida",
    author_username: "rodrigoalmeida",
    text: "Excelente atendimento da equipe! A ativação e suporte foram muito rápidos. Parabéns pelo serviço!",
    like_count: 19,
    isLiked: true,
    intent: "positive",
    status: "pending",
    commented_at: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
  },
  {
    id: "c-4",
    platform: "facebook",
    external_comment_id: "fb-404",
    author_name: "Beatriz Santos",
    author_username: "beatriz.santos",
    text: "Gostei muito da demonstração das ferramentas. Onde posso agendar uma reunião com um especialista?",
    like_count: 5,
    isLiked: false,
    intent: "commercial",
    status: "replied",
    commented_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    replied_at: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
  },
];

const QUICK_RESPONSES = [
  {
    label: "Planos e Preços",
    icon: ShoppingBag,
    text: "Olá! Nossos planos atendem desde profissionais autônomos até grandes empresas. Entre em contato com nossa equipe pelo WhatsApp para receber a proposta completa sob medida!",
  },
  {
    label: "Falar no WhatsApp",
    icon: Phone,
    text: "Olá! Com certeza, nossa equipe comercial está à disposição no WhatsApp para tirar suas dúvidas e liberar sua demonstração agora mesmo.",
  },
  {
    label: "Formas de Pagamento",
    icon: CreditCard,
    text: "Olá! Aceitamos Pix com desconto, Cartão de Crédito em até 12x e Boleto Bancário faturado para pessoa jurídica, com emissão de nota fiscal.",
  },
  {
    label: "Agendar Demonstração",
    icon: Calendar,
    text: "Olá! Será um prazer demonstrar as soluções na prática. Acesse o link da nossa bio ou mande mensagem direta para agendarmos o melhor horário para você.",
  },
];

const REPLY_EMOJIS = ["👍", "❤️", "🔥", "🚀", "✨", "👋", "💬", "✅"];

export function OmnichannelCommentsInbox() {
  const [comments, setComments] = useState<ExtendedComment[]>(INITIAL_COMMENTS);
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

  // Curtir/Descurtir comentário
  const handleToggleLike = (commentId: string) => {
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          const isLiked = !c.isLiked;
          const currentCount = c.like_count || 0;
          return {
            ...c,
            isLiked,
            like_count: isLiked ? currentCount + 1 : Math.max(0, currentCount - 1),
          };
        }
        return c;
      })
    );
  };

  // Inserir emoji no campo de resposta
  const handleInsertEmoji = (commentId: string, emoji: string) => {
    setReplyTextMap((prev) => ({
      ...prev,
      [commentId]: (prev[commentId] || "") + emoji,
    }));
  };

  // Copiar resposta gerada
  const handleCopyReply = (text: string) => {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text);
    toast.success("Resposta copiada para a área de transferência!");
  };

  // Enviar resposta pública oficial
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
      toast.info("Modo demonstração: a resposta simulada foi registrada na visualização local. O disparo em produção requer aprovação de app pelas redes.");
    }, 600);
  };

  // Aplicar template rápido
  const applyQuickResponse = (commentId: string, text: string) => {
    setReplyTextMap((prev) => ({ ...prev, [commentId]: text }));
  };

  // Sugestão com IA comercial em português profissional
  const handleAiSuggest = (comment: ExtendedComment) => {
    let suggested = `Olá ${comment.author_name || ""}! Ficamos felizes com seu contato. `;
    if (
      comment.text.toLowerCase().includes("preço") ||
      comment.text.toLowerCase().includes("valor") ||
      comment.text.toLowerCase().includes("plano") ||
      comment.text.toLowerCase().includes("contratação")
    ) {
      suggested += "Nossos planos são totalmente personalizados para o tamanho da sua operação. Fale com nosso time de especialistas pelo WhatsApp ou envie uma mensagem direta para receber uma proposta exclusiva!";
    } else if (
      comment.text.toLowerCase().includes("pix") ||
      comment.text.toLowerCase().includes("pagamento") ||
      comment.text.toLowerCase().includes("nota fiscal") ||
      comment.text.toLowerCase().includes("boleto")
    ) {
      suggested += "Sim! Emitimos nota fiscal para todos os serviços e aceitamos Pix com desconto, Cartão de Crédito e Boleto. Fale conosco pelo canal de atendimento para emitir sua fatura com facilidade.";
    } else if (
      comment.text.toLowerCase().includes("agendar") ||
      comment.text.toLowerCase().includes("demonstração") ||
      comment.text.toLowerCase().includes("reunião")
    ) {
      suggested += "Com certeza! Será um prazer agendar uma demonstração exclusiva com nossa equipe. Chame no WhatsApp ou acesse o link da nossa bio para escolher o melhor horário.";
    } else {
      suggested += "Agradecemos muito pelo carinho e feedback positivo! Nossa equipe está sempre à disposição para o que você precisar.";
    }

    setReplyTextMap((prev) => ({ ...prev, [comment.id]: suggested }));
    toast.success("Resposta comercial sugerida pela IA!");
  };

  return (
    <div className="space-y-4">
      {/* Banner de Homologação / Demonstração */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
        <Sparkles className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <span className="font-bold uppercase tracking-wider text-[10px] mr-1.5 px-1.5 py-0.5 rounded bg-amber-500/20">
            DEMO / Em Homologação
          </span>
          <span>
            Esta bandeja ilustra o fluxo de triagem e respostas inteligentes. A sincronização e resposta em tempo real serão habilitadas após a homologação das permissões oficiais de comentários com as plataformas.
          </span>
        </div>
      </div>

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

          {/* Platform Filter com logos oficiais */}
          <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-[color:var(--hairline)]">
            <button
              type="button"
              onClick={() => setPlatformFilter("all")}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
                platformFilter === "all" ? "bg-muted font-bold text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setPlatformFilter("tiktok")}
              className={`p-1.5 rounded-lg transition ${
                platformFilter === "tiktok" ? "bg-foreground text-background shadow-xs" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Filtrar por TikTok"
            >
              <TikTokGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPlatformFilter("instagram")}
              className={`p-1.5 rounded-lg transition ${
                platformFilter === "instagram" ? "bg-[#E1306C] text-white shadow-xs" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Filtrar por Instagram"
            >
              <InstagramGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPlatformFilter("youtube")}
              className={`p-1.5 rounded-lg transition ${
                platformFilter === "youtube" ? "bg-[#FF0000] text-white shadow-xs" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Filtrar por YouTube"
            >
              <YouTubeGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPlatformFilter("facebook")}
              className={`p-1.5 rounded-lg transition ${
                platformFilter === "facebook" ? "bg-[#0084FF] text-white shadow-xs" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Filtrar por Facebook"
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
            placeholder="Buscar por cliente ou palavra-chave..."
            className="pl-8 h-8 text-xs bg-muted/40 rounded-xl"
          />
        </div>
      </div>

      {/* Lista de Comentários */}
      <div className="space-y-3">
        {filteredComments.length === 0 ? (
          <div className="p-12 text-center bg-[var(--panel)] border border-[color:var(--hairline)] rounded-2xl shadow-sm">
            <CheckCircle2 className="size-10 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold text-foreground">Todos os comentários estão atendidos!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Nenhuma mensagem pendente no momento com os filtros selecionados.
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
                    {/* Badge da Rede Social com cor oficial */}
                    <span
                      className={`p-1.5 rounded-xl border shrink-0 ${
                        comment.platform === "tiktok"
                          ? "bg-foreground/5 border-foreground/20 text-foreground"
                          : comment.platform === "youtube"
                          ? "bg-[#FF0000]/10 border-[#FF0000]/20 text-[#FF0000]"
                          : comment.platform === "instagram"
                          ? "bg-[#E1306C]/10 border-[#E1306C]/20 text-[#E1306C]"
                          : "bg-[#0084FF]/10 border-[#0084FF]/20 text-[#0084FF]"
                      }`}
                    >
                      {comment.platform === "tiktok" && <TikTokGlyph className="size-4" />}
                      {comment.platform === "youtube" && <YouTubeGlyph className="size-4" />}
                      {comment.platform === "instagram" && <InstagramGlyph className="size-4" />}
                      {comment.platform === "facebook" && <FacebookGlyph className="size-4" />}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
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

                  {/* Badges de Intenção Comercial e Status */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {comment.intent === "commercial" && (
                      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold flex items-center gap-1">
                        <Flame className="size-3" />
                        <span>Intenção de Compra</span>
                      </Badge>
                    )}
                    {comment.intent === "positive" && (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-bold">
                        ⭐ Avaliação Positiva
                      </Badge>
                    )}

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
                </div>

                {/* Texto do Comentário do Cliente & Botão de Like Interativo */}
                <div className="my-3 flex items-start justify-between gap-4 pl-3 border-l-2 border-primary/40 py-1">
                  <p className="text-xs text-foreground font-medium leading-relaxed">
                    "{comment.text}"
                  </p>

                  <button
                    type="button"
                    onClick={() => handleToggleLike(comment.id)}
                    className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg border transition-all shrink-0 ${
                      comment.isLiked
                        ? "bg-red-500/10 border-red-500/20 text-red-500 font-bold"
                        : "bg-muted/30 border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    title={comment.isLiked ? "Remover curtida" : "Curtir comentário publicamente"}
                  >
                    <Heart className={`size-3 ${comment.isLiked ? "fill-red-500 text-red-500" : ""}`} />
                    <span>{comment.like_count || 0}</span>
                  </button>
                </div>

                {/* Barra de Ações Rápidas (Templates & IA) */}
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
                      className="h-6 text-[10.5px] gap-1 px-2 ml-auto text-primary border-primary/20 hover:bg-primary/10 font-bold"
                    >
                      <Sparkles className="size-3" />
                      <span>Sugerir com IA</span>
                    </Button>
                  </div>

                  {/* Barra de Emojis de Resposta Rápida */}
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-[10px] text-muted-foreground">Adicionar emoji:</span>
                    {REPLY_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleInsertEmoji(comment.id, emoji)}
                        className="size-5 text-xs hover:scale-125 transition-transform flex items-center justify-center rounded hover:bg-muted"
                      >
                        {emoji}
                      </button>
                    ))}
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

                    {replyValue.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyReply(replyValue)}
                        className="h-9 px-2 text-muted-foreground hover:text-foreground shrink-0"
                        title="Copiar texto da resposta"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    )}

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
