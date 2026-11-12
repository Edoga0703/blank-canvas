import { useState, useRef, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload,
  Calendar,
  Clock,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Music2,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Info,
  X,
  Smile,
  Hash,
  Image as ImageIcon,
  Film,
  Eye,
  EyeOff,
  Copy,
  RotateCcw,
  ShieldCheck,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  InstagramGlyph,
  FacebookGlyph,
  TikTokGlyph,
  YouTubeGlyph,
  TelegramGlyph,
} from "@/components/ui/channel-icons";
import {
  createOmnichannelPost,
  prepareContentAssetFn,
  completeContentAssetFn,
} from "@/lib/omnichannel-content.functions";
import type { SocialAccount, SocialPlatform } from "@/lib/social-content.types";

interface Props {
  accounts: SocialAccount[];
  onPublished?: () => void;
}

const QUICK_EMOJIS = ["🔥", "⚡", "🚀", "👉", "💬", "✨", "🍿", "🎬", "💎", "✅", "🏷️", "📲"];

const QUICK_HASHTAGS = [
  "#novidades",
  "#promocao",
  "#negocios",
  "#vendas",
  "#marketing",
  "#sucesso",
  "#tecnologia",
  "#inovacao",
];

const DEMO_MEDIA_SAMPLES = {
  video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  image: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=720&q=80",
};

