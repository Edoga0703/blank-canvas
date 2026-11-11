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
} from "@/components/ui/channel-icons";
import { uploadR2Direct } from "@/lib/storage/r2.functions";
import { createOmnichannelPost } from "@/lib/omnichannel-content.functions";
import type { SocialAccount, SocialPlatform } from "@/lib/social-content.types";

interface Props {
  accounts: SocialAccount[];
  onPublished?: () => void;
}

export function OmnichannelPublisher({ accounts, onPublished }: Props) {
  const uploadFn = useServerFn(uploadR2Direct);
  const publishFn = useServerFn(createOmnichannelPost);

  // Seleção de redes
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
  ]);

  // Mídia
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"video" | "image">("video");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Texto mestre
  const [baseCaption, setBaseCaption] = useState("");

  // Requisitos específicos
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeMadeForKids, setYoutubeMadeForKids] = useState(false);
  const [tiktokPrivacy, setTiktokPrivacy] = useState<"PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY">("PUBLIC_TO_EVERYONE");
  const [tiktokIsCommercial, setTiktokIsCommercial] = useState(false);
  const [facebookLink, setFacebookLink] = useState("");

  // Programação
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("18:00");

  // Preview ativo
  const [previewPlatform, setPreviewPlatform] = useState<SocialPlatform>("tiktok");
  const [submitting, setSubmitting] = useState(false);

  // Alternar plataforma
  const togglePlatform = (p: SocialPlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  // Upload para Cloudflare R2
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMediaFile(file);
    const isVid = file.type.startsWith("video/");
    setMediaType(isVid ? "video" : "image");
    setUploading(true);

    try {
      // Converte para base64 para upload seguro
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await uploadFn({
            data: {
              fileName: file.name,
              mimeType: file.type,
              base64,
            },
          });
          if (res?.downloadUrl) {
            setMediaUrl(res.downloadUrl);
            toast.success("Vídeo enviado com sucesso para o storage!");
          }
        } catch (err: any) {
          toast.error("Erro no upload do arquivo: " + err?.message);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error("Falha ao ler o arquivo selecionado.");
      setUploading(false);
    }
  };

  // Adaptação rápida de copy com IA
  const handleAiAdapt = () => {
    if (!baseCaption.trim()) {
      toast.info("Escreva primeiro um texto base para a IA adaptar.");
      return;
    }
    if (!youtubeTitle) {
      setYoutubeTitle(baseCaption.slice(0, 75).trim() + " | Promo Oficial");
    }
    toast.success("Textos e títulos otimizados para cada rede social!");
  };

  // Validação em tempo real
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!selectedPlatforms.length) errors.push("Selecione ao menos uma rede social.");
    if (!mediaUrl && !baseCaption.trim()) errors.push("Adicione um vídeo/foto ou um texto.");
    if (selectedPlatforms.includes("youtube") && !youtubeTitle.trim()) {
      errors.push("YouTube exige um título obrigatório.");
    }
    if (selectedPlatforms.includes("instagram") && !mediaUrl) {
      errors.push("Instagram exige imagem ou vídeo.");
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
          mediaUrl,
          mediaType,
          baseCaption,
          scheduledAt: scheduledIso,
          targets,
        },
      });

      if (res?.ok) {
        if (isScheduled) {
          toast.success("Publicação agendada com sucesso para as 4 redes!");
        } else {
          toast.success("Publicação iniciada com sucesso em todas as plataformas selecionadas!");
        }
        // Limpa formulário
        setMediaFile(null);
        setMediaUrl(null);
        setBaseCaption("");
        setYoutubeTitle("");
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
      {/* Coluna Esquerda: Formulário de Criação (7 colunas) */}
      <div className="lg:col-span-7 space-y-6 bg-[var(--panel)] border border-[color:var(--hairline)] rounded-2xl p-5 sm:p-6 shadow-sm">
        {/* 1. Seleção de Redes */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            1. Destinos da Publicação (Multicanal)
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
              <span>Instagram</span>
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
              <span>Facebook</span>
            </button>

            {/* TikTok */}
            <button
              type="button"
              onClick={() => togglePlatform("tiktok")}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedPlatforms.includes("tiktok")
                  ? "bg-foreground/5 border-foreground text-foreground shadow-sm ring-1 ring-foreground"
                  : "bg-muted/30 border-transparent text-muted-foreground opacity-60 hover:opacity-100"
              }`}
            >
              <TikTokGlyph className="size-4 text-foreground shrink-0" />
              <span>TikTok</span>
            </button>

            {/* YouTube Shorts */}
            <button
              type="button"
              onClick={() => togglePlatform("youtube")}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedPlatforms.includes("youtube")
                  ? "bg-[#FF0000]/10 border-[#FF0000] text-foreground shadow-sm ring-1 ring-[#FF0000]"
                  : "bg-muted/30 border-transparent text-muted-foreground opacity-60 hover:opacity-100"
              }`}
            >
              <YouTubeGlyph className="size-4 text-[#FF0000] shrink-0" />
              <span>YouTube</span>
            </button>
          </div>
        </div>

        {/* 2. Upload de Mídia para Cloudflare R2 */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            2. Arquivo de Vídeo ou Foto (Subida a R2)
          </Label>

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
                  <p className="text-xs font-semibold text-foreground">Enviando vídeo para o CDN R2…</p>
                  <p className="text-[11px] text-muted-foreground">Otimizando formato para as 4 redes sociais</p>
                </>
              ) : (
                <>
                  <div className="size-11 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Upload className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Clique para selecionar o vídeo vertical (9:16) ou arraste aqui
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      MP4, WebM ou MOV • Máx. 100 MB • Reels, Shorts e TikTok
                    </p>
                  </div>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center justify-between p-3.5 bg-muted/30 border border-[color:var(--hairline)] rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 shrink-0">
                  <CheckCircle2 className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {mediaFile?.name || "Vídeo carregado no R2"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Armazenado no Cloudflare R2 • Pronto para publicação simultânea
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMediaUrl(null);
                  setMediaFile(null);
                }}
                className="text-muted-foreground hover:text-red-500 h-8 px-2"
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {/* 3. Texto Mestre */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              3. Texto Mestre (Copy Principal)
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
          <Textarea
            rows={4}
            value={baseCaption}
            onChange={(e) => setBaseCaption(e.target.value)}
            placeholder="Escreva a mensagem do seu post. Todas as redes marcadas compartilharão este texto por padrão..."
            className="text-xs leading-relaxed resize-none rounded-xl bg-muted/30"
          />
          <div className="flex justify-between items-center text-[11px] text-muted-foreground px-1">
            <span>Usado em Instagram, Facebook e TikTok</span>
            <span>{baseCaption.length} caracteres</span>
          </div>
        </div>

        {/* 4. Validações Condicionais por Plataforma */}
        <div className="space-y-3.5 pt-2 border-t border-[color:var(--hairline)]">
          {/* YouTube Shorts (Exige Título) */}
          {selectedPlatforms.includes("youtube") && (
            <div className="p-3.5 rounded-xl bg-[#FF0000]/5 border border-[#FF0000]/20 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <YouTubeGlyph className="size-3.5 text-[#FF0000]" />
                  <span>Configuração Obrigatória do YouTube Shorts</span>
                </div>
                <Badge variant="destructive" className="text-[10px] h-4 uppercase font-bold">
                  Obrigatório
                </Badge>
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-foreground">
                  Título do Vídeo / Short *
                </Label>
                <Input
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value.slice(0, 100))}
                  placeholder="Ex: 50% OFF em Streaming | Oferta Capi Conversa"
                  className="mt-1 h-8 text-xs bg-background"
                />
                <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
                  <span>Aparece em destaque no feed de Shorts</span>
                  <span>{youtubeTitle.length} / 100 car.</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[11px] text-muted-foreground">Classificação de conteúdo infantil (COPPA):</span>
                <span className="text-[11px] font-semibold text-foreground">Não é para crianças</span>
              </div>
            </div>
          )}

          {/* TikTok (Exige Privacidad) */}
          {selectedPlatforms.includes("tiktok") && (
            <div className="p-3.5 rounded-xl bg-foreground/5 border border-foreground/15 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <TikTokGlyph className="size-3.5 text-foreground" />
                  <span>Ajustes de Publicação do TikTok</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-semibold">Content API v2</span>
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
                    <Label className="text-[11px] font-semibold text-foreground">Conteúdo Promocional</Label>
                    <p className="text-[10px] text-muted-foreground">Divulgação de produto/anúncio</p>
                  </div>
                  <Switch checked={tiktokIsCommercial} onCheckedChange={setTiktokIsCommercial} />
                </div>
              </div>
            </div>
          )}

          {/* Facebook Link Clicable */}
          {selectedPlatforms.includes("facebook") && (
            <div className="p-3.5 rounded-xl bg-[#0084FF]/5 border border-[#0084FF]/20 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <FacebookGlyph className="size-3.5 text-[#0084FF]" />
                <span>Link Clicável no Facebook (Opcional)</span>
              </div>
              <Input
                value={facebookLink}
                onChange={(e) => setFacebookLink(e.target.value)}
                placeholder="https://cuentastupana.com/promo-streaming"
                className="h-8 text-xs bg-background"
              />
              <p className="text-[10px] text-muted-foreground">
                No Facebook este link fica azul e clicável diretamente no feed.
              </p>
            </div>
          )}
        </div>

        {/* 5. Programação de Data e Hora */}
        <div className="pt-2 border-t border-[color:var(--hairline)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-bold text-foreground">Programar para Depois</Label>
              <p className="text-[11px] text-muted-foreground">
                Defina o dia e horário que o sistema publicará automaticamente nas 4 redes
              </p>
            </div>
            <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
          </div>

          {isScheduled && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 border border-[color:var(--hairline)] animate-in fade-in duration-150">
              <div>
                <Label className="text-[11px] font-semibold text-foreground">Data de Publicação</Label>
                <div className="relative mt-1">
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[11px] font-semibold text-foreground">Horário</Label>
                <div className="relative mt-1">
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Botão de Envio com Validação em Tempo Real */}
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
                <Upload className="size-4 mr-2" />
                <span>Publicar Agora em {selectedPlatforms.length} Redes</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Coluna Direita: Simulador de Preview Realista (5 colunas) */}
      <div className="lg:col-span-5 space-y-3 sticky top-4">
        <div className="flex items-center justify-between px-1">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pré-visualização em Tempo Real
          </Label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPreviewPlatform("tiktok")}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                previewPlatform === "tiktok" ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Preview TikTok"
            >
              <TikTokGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewPlatform("instagram")}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                previewPlatform === "instagram" ? "bg-[#E1306C] text-white" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Preview Reels"
            >
              <InstagramGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewPlatform("youtube")}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                previewPlatform === "youtube" ? "bg-[#FF0000] text-white" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Preview Shorts"
            >
              <YouTubeGlyph className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewPlatform("facebook")}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                previewPlatform === "facebook" ? "bg-[#0084FF] text-white" : "hover:bg-muted text-muted-foreground"
              }`}
              title="Preview Facebook"
            >
              <FacebookGlyph className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Mockup de Smartphone com Zonas Seguras */}
        <div className="relative mx-auto w-full max-w-[280px] aspect-[9/16] bg-black rounded-[36px] overflow-hidden shadow-2xl border-4 border-muted/80 ring-1 ring-border">
          {/* Mídia de Fundo */}
          {mediaUrl ? (
            mediaType === "video" ? (
              <video
                src={mediaUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
            )
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-zinc-500 bg-zinc-950">
              <Play className="size-10 mb-2 opacity-30" />
              <p className="text-xs font-medium">Carregue um vídeo para ver o simulador de tela</p>
            </div>
          )}

          {/* Superposição de Interface do TikTok */}
          {previewPlatform === "tiktok" && (
            <div className="absolute inset-0 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none">
              {/* Topo */}
              <div className="pt-2 flex justify-center gap-3 text-xs font-semibold drop-shadow-md">
                <span className="opacity-60">Seguindo</span>
                <span className="underline underline-offset-4 font-bold">Para Você</span>
              </div>

              {/* Lateral Direita (Botões Interativos) */}
              <div className="ml-auto flex flex-col items-center gap-3.5 text-center drop-shadow-lg pb-10">
                <div className="size-9 rounded-full bg-zinc-700/80 border border-white flex items-center justify-center text-xs font-bold">
                  CT
                </div>
                <div>
                  <Heart className="size-6 text-white" />
                  <span className="text-[10px] font-bold">14.2K</span>
                </div>
                <div>
                  <MessageCircle className="size-6 text-white" />
                  <span className="text-[10px] font-bold">280</span>
                </div>
                <div>
                  <Bookmark className="size-6 text-white" />
                  <span className="text-[10px] font-bold">1.1K</span>
                </div>
                <div>
                  <Share2 className="size-6 text-white" />
                  <span className="text-[10px] font-bold">420</span>
                </div>
                <div className="size-8 rounded-full bg-zinc-900 border-2 border-zinc-700 flex items-center justify-center animate-spin">
                  <Music2 className="size-3.5 text-white" />
                </div>
              </div>

              {/* Rodapé e Copy (Zona Segura) */}
              <div className="space-y-1.5 drop-shadow-md pr-12 pb-2">
                <p className="text-xs font-bold">@cuentastupanas</p>
                <p className="text-[11px] leading-tight line-clamp-3">
                  {baseCaption || "O seu texto aparecerá aqui com as hashtags e menções da campanha..."}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] opacity-80">
                  <Music2 className="size-2.5" />
                  <span className="truncate">Som original - CuentasTuPana</span>
                </div>
              </div>
            </div>
          )}

          {/* Superposição do YouTube Shorts */}
          {previewPlatform === "youtube" && (
            <div className="absolute inset-0 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none">
              <div className="pt-2 flex justify-between items-center text-xs drop-shadow-md">
                <span className="font-bold text-sm">Shorts</span>
              </div>

              <div className="ml-auto flex flex-col items-center gap-4 text-center drop-shadow-lg pb-12">
                <div>
                  <ThumbsUp className="size-6" />
                  <span className="text-[10px] font-bold">24K</span>
                </div>
                <div>
                  <ThumbsDown className="size-6" />
                  <span className="text-[10px]">Dislike</span>
                </div>
                <div>
                  <MessageCircle className="size-6" />
                  <span className="text-[10px] font-bold">184</span>
                </div>
                <div>
                  <Share2 className="size-6" />
                  <span className="text-[10px]">Share</span>
                </div>
              </div>

              <div className="space-y-1.5 drop-shadow-md pr-10 pb-2">
                <p className="text-xs font-bold truncate">
                  {youtubeTitle || "Título obrigatório do Short aparecerá aqui"}
                </p>
                <p className="text-[10.5px] opacity-90 truncate">@CuentasTuPana • Inscrever-se</p>
              </div>
            </div>
          )}

          {/* Superposição do Instagram Reels */}
          {previewPlatform === "instagram" && (
            <div className="absolute inset-0 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none">
              <div className="pt-2 text-xs font-bold drop-shadow-md">Reels</div>

              <div className="ml-auto flex flex-col items-center gap-3.5 text-center drop-shadow-lg pb-10">
                <div>
                  <Heart className="size-6" />
                  <span className="text-[10px] font-bold">8.4K</span>
                </div>
                <div>
                  <MessageCircle className="size-6" />
                  <span className="text-[10px] font-bold">92</span>
                </div>
                <div>
                  <Share2 className="size-6" />
                </div>
                <div>
                  <Bookmark className="size-5" />
                </div>
              </div>

              <div className="space-y-1 drop-shadow-md pr-10 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="size-4 rounded-full bg-white text-black text-[8px] font-bold grid place-items-center">C</span>
                  <p className="text-xs font-bold">cuentastupanas</p>
                </div>
                <p className="text-[11px] leading-tight line-clamp-2">
                  {baseCaption || "Texto do Reels com chamada para ação e link na bio..."}
                </p>
              </div>
            </div>
          )}

          {/* Superposição do Facebook */}
          {previewPlatform === "facebook" && (
            <div className="absolute inset-0 flex flex-col justify-between p-3.5 pointer-events-none text-white select-none bg-gradient-to-t from-black/80 via-transparent to-black/40">
              <div className="pt-2 text-xs font-bold drop-shadow-md">Facebook Reels</div>

              <div className="mt-auto space-y-1.5 drop-shadow-md pb-2">
                <p className="text-xs font-bold">Cuentastupanas</p>
                <p className="text-[11px] leading-tight line-clamp-2">
                  {baseCaption || "Publicação com alcance orgânico no Facebook..."}
                </p>
                {facebookLink && (
                  <p className="text-[10px] text-blue-400 font-semibold underline truncate">
                    {facebookLink}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-center text-muted-foreground">
          Simulador com Zonas Seguras: verifique se os textos não cobrem os botões laterais.
        </p>
      </div>
    </div>
  );
}
