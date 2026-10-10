import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getConnectedPublishChannels,
  publishPostToMeta,
  getChannelFeed,
  type PublishChannel,
} from "@/lib/meta-publish.functions";
import { prepareR2Upload } from "@/lib/storage/r2.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Instagram,
  Facebook,
  Share2,
  Image as ImageIcon,
  Video,
  Upload,
  Send,
  Loader2,
  ExternalLink,
  Heart,
  MessageCircle,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/app/publicacoes")({
  component: PublicacoesPage,
});

export function PublicacoesPage() {
  const getChannelsFn = useServerFn(getConnectedPublishChannels);
  const publishFn = useServerFn(publishPostToMeta);
  const getFeedFn = useServerFn(getChannelFeed);
  const prepareUploadFn = useServerFn(prepareR2Upload);

  const [channels, setChannels] = useState<PublishChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [loadingChannels, setLoadingChannels] = useState(true);

  // Form states
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Feed states
  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // Carrega os canais Meta disponíveis
  useEffect(() => {
    async function loadChannels() {
      setLoadingChannels(true);
      try {
        const res = await getChannelsFn();
        setChannels(res.channels);
        if (res.channels.length > 0) {
          setSelectedChannelId(res.channels[0].id);
        }
      } catch (err: any) {
        toast.error("Erro ao carregar canais conectados: " + err.message);
      } finally {
        setLoadingChannels(false);
      }
    }
    loadChannels();
  }, []);

  const activeChannel = channels.find((c) => c.id === selectedChannelId);

  // Carrega o feed sempre que mudar de canal
  useEffect(() => {
    if (!selectedChannelId) return;
    loadFeed();
  }, [selectedChannelId]);

  async function loadFeed() {
    if (!selectedChannelId) return;
    setLoadingFeed(true);
    try {
      const res = await getFeedFn({ data: { channelId: selectedChannelId, limit: 18 } });
      setFeedPosts(res.posts || []);
    } catch (err: any) {
      console.warn("Erro ao buscar feed:", err.message);
    } finally {
      setLoadingFeed(false);
    }
  }

  // Upload de arquivo
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Prepara upload
      const target = await prepareUploadFn({
        data: {
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });

      // Faz upload direto
      const uploadRes = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("Falha no upload para o servidor.");

      setMediaUrl(target.downloadUrl);
      if (file.type.startsWith("video/")) {
        setMediaType("video");
      } else {
        setMediaType("image");
      }
      toast.success("Mídia carregada com sucesso!");
    } catch (err: any) {
      // Fallback: se R2 não estiver configurado, pode usar URL pública direta
      toast.error(err.message || "Erro no upload. Você também pode colar a URL direta da imagem.");
    } finally {
      setUploading(false);
    }
  }

  // Publicar post
  async function handlePublish() {
    if (!selectedChannelId) {
      toast.error("Selecione um canal para publicar.");
      return;
    }
    if (!mediaUrl.trim()) {
      toast.error("Insira a imagem ou vídeo da publicação.");
      return;
    }

    setPublishing(true);
    try {
      const res = await publishFn({
        data: {
          channelId: selectedChannelId,
          mediaUrl: mediaUrl.trim(),
          caption: caption.trim(),
          mediaType,
        },
      });

      if (res.ok) {
        toast.success("Publicado com sucesso no " + (activeChannel?.provider === "meta_instagram" ? "Instagram" : "Facebook") + "!");
        setCaption("");
        setMediaUrl("");
        loadFeed();
      }
    } catch (err: any) {
      toast.error(err.message || "Falha ao publicar na Meta.");
    } finally {
      setPublishing(false);
    }
  }

  if (loadingChannels) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Carregando canais de publicação...</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Publicações & Redes Sociais</h1>
          <p className="text-sm text-muted-foreground">Publique no Feed do Instagram e Facebook pelo CRM.</p>
        </header>

        <Card className="p-8 text-center space-y-4 border-dashed border-2">
          <div className="size-16 rounded-full bg-pink-500/10 text-pink-500 mx-auto flex items-center justify-center">
            <Instagram className="size-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-semibold text-lg">Nenhuma conta do Instagram ou Facebook conectada</h3>
            <p className="text-sm text-muted-foreground">
              Para publicar e gerenciar seu feed, conecte sua conta profissional do Instagram ou Página do Facebook no painel de Conexão.
            </p>
          </div>
          <Button asChild className="gap-2">
            <Link to="/app/conexao">
              <Share2 className="size-4" />
              Conectar Canais Meta
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase mb-1">
            <Share2 className="size-4" />
            Redes Sociais & Conteúdo
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Publicações</h1>
          <p className="text-sm text-muted-foreground">
            Crie, publique e visualize as postagens do seu Instagram e Facebook diretamente por aqui.
          </p>
        </div>

        {/* Seletor de canal conectado */}
        <div className="flex items-center gap-2 bg-card p-1.5 rounded-xl border">
          {channels.map((chan) => {
            const isSelected = chan.id === selectedChannelId;
            const isIg = chan.provider === "meta_instagram";
            return (
              <button
                key={chan.id}
                onClick={() => setSelectedChannelId(chan.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? isIg
                      ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm"
                      : "bg-blue-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {isIg ? <Instagram className="size-4" /> : <Facebook className="size-4" />}
                {chan.name}
              </button>
            );
          })}
        </div>
      </div>

      <Tabs defaultValue="editor" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="editor" className="gap-2">
            <Sparkles className="size-4" />
            Criar Publicação
          </TabsTrigger>
          <TabsTrigger value="feed" className="gap-2">
            <ImageIcon className="size-4" />
            Feed & Publicadas ({feedPosts.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Criar Publicação com Preview em Tempo Real */}
        <TabsContent value="editor" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Coluna Esquerda: Formulário de Criação (7 colunas) */}
            <div className="lg:col-span-7 space-y-5">
              <Card className="p-5 md:p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    {activeChannel?.provider === "meta_instagram" ? (
                      <Instagram className="size-5 text-pink-500" />
                    ) : (
                      <Facebook className="size-5 text-blue-500" />
                    )}
                    Postar em: <span className="text-primary font-bold">{activeChannel?.name}</span>
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    Graph API v25.0
                  </Badge>
                </div>

                {/* Formato de Mídia */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Tipo de Publicação
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={mediaType === "image" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMediaType("image")}
                      className="gap-2 flex-1"
                    >
                      <ImageIcon className="size-4" />
                      Foto / Imagem
                    </Button>
                    <Button
                      type="button"
                      variant={mediaType === "video" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMediaType("video")}
                      className="gap-2 flex-1"
                    >
                      <Video className="size-4" />
                      Vídeo / Reels
                    </Button>
                  </div>
                </div>

                {/* Imagem / Mídia */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Mídia da Postagem
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Cole a URL pública da imagem ou faça upload..."
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      className="text-sm"
                    />
                    <label className="cursor-pointer shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        asChild
                        disabled={uploading}
                      >
                        <span>
                          {uploading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Upload className="size-4" />
                          )}
                        </span>
                      </Button>
                      <input
                        type="file"
                        accept={mediaType === "video" ? "video/*" : "image/*"}
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Para o Instagram, a mídia precisa ser uma URL pública direta (JPG, PNG ou MP4).
                  </p>
                </div>

                {/* Legenda */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Legenda / Texto da Publicação
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      {caption.length} / 2200 caracteres
                    </span>
                  </div>
                  <Textarea
                    placeholder="Escreva a legenda incrível para o seu post... Adicione hashtags como #vendas #negocios"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={6}
                    className="text-sm resize-none"
                  />
                </div>

                {/* Botão de Envio */}
                <div className="pt-2">
                  <Button
                    onClick={handlePublish}
                    disabled={publishing || !mediaUrl.trim()}
                    className="w-full gap-2 h-11 text-sm font-semibold bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 text-white shadow-md"
                  >
                    {publishing ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Publicando no Instagram...
                      </>
                    ) : (
                      <>
                        <Send className="size-4" />
                        Publicar Agora no {activeChannel?.provider === "meta_instagram" ? "Instagram" : "Facebook"}
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>

            {/* Coluna Direita: Mockup Realista de Visualização do Instagram (5 colunas) */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" />
                Pré-visualização do Post
              </div>

              {/* Celular Mockup */}
              <div className="w-full max-w-[340px] rounded-3xl border-4 border-neutral-800 bg-black text-white shadow-2xl overflow-hidden">
                {/* Header do Post */}
                <div className="flex items-center justify-between p-3 border-b border-neutral-900">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
                      <div className="size-full rounded-full bg-neutral-900 flex items-center justify-center text-xs font-bold text-white uppercase">
                        {activeChannel?.name.charAt(1) || "C"}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-tight">{activeChannel?.name || "@suaconta"}</p>
                      <p className="text-[10px] text-neutral-400">Patrocinado / Orgânico</p>
                    </div>
                  </div>
                  <span className="text-neutral-400 text-sm font-bold">•••</span>
                </div>

                {/* Área da Imagem / Vídeo */}
                <div className="aspect-square bg-neutral-900 flex items-center justify-center overflow-hidden">
                  {mediaUrl ? (
                    mediaType === "video" ? (
                      <video src={mediaUrl} controls className="size-full object-cover" />
                    ) : (
                      <img src={mediaUrl} alt="Preview" className="size-full object-cover" />
                    )
                  ) : (
                    <div className="text-center p-6 text-neutral-600 space-y-2">
                      <ImageIcon className="size-10 mx-auto opacity-40" />
                      <p className="text-xs">Sua imagem ou vídeo aparecerá aqui</p>
                    </div>
                  )}
                </div>

                {/* Ícones de Interação do Instagram */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-neutral-200">
                    <div className="flex items-center gap-3">
                      <Heart className="size-5 hover:text-red-500 cursor-pointer transition-colors" />
                      <MessageCircle className="size-5 cursor-pointer" />
                      <Share2 className="size-5 cursor-pointer" />
                    </div>
                  </div>

                  {/* Legenda e Texto */}
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-neutral-200 text-[11px]">1 curtida</p>
                    <p className="text-[11.5px] leading-relaxed text-neutral-300">
                      <span className="font-bold text-white mr-1.5">{activeChannel?.name}</span>
                      {caption ? (
                        <span className="whitespace-pre-wrap">{caption}</span>
                      ) : (
                        <span className="text-neutral-500 italic">Sua legenda aparecerá aqui...</span>
                      )}
                    </p>
                    <p className="text-[9px] text-neutral-500 uppercase tracking-wider pt-1">
                      Há alguns segundos
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Galeria do Feed */}
        <TabsContent value="feed" className="space-y-4 mt-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base">Publicações Atuais no {activeChannel?.name}</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={loadFeed}
              disabled={loadingFeed}
              className="gap-1.5 h-8 text-xs"
            >
              <RefreshCw className={`size-3.5 ${loadingFeed ? "animate-spin" : ""}`} />
              Atualizar Feed
            </Button>
          </div>

          {loadingFeed ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : feedPosts.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground border-dashed">
              <p className="text-sm">Nenhuma publicação encontrada para esta conta.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {feedPosts.map((post) => (
                <div
                  key={post.id}
                  className="group relative rounded-xl overflow-hidden border bg-card hover:shadow-md transition-all flex flex-col"
                >
                  <div className="aspect-square bg-muted overflow-hidden relative">
                    {post.media_url || post.thumbnail_url ? (
                      <img
                        src={post.thumbnail_url || post.media_url}
                        alt={post.caption || "Post"}
                        className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center text-xs text-muted-foreground">
                        Sem mídia
                      </div>
                    )}
                    {post.permalink && (
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5"
                      >
                        <ExternalLink className="size-4" />
                        Ver no {activeChannel?.provider === "meta_instagram" ? "Instagram" : "Facebook"}
                      </a>
                    )}
                  </div>
                  <div className="p-2 space-y-1 text-xs flex-1 flex flex-col justify-between">
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">
                      {post.caption || "Sem legenda"}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
                      <span className="flex items-center gap-1 font-medium">
                        <Heart className="size-3 text-red-500 fill-red-500" />
                        {post.like_count ?? 0}
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <MessageCircle className="size-3 text-blue-500" />
                        {post.comments_count ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