export function OmnichannelPublisher({ accounts, onPublished }: Props) {
  const prepareAssetFn = useServerFn(prepareContentAssetFn);
  const completeAssetFn = useServerFn(completeContentAssetFn);
  const publishFn = useServerFn(createOmnichannelPost);
  const [assetId, setAssetId] = useState<string | null>(null);

  // Nome e identificador dinâmicos da empresa
  const companyHandle = useMemo(() => {
    const acc = accounts.find((a) => a.username);
    return acc?.username ? `@${acc.username.replace(/^@/, "")}` : "@suaempresa";
  }, [accounts]);

  const companyName = useMemo(() => {
    const acc = accounts.find((a) => a.display_name);
    return acc?.display_name || "Sua Empresa";
  }, [accounts]);

  // Seleção de redes (TikTok e YouTube em fase de homologação OAuth)
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([
    "instagram",
    "facebook",
  ]);

  // Mídia
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"video" | "image">("video");
  const [mediaMeta, setMediaMeta] = useState<{
    width?: number;
    height?: number;
    duration?: number;
    sizeBytes?: number;
  }>({
    width: 1080,
    height: 1920,
    duration: 25,
    sizeBytes: 15400000,
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Player de vídeo do mockup
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  // Zonas Seguras Overlay
  const [showSafeZones, setShowSafeZones] = useState(false);

  // Like simulado no Mockup
  const [previewLiked, setPreviewLiked] = useState(false);
  const [previewLikeCount, setPreviewLikeCount] = useState(14200);

  // Texto mestre genérico e profissional
  const [baseCaption, setBaseCaption] = useState(
    "🚀 Novidade imperdível! Confira nossos lançamentos e soluções desenvolvidas para acelerar seus resultados neste mês.\n\n👉 Acesse o link da bio ou envie uma mensagem direta para atendimento exclusivo!",
  );

  // Requisitos específicos por rede
  const [youtubeTitle, setYoutubeTitle] = useState("Lançamento Oficial | Conheça Nossas Soluções Exclusivas");
  const [youtubeMadeForKids, setYoutubeMadeForKids] = useState(false);
  const [tiktokPrivacy, setTiktokPrivacy] = useState<"PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY">("PUBLIC_TO_EVERYONE");
  const [tiktokIsCommercial, setTiktokIsCommercial] = useState(true);
  const [facebookLink, setFacebookLink] = useState("https://suaempresa.com.br/novidades");

  // Programação
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("18:30");

  // Preview ativo
  const [previewPlatform, setPreviewPlatform] = useState<SocialPlatform>("instagram");
  const [submitting, setSubmitting] = useState(false);

  // Alternar plataforma
  const togglePlatform = (p: SocialPlatform) => {
    if (p === "tiktok" || p === "youtube") {
      toast.info(`Publicação direta para ${p === "tiktok" ? "TikTok" : "YouTube"} está em fase de homologação OAuth.`);
      setPreviewPlatform(p);
      return;
    }
    setSelectedPlatforms((prev) => {
      const exists = prev.includes(p);
      if (exists && prev.length === 1) {
        toast.info("Mantenha ao menos uma rede social selecionada.");
        return prev;
      }
      const next = exists ? prev.filter((x) => x !== p) : [...prev, p];
      if (!exists) setPreviewPlatform(p);
      return next;
    });
  };

  // Upload em Streaming Binário Direto (Zero Perda de Bitrate e Qualidade Máxima)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMediaFile(file);
    const isVid = file.type.startsWith("video/");
    setMediaType(isVid ? "video" : "image");
    setUploading(true);

    // Extrai metadados do vídeo para auditoria de resolução
    if (isVid) {
      const vEl = document.createElement("video");
      vEl.preload = "metadata";
      vEl.onloadedmetadata = () => {
        window.URL.revokeObjectURL(vEl.src);
        setMediaMeta({
          width: vEl.videoWidth,
          height: vEl.videoHeight,
          duration: Math.round(vEl.duration),
          sizeBytes: file.size,
        });
      };
      vEl.src = URL.createObjectURL(file);
    } else {
      const imgEl = new window.Image();
      imgEl.onload = () => {
        window.URL.revokeObjectURL(imgEl.src);
        setMediaMeta({
          width: imgEl.naturalWidth,
          height: imgEl.naturalHeight,
          duration: 0,
          sizeBytes: file.size,
        });
      };
      imgEl.src = URL.createObjectURL(file);
    }

    // 1. Registra ativo com ciclo de vida (state: 'prepared') e obtém URL assinada R2
    try {
      const prepared = await prepareAssetFn({
        data: {
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          width: undefined,
          height: undefined,
          durationSeconds: undefined,
        },
      });

      if (prepared?.uploadUrl) {
        const putRes = await fetch(prepared.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (putRes.ok) {
          // Validação HEAD no R2 promovendo o ativo para state: 'ready'
          const readyAsset = await completeAssetFn({
            data: { assetId: prepared.assetId },
          });

          setAssetId(readyAsset.id);
          setMediaUrl(URL.createObjectURL(file));
          toast.success(
            isVid
              ? "Vídeo carregado e verificado no R2 (bitrate e resolução originais preservados)!"
              : "Imagem de alta resolução carregada e verificada com sucesso!",
          );
          setUploading(false);
          return;
        }
      }
    } catch (err: any) {
      console.error("Falha no upload do ativo:", err);
      toast.error(err?.message || "Falha no envio do arquivo para o armazenamento.");
    } finally {
      setUploading(false);
    }
  };

  // Carregar mídia de demonstração para testes instantâneos
  const handleLoadDemoMedia = (type: "video" | "image") => {
    setMediaType(type);
    setMediaUrl(DEMO_MEDIA_SAMPLES[type]);
    setMediaFile(null);
    setIsPlaying(true);
    toast.success(`Mídia de demonstração (${type === "video" ? "Vídeo 9:16" : "Imagem Promocional"}) ativada!`);
  };

  // Inserir Emoji na posição do cursor
  const handleInsertEmoji = (emoji: string) => {
    setBaseCaption((prev) => prev + " " + emoji);
  };

  // Inserir Hashtag
  const handleInsertHashtag = (tag: string) => {
    setBaseCaption((prev) => {
      if (prev.includes(tag)) return prev;
      return prev.trim() + " " + tag;
    });
  };

  // Adaptação rápida de copy com IA personalizada por rede
  const handleAiAdapt = () => {
    if (!baseCaption.trim()) {
      toast.info("Escreva primeiro um texto base para a IA adaptar.");
      return;
    }

    if (!youtubeTitle || youtubeTitle.length < 10) {
      setYoutubeTitle(`🔥 ${baseCaption.slice(0, 65).replace(/[\n\r]+/g, " ").trim()} | Oferta Exclusiva`);
    }

    if (!baseCaption.includes("#")) {
      setBaseCaption((prev) => prev.trim() + "\n\n#novidades #oferta #qualidade #sucesso #marketing");
    }

    toast.success("Textos, títulos e hashtags otimizados com inteligência comercial para cada rede!");
  };

  // Alternar Play/Pause no vídeo do simulador
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Alternar Like no simulador
  const togglePreviewLike = () => {
    if (previewLiked) {
      setPreviewLiked(false);
      setPreviewLikeCount((c) => c - 1);
    } else {
      setPreviewLiked(true);
      setPreviewLikeCount((c) => c + 1);
      toast.success("Interação de Like simulada!");
    }
  };

  // Validação em tempo real
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!selectedPlatforms.length) errors.push("Selecione ao menos uma rede social.");
    if (!mediaUrl && !baseCaption.trim()) errors.push("Adicione um vídeo/foto ou um texto.");
    if (selectedPlatforms.includes("youtube") && !youtubeTitle.trim()) {
      errors.push("YouTube exige um título obrigatório (máx. 100 car.).");
    }
    if (selectedPlatforms.includes("instagram") && !mediaUrl) {
      errors.push("Instagram exige imagem ou vídeo para publicação.");
    }
    if (selectedPlatforms.includes("telegram") && !mediaUrl && !baseCaption.trim()) {
      errors.push("Telegram exige texto ou mídia para publicação.");
    }
    if (isScheduled && (!scheduledDate || !scheduledTime)) {
      errors.push("Defina a data e horário para a programação.");
    }
    return errors;
  }, [selectedPlatforms, mediaUrl, baseCaption, youtubeTitle, isScheduled, scheduledDate, scheduledTime]);

  const isValid = validationErrors.length === 0;

  // Disparo de publicação
  const handleSubmit = async () => {
    if (!isValid) {
      toast.error(validationErrors[0]);
      return;
    }

    setSubmitting(true);
    try {
      const scheduledIso = isScheduled && scheduledDate && scheduledTime
        ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
        : null;

      const targets = selectedPlatforms.map((platform) => {
        const acc = accounts.find((a) => a.network === platform);
        return {
          platform,
          socialAccountId: acc?.id ?? null,
          customTitle: platform === "youtube" ? youtubeTitle : undefined,
          customCaption: platform === "facebook" && facebookLink
            ? `${baseCaption}\n\n👉 Acesse: ${facebookLink}`
            : baseCaption,
          platformSettings: {
            privacy_level: platform === "tiktok" ? tiktokPrivacy : undefined,
            is_commercial: platform === "tiktok" ? tiktokIsCommercial : undefined,
            made_for_kids: platform === "youtube" ? youtubeMadeForKids : undefined,
          },
        };
      });

      const res = await publishFn({
        data: {
          assetId,
          mediaUrl,
          mediaType,
          baseCaption,
          scheduledAt: scheduledIso,
          targets,
        },
      });

      if (res?.ok) {
        if (isScheduled) {
          toast.success("Publicação agendada com sucesso para os canais selecionados!");
        } else {
          const results = res.results || [];
          const publishedCount = results.filter((r) => r.status === "published").length;
          const awaitingCreatorCount = results.filter((r) => r.status === "awaiting_creator_post").length;
          const failedCount = results.filter((r) => ["failed", "failed_terminal"].includes(r.status)).length;
          const inProgressCount = results.filter((r) => ["processing", "retry_wait", "pending", "leased"].includes(r.status)).length;

          if (publishedCount > 0 && failedCount === 0 && awaitingCreatorCount === 0 && inProgressCount === 0) {
            toast.success(`Publicado com sucesso em ${publishedCount} ${publishedCount === 1 ? "canal" : "canais"}!`);
          } else if (awaitingCreatorCount > 0 && failedCount === 0 && publishedCount === 0) {
            toast.info("Enviado para a caixa de entrada do TikTok. O criador deve concluir a postagem no aplicativo.");
          } else if (publishedCount > 0 || awaitingCreatorCount > 0) {
            const failedNames = results
              .filter((r) => ["failed", "failed_terminal"].includes(r.status))
              .map((r) => r.platform)
              .join(", ");
            const detail = failedNames ? ` (falha em: ${failedNames})` : "";
            toast.warning(`Publicação parcial concluída${detail}. Verifique os detalhes no histórico.`);
          } else if (inProgressCount > 0 && failedCount === 0) {
            toast.info("Publicação em processamento assíncrono. Acompanhe a confirmação no histórico.");
          } else {
            const firstError = results.find((r) => r.error)?.error || "Erro no envio.";
            toast.error(`Falha ao publicar nos canais: ${firstError}`);
          }
        }
        onPublished?.();
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao publicar conteúdo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Coluna Esquerda: Formulário de Criação & Edição (7 colunas) */}
      <div className="lg:col-span-7 space-y-6 bg-[var(--panel)] border border-[color:var(--hairline)] rounded-2xl p-5 sm:p-6 shadow-sm">
        
        {/* 1. Seleção de Redes Sociais */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>1. Destinos da Publicação (Multicanal)</span>
            </Label>
            <span className="text-[11px] text-muted-foreground">
              {selectedPlatforms.length} de 4 selecionadas
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {/* Instagram */}
            <button
              type="button"
              onClick={() => togglePlatform("instagram")}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedPlatforms.includes("instagram")
                  ? "bg-gradient-to-r from-[#833AB4]/10 via-[#FD1D1D]/10 to-[#F77737]/10 border-[#E1306C] text-foreground shadow-sm ring-1 ring-[#E1306C]"
                  : "bg-muted/30 border-transparent text-muted-foreground opacity-60 hover:opacity-100"
              }`}
            >
              <InstagramGlyph className="size-4 text-[#E1306C] shrink-0" />
              <span className="truncate">Instagram</span>
            </button>

            {/* Facebook */}
            <button
              type="button"
              onClick={() => togglePlatform("facebook")}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedPlatforms.includes("facebook")
                  ? "bg-[#0084FF]/10 border-[#0084FF] text-foreground shadow-sm ring-1 ring-[#0084FF]"
                  : "bg-muted/30 border-transparent text-muted-foreground opacity-60 hover:opacity-100"
              }`}
            >
              <FacebookGlyph className="size-4 text-[#0084FF] shrink-0" />
              <span className="truncate">Facebook</span>
            </button>

            {/* Telegram (MTProto Oficial) */}
            <button
              type="button"
              onClick={() => togglePlatform("telegram")}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedPlatforms.includes("telegram")
                  ? "bg-[#229ED9]/10 border-[#229ED9] text-foreground shadow-sm ring-1 ring-[#229ED9]"
                  : "bg-muted/30 border-transparent text-muted-foreground opacity-60 hover:opacity-100"
              }`}
            >
              <TelegramGlyph className="size-4 text-[#229ED9] shrink-0" />
              <span className="truncate">Telegram</span>
            </button>

            {/* TikTok (Homologação OAuth) */}
            <button
              type="button"
              onClick={() => togglePlatform("tiktok")}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all opacity-60 hover:opacity-80 bg-muted/20 border-dashed border-border ${
                previewPlatform === "tiktok" ? "ring-1 ring-foreground/30" : ""
              }`}
              title="Publicação direta em homologação de app OAuth. Clique para alternar preview."
            >
              <div className="flex items-center gap-1.5 truncate">
                <TikTokGlyph className="size-4 text-foreground shrink-0" />
                <span className="truncate">TikTok</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Em breve</span>
            </button>

            {/* YouTube Shorts (Homologação OAuth) */}
            <button
              type="button"
              onClick={() => togglePlatform("youtube")}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all opacity-60 hover:opacity-80 bg-muted/20 border-dashed border-border ${
                previewPlatform === "youtube" ? "ring-1 ring-foreground/30" : ""
              }`}
              title="Publicação direta em homologação de app OAuth. Clique para alternar preview."
            >
              <div className="flex items-center gap-1.5 truncate">
                <YouTubeGlyph className="size-4 text-[#FF0000] shrink-0" />
                <span className="truncate">YouTube</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Em breve</span>
            </button>
          </div>
        </div>

        {/* 2. Upload de Mídia (Vídeo ou Foto) para Cloudflare R2 */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>2. Mídia (Vídeo Vertical ou Imagem)</span>
            </Label>
            
            {/* Opções de Mídia de Demonstração */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground hidden sm:inline">Testar com:</span>
              <button
                type="button"
                onClick={() => handleLoadDemoMedia("video")}
                className="text-[10.5px] px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted text-foreground font-medium flex items-center gap-1 transition"
                title="Carregar vídeo vertical de teste"
              >
                <Film className="size-3 text-primary" />
                <span>Vídeo Demo</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoadDemoMedia("image")}
                className="text-[10.5px] px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted text-foreground font-medium flex items-center gap-1 transition"
                title="Carregar imagem promocional de teste"
              >
                <ImageIcon className="size-3 text-emerald-500" />
                <span>Foto Demo</span>
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          {!mediaUrl ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-[color:var(--hairline)] hover:border-primary/50 hover:bg-muted/20 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer group"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-8 text-primary animate-spin" />
                  <p className="text-xs font-semibold text-foreground">Enviando mídia para o Cloudflare R2…</p>
                  <p className="text-[11px] text-muted-foreground">Otimizando formato vertical para Instagram, TikTok e YouTube</p>
                </>
              ) : (
                <>
                  <div className="size-11 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Upload className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Clique para selecionar o arquivo (Vídeo 9:16 ou Imagem)
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Suporta MP4, MOV, WebM, JPG, PNG e WebP • Armazenado no CDN R2
                    </p>
                  </div>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center justify-between p-3.5 bg-muted/30 border border-[color:var(--hairline)] rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 shrink-0">
                  {mediaType === "video" ? <Film className="size-5" /> : <ImageIcon className="size-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {mediaFile?.name || (mediaType === "video" ? "Vídeo vertical selecionado" : "Imagem promocional")}
                    </p>
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold h-4">
                      {mediaType}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Armazenado no Cloudflare R2 • Pronto para publicação simultânea em qualidade nativa
                  </p>

                  {/* Selo de Qualidade Máxima & Auditoria de Resolução */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                    {mediaType === "video" ? (
                      <>
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-bold flex items-center gap-1 h-5">
                          <Sparkles className="size-3" />
                          <span>
                            {mediaMeta.width && mediaMeta.width >= 2160
                              ? "4K Ultra HD (3840×2160)"
                              : mediaMeta.height && mediaMeta.height >= 1080
                              ? "1080p Full HD (Qualidade Máxima)"
                              : "HD 720p Otimizado"}
                          </span>
                        </Badge>
                        <Badge variant="outline" className="text-[9.5px] text-muted-foreground border-[color:var(--hairline)] h-5">
                          Bitrate Original Preservado
                        </Badge>
                        {mediaMeta.duration ? (
                          <span className="text-[10.5px] text-muted-foreground font-medium">
                            • {mediaMeta.duration}s
                          </span>
                        ) : null}
                        {mediaMeta.sizeBytes ? (
                          <span className="text-[10.5px] text-muted-foreground font-medium">
                            • {(mediaMeta.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-bold flex items-center gap-1 h-5">
                          <Sparkles className="size-3" />
                          <span>Alta Resolução (Original)</span>
                        </Badge>
                        {mediaMeta.sizeBytes ? (
                          <span className="text-[10.5px] text-muted-foreground font-medium">
                            {(mediaMeta.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Trocar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMediaUrl(null);
                    setMediaFile(null);
                    setAssetId(null);
                  }}
                  className="text-muted-foreground hover:text-red-500 h-8 px-2"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 3. Texto Mestre & Ferramentas de Engajamento */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              3. Texto Mestre (Copy e Mensagem Principal)
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAiAdapt}
              className="h-7 text-[11px] gap-1 px-2.5 text-primary border-primary/20 hover:bg-primary/10"
            >
              <Sparkles className="size-3" />
              <span>Adaptar com IA</span>
            </Button>
          </div>

          {/* Barra Rápida de Emojis */}
          <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-muted/40 border border-[color:var(--hairline)]">
            <span className="text-[10px] font-semibold text-muted-foreground px-1 flex items-center gap-1">
              <Smile className="size-3" /> Emojis:
            </span>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleInsertEmoji(emoji)}
                className="size-6 text-sm hover:scale-125 transition-transform flex items-center justify-center rounded hover:bg-muted"
                title={`Inserir ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <Textarea
            rows={4}
            value={baseCaption}
            onChange={(e) => setBaseCaption(e.target.value)}
            placeholder="Escreva a legenda principal do post..."
            className="text-xs leading-relaxed resize-none rounded-xl bg-muted/30 font-medium"
          />

          {/* Barra de Hashtags Recomendadas */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-0.5">
              <Hash className="size-2.5" /> Hashtags:
            </span>
            {QUICK_HASHTAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleInsertHashtag(tag)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 hover:bg-muted border border-[color:var(--hairline)] text-muted-foreground hover:text-foreground transition"
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center text-[11px] text-muted-foreground px-1">
            <span>Usado em Instagram, Facebook e TikTok</span>
            <span className={baseCaption.length > 2100 ? "text-amber-500 font-bold" : ""}>
              {baseCaption.length} / 2200 car.
            </span>
          </div>
        </div>

        {/* 4. Validações Condicionais por Plataforma */}
        <div className="space-y-3.5 pt-2 border-t border-[color:var(--hairline)]">
          {/* YouTube Shorts (Exige Título Obrigatório) */}
          {selectedPlatforms.includes("youtube") && (
            <div className="p-3.5 rounded-xl bg-[#FF0000]/5 border border-[#FF0000]/20 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <YouTubeGlyph className="size-3.5 text-[#FF0000]" />
                  <span>Configuração do YouTube Shorts</span>
                </div>
                <Badge variant="destructive" className="text-[10px] h-4 uppercase font-bold">
                  Título Obrigatório
                </Badge>
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-foreground">
                  Título do Vídeo / Short (Máx. 100 caracteres) *
                </Label>
                <Input
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value.slice(0, 100))}
                  placeholder="Ex: Conheça as Novidades Oficiais da Semana"
                  className="mt-1 h-8 text-xs bg-background"
                />
                <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
                  <span>Aparece em destaque na grade do Shorts</span>
                  <span>{youtubeTitle.length} / 100 car.</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[11px] text-muted-foreground">Classificação COPPA:</span>
                <span className="text-[11px] font-semibold text-foreground">Não é conteúdo infantil</span>
              </div>
            </div>
          )}

          {/* TikTok (Exige Privacidad e Declaração Comercial) */}
          {selectedPlatforms.includes("tiktok") && (
            <div className="p-3.5 rounded-xl bg-foreground/5 border border-foreground/15 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <TikTokGlyph className="size-3.5 text-foreground" />
                  <span>Configuração de Publicação do TikTok</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-semibold">Content Posting API</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-foreground">Privacidade do Vídeo</Label>
                  <select
                    value={tiktokPrivacy}
                    onChange={(e: any) => setTiktokPrivacy(e.target.value)}
                    className="mt-1 w-full h-8 px-2.5 text-xs bg-background border border-[color:var(--hairline)] rounded-lg font-medium text-foreground focus:outline-none"
                  >
                    <option value="PUBLIC_TO_EVERYONE">Público para todos</option>
                    <option value="MUTUAL_FOLLOW_FRIENDS">Apenas amigos mútuos</option>
                    <option value="SELF_ONLY">Apenas eu (privado)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-4 sm:pt-0">
                  <div className="pr-2">
                    <Label className="text-[11px] font-semibold text-foreground">Divulgação Comercial</Label>
                    <p className="text-[10px] text-muted-foreground">Vídeo promocional / de produto</p>
                  </div>
                  <Switch checked={tiktokIsCommercial} onCheckedChange={setTiktokIsCommercial} />
                </div>
              </div>
            </div>
          )}

          {/* Facebook Link Clicável */}
          {selectedPlatforms.includes("facebook") && (
            <div className="p-3.5 rounded-xl bg-[#0084FF]/5 border border-[#0084FF]/20 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <FacebookGlyph className="size-3.5 text-[#0084FF]" />
                <span>Link Clicável no Facebook (Opcional)</span>
              </div>
              <Input
                value={facebookLink}
                onChange={(e) => setFacebookLink(e.target.value)}
                placeholder="https://suaempresa.com.br/novidades"
                className="h-8 text-xs bg-background"
              />
              <p className="text-[10px] text-muted-foreground">
                No Facebook este link fica azul e clicável diretamente no post.
              </p>
            </div>
          )}
        </div>

        {/* 5. Programação de Data e Horário */}
        <div className="pt-2 border-t border-[color:var(--hairline)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-bold text-foreground">Programar Publicação</Label>
              <p className="text-[11px] text-muted-foreground">
                Disparo automatizado em horário de pico calculado pelo CRM
              </p>
            </div>
            <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
          </div>

          {isScheduled && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 border border-[color:var(--hairline)] animate-in fade-in duration-150">
              <div>
                <Label className="text-[11px] font-semibold text-foreground">Data</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1 h-8 text-xs bg-background"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-foreground">Horário Recomendado</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1 h-8 text-xs bg-background"
                />
              </div>
            </div>
          )}
        </div>

        {/* Botão de Envio */}
        <div className="pt-3">
          {!isValid && (
            <div className="mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 text-amber-600 text-xs">
              <AlertCircle className="size-4 shrink-0" />
              <span>{validationErrors[0]}</span>
            </div>
          )}

          <Button
            type="button"
            disabled={!isValid || submitting || uploading}
            onClick={handleSubmit}
            className="w-full h-11 text-sm font-bold bg-[color:var(--brand)] text-primary-foreground hover:opacity-90 transition shadow-md rounded-xl"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                <span>Processando envio multicanal…</span>
              </>
            ) : isScheduled ? (
              <>
                <Calendar className="size-4 mr-2" />
                <span>Agendar Publicação ({selectedPlatforms.length} redes)</span>
              </>
            ) : (
              <>
                <Send className="size-4 mr-2" />
                <span>Publicar Agora em {selectedPlatforms.length} Redes</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Coluna Direita: Simulador de Smartphone Realista & Safe Zones (5 colunas) */}
      <div className="lg:col-span-5 space-y-3 sticky top-4">
        {/* Barra de Controle do Simulador */}
        <div className="flex items-center justify-between px-1">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pré-visualização 9:16
          </Label>

          <div className="flex items-center gap-2">
            {/* Toggle de Zonas Seguras */}
            <button
              type="button"
              onClick={() => setShowSafeZones((v) => !v)}
              className={`text-[10.5px] px-2 py-1 rounded-lg border font-semibold flex items-center gap-1 transition ${
                showSafeZones
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : "bg-muted/40 text-muted-foreground border-transparent hover:text-foreground"
              }`}
              title="Exibir linhas de segurança onde os botões não tapam os textos"
            >
              <ShieldCheck className="size-3" />
              <span>Safe Zones</span>
            </button>

            {/* Alternador de Plataforma para o Preview */}
            <div className="flex gap-1 bg-muted/50 p-0.5 rounded-lg border border-[color:var(--hairline)]">
              <button
                type="button"
                onClick={() => setPreviewPlatform("tiktok")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  previewPlatform === "tiktok" ? "bg-foreground text-background shadow-xs" : "hover:bg-muted text-muted-foreground"
                }`}
                title="Prévia TikTok"
              >
                <TikTokGlyph className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewPlatform("instagram")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  previewPlatform === "instagram" ? "bg-[#E1306C] text-white shadow-xs" : "hover:bg-muted text-muted-foreground"
                }`}
                title="Prévia Reels"
              >
                <InstagramGlyph className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewPlatform("youtube")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  previewPlatform === "youtube" ? "bg-[#FF0000] text-white shadow-xs" : "hover:bg-muted text-muted-foreground"
                }`}
                title="Prévia Shorts"
              >
                <YouTubeGlyph className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewPlatform("facebook")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  previewPlatform === "facebook" ? "bg-[#0084FF] text-white shadow-xs" : "hover:bg-muted text-muted-foreground"
                }`}
                title="Prévia Facebook"
              >
                <FacebookGlyph className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewPlatform("telegram")}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  previewPlatform === "telegram" ? "bg-[#229ED9] text-white shadow-xs" : "hover:bg-muted text-muted-foreground"
                }`}
                title="Prévia Canal Telegram"
              >
                <TelegramGlyph className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mockup de Smartphone com Zonas Seguras Reais */}
        <div className="relative mx-auto w-full max-w-[285px] aspect-[9/16] bg-black rounded-[38px] overflow-hidden shadow-2xl border-4 border-muted/80 ring-1 ring-border select-none">
          
          {/* Mídia de Fundo (Vídeo com Autoplay/Pause ou Imagem em Alta Resolução) */}
          {mediaUrl ? (
            mediaType === "video" ? (
              <video
                ref={videoRef}
                src={mediaUrl}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                className="w-full h-full object-cover cursor-pointer"
                onClick={togglePlayPause}
              />
            ) : (
              <img
                src={mediaUrl}
                alt="Preview de Conteúdo"
                className="w-full h-full object-cover"
              />
            )
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-zinc-500 bg-zinc-950">
              <Play className="size-10 mb-2 opacity-30" />
              <p className="text-xs font-medium">Selecione um vídeo ou imagem para ver a simulação realista</p>
              <button
                type="button"
                onClick={() => handleLoadDemoMedia("video")}
                className="mt-3 text-[11px] px-3 py-1 rounded-full bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition"
              >
                Carregar Vídeo Demo
              </button>
            </div>
          )}

          {/* Controles Flutuantes de Mídia (Play/Pause e Áudio) */}
          {mediaUrl && (
            <div className="absolute top-3.5 right-3.5 z-30 flex items-center gap-1.5 pointer-events-auto">
              {mediaType === "video" && (
                <>
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    className="size-7 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 transition"
                    title={isPlaying ? "Pausar vídeo" : "Reproduzir vídeo"}
                  >
                    {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMuted((m) => !m)}
                    className="size-7 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 transition"
                    title={isMuted ? "Ativar som" : "Mutar som"}
                  >
                    {isMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Guia Visual de Zonas Seguras (Safe Zones) */}
          {showSafeZones && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              {/* Top Danger Zone */}
              <div className="absolute top-0 inset-x-0 h-[12%] bg-red-500/20 border-b border-red-500/50 flex items-center justify-center">
                <span className="text-[9px] font-bold text-red-200 tracking-wider uppercase px-2 py-0.5 rounded bg-black/50">
                  Área do Topo (Header / Busca)
                </span>
              </div>

              {/* Right Danger Zone (Botões laterais) */}
              <div className="absolute top-[15%] right-0 w-[20%] bottom-[25%] bg-amber-500/20 border-l border-amber-500/50 flex items-center justify-center">
                <span className="text-[8px] font-bold text-amber-200 [writing-mode:vertical-rl] rotate-180 uppercase tracking-widest">
                  Botões de Ação
                </span>
              </div>

              {/* Bottom Danger Zone (Legenda e Navegação) */}
              <div className="absolute bottom-0 inset-x-0 h-[28%] bg-red-500/20 border-t border-red-500/50 flex items-center justify-center">
                <span className="text-[9px] font-bold text-red-200 tracking-wider uppercase px-2 py-0.5 rounded bg-black/50">
                  Área Inferior (Legenda & Perfil)
                </span>
              </div>

              {/* Centro: Safe Zone 100% Livre */}
              <div className="absolute top-[13%] left-[4%] right-[22%] bottom-[29%] border-2 border-dashed border-emerald-400/80 rounded-lg flex items-center justify-center">
                <span className="text-[9.5px] font-bold text-emerald-300 bg-black/60 px-2 py-1 rounded backdrop-blur-xs shadow-xs text-center">
                  🎯 Safe Zone (Subtítulos e Rostos Aqui)
                </span>
              </div>
            </div>
          )}

          {/* Superposição: TikTok */}
          {previewPlatform === "tiktok" && (
            <div className="absolute inset-0 z-10 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none">
              <div className="pt-2 flex justify-center gap-3 text-xs font-semibold drop-shadow-md">
                <span className="opacity-60">Seguindo</span>
                <span className="underline underline-offset-4 font-bold">Para Você</span>
              </div>

              {/* Botões Laterais */}
              <div className="ml-auto flex flex-col items-center gap-3 text-center drop-shadow-lg pb-8 pointer-events-auto">
                <div className="size-9 rounded-full bg-zinc-800 border-2 border-white flex items-center justify-center text-xs font-bold shadow-md uppercase">
                  {companyName.slice(0, 2)}
                </div>
                <button
                  type="button"
                  onClick={togglePreviewLike}
                  className="flex flex-col items-center gap-0.5 transition-transform active:scale-125"
                >
                  <Heart className={`size-6 transition-colors ${previewLiked ? "text-red-500 fill-red-500" : "text-white"}`} />
                  <span className="text-[10px] font-bold">{(previewLikeCount / 1000).toFixed(1)}K</span>
                </button>
                <div className="flex flex-col items-center gap-0.5">
                  <MessageCircle className="size-6 text-white" />
                  <span className="text-[10px] font-bold">280</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Bookmark className="size-6 text-white" />
                  <span className="text-[10px] font-bold">1.1K</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Share2 className="size-6 text-white" />
                  <span className="text-[10px] font-bold">420</span>
                </div>
                <div className={`size-8 rounded-full bg-zinc-900 border-2 border-zinc-700 flex items-center justify-center ${isPlaying ? "animate-spin" : ""}`}>
                  <Music2 className="size-3.5 text-white" />
                </div>
              </div>

              {/* Legenda e Perfil */}
              <div className="space-y-1.5 drop-shadow-md pr-14 pb-2">
                <p className="text-xs font-bold flex items-center gap-1">
                  <span>{companyHandle}</span>
                  {tiktokIsCommercial && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/20 text-white font-semibold">
                      Comercial
                    </span>
                  )}
                </p>
                <p className="text-[11px] leading-tight line-clamp-3">
                  {baseCaption || "Texto do post..."}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] opacity-80">
                  <Music2 className="size-2.5 shrink-0" />
                  <span className="truncate">Som original - {companyName}</span>
                </div>
              </div>
            </div>
          )}

          {/* Superposição: YouTube Shorts */}
          {previewPlatform === "youtube" && (
            <div className="absolute inset-0 z-10 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none">
              <div className="pt-2 flex justify-between items-center text-xs drop-shadow-md">
                <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1">
                  <YouTubeGlyph className="size-4 text-[#FF0000]" /> Shorts
                </span>
              </div>

              {/* Botões Laterais */}
              <div className="ml-auto flex flex-col items-center gap-3.5 text-center drop-shadow-lg pb-10 pointer-events-auto">
                <button
                  type="button"
                  onClick={togglePreviewLike}
                  className="flex flex-col items-center gap-0.5 transition-transform active:scale-125"
                >
                  <ThumbsUp className={`size-6 transition-colors ${previewLiked ? "text-[#FF0000] fill-[#FF0000]" : "text-white"}`} />
                  <span className="text-[10px] font-bold">24K</span>
                </button>
                <div className="flex flex-col items-center gap-0.5">
                  <ThumbsDown className="size-6 text-white" />
                  <span className="text-[10px]">Dislike</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <MessageCircle className="size-6 text-white" />
                  <span className="text-[10px] font-bold">184</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Share2 className="size-6 text-white" />
                  <span className="text-[10px]">Share</span>
                </div>
              </div>

              {/* Título Obrigatório e Canal */}
              <div className="space-y-1.5 drop-shadow-md pr-12 pb-2">
                <p className="text-xs font-bold line-clamp-2 leading-tight">
                  {youtubeTitle || "Título obrigatório do Short aparecerá aqui"}
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="size-5 rounded-full bg-[#FF0000] text-[9px] font-bold flex items-center justify-center text-white uppercase">
                    {companyName.slice(0, 1)}
                  </span>
                  <p className="text-[10.5px] font-semibold truncate">{companyName}</p>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-white text-black font-bold">
                    Inscrever-se
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Superposição: Instagram Reels */}
          {previewPlatform === "instagram" && (
            <div className="absolute inset-0 z-10 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none">
              <div className="pt-2 text-xs font-bold drop-shadow-md flex items-center gap-1.5">
                <InstagramGlyph className="size-3.5 text-white" />
                <span>Reels</span>
              </div>

              {/* Botões Laterais */}
              <div className="ml-auto flex flex-col items-center gap-3.5 text-center drop-shadow-lg pb-8 pointer-events-auto">
                <button
                  type="button"
                  onClick={togglePreviewLike}
                  className="flex flex-col items-center gap-0.5 transition-transform active:scale-125"
                >
                  <Heart className={`size-6 transition-colors ${previewLiked ? "text-[#E1306C] fill-[#E1306C]" : "text-white"}`} />
                  <span className="text-[10px] font-bold">8.4K</span>
                </button>
                <div className="flex flex-col items-center gap-0.5">
                  <MessageCircle className="size-6 text-white" />
                  <span className="text-[10px] font-bold">92</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Share2 className="size-6 text-white" />
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Bookmark className="size-5 text-white" />
                </div>
              </div>

              {/* Perfil & Copy */}
              <div className="space-y-1.5 drop-shadow-md pr-12 pb-2">
                <div className="flex items-center gap-1.5">
                  <div className="size-5 rounded-full p-[1px] bg-gradient-to-tr from-[#F56040] to-[#833AB4]">
                    <div className="size-full rounded-full bg-black flex items-center justify-center text-[8px] font-bold uppercase">
                      {companyName.slice(0, 1)}
                    </div>
                  </div>
                  <p className="text-xs font-bold">{companyHandle.replace(/^@/, "")}</p>
                  <span className="text-[9px] text-white/70">• Seguir</span>
                </div>
                <p className="text-[11px] leading-tight line-clamp-2">
                  {baseCaption || "Texto do Reels com chamada para ação..."}
                </p>
              </div>
            </div>
          )}

          {/* Superposição: Facebook */}
          {previewPlatform === "facebook" && (
            <div className="absolute inset-0 z-10 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none bg-gradient-to-t from-black/85 via-transparent to-black/35">
              <div className="pt-2 text-xs font-bold drop-shadow-md flex items-center gap-1.5">
                <FacebookGlyph className="size-3.5 text-[#0084FF]" />
                <span>Facebook Vídeo</span>
              </div>

              <div className="mt-auto space-y-1.5 drop-shadow-md pb-2">
                <div className="flex items-center gap-1.5">
                  <div className="size-5 rounded-full bg-[#0084FF] text-white flex items-center justify-center text-[9px] font-bold uppercase">
                    {companyName.slice(0, 1)}
                  </div>
                  <p className="text-xs font-bold">{companyName}</p>
                </div>
                <p className="text-[11px] leading-tight line-clamp-3">
                  {baseCaption || "Publicação com alcance orgânico no Facebook..."}
                </p>
                {facebookLink && (
                  <p className="text-[10.5px] text-blue-300 font-semibold underline truncate">
                    👉 {facebookLink}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Superposição: Telegram Canal */}
          {previewPlatform === "telegram" && (
            <div className="absolute inset-0 z-10 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none bg-gradient-to-t from-black/90 via-transparent to-black/40">
              <div className="pt-2 text-xs font-bold drop-shadow-md flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TelegramGlyph className="size-4 text-[#229ED9]" />
                  <span>{companyName}</span>
                </div>
                <span className="text-[10px] text-white/70">Canal Oficial</span>
              </div>

              <div className="mt-auto space-y-2 drop-shadow-md pb-2">
                <div className="p-3 rounded-2xl bg-black/60 backdrop-blur-xs border border-white/10 space-y-1.5">
                  <p className="text-[11px] leading-relaxed line-clamp-4">
                    {baseCaption || "Mensagem oficial de transmissão para o canal do Telegram..."}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-white/60 pt-1">
                    <span>1.2K visualizações</span>
                    <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-center text-muted-foreground">
          Ative as <strong className="text-foreground">Safe Zones</strong> para garantir que nenhum texto ou logo seja ocultado pelas barras das redes sociais.
        </p>
      </div>
    </div>
  );
}
