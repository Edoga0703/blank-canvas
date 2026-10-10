import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ExternalLink,
  Facebook,
  Heart,
  ImageIcon,
  Instagram,
  Loader2,
  MessageCircle,
  RefreshCw,
  Reply,
  Search,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listMetaChannels } from "@/lib/meta.functions";
import {
  getMetaContentPost,
  listMetaContent,
  listMetaPostComments,
  publishMetaContent,
  replyMetaComment,
  syncMetaNow,
} from "@/lib/meta-content.functions";

type MetaChannel = {
  instanceName: string;
  displayName: string | null;
  canal: "instagram" | "messenger";
  pageId: string | null;
  status: string;
};

type MetaComment = {
  id?: string;
  message?: string;
  text?: string;
  created_time?: string;
  timestamp?: string;
  username?: string;
  like_count?: number;
  from?: { name?: string; username?: string };
  replies?: { data?: MetaComment[] };
  comments?: { data?: MetaComment[] };
};

type MetaPost = {
  id?: string;
  message?: string;
  caption?: string;
  created_time?: string;
  timestamp?: string;
  permalink_url?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  reactions?: { summary?: { total_count?: number } };
  comments?: { data?: MetaComment[]; summary?: { total_count?: number } };
  attachments?: {
    data?: Array<{ media?: { image?: { src?: string } }; url?: string; type?: string }>;
  };
};

type Props = {
  requestedChannel?: string;
  requestedPost?: string;
  onRouteSelection?: (channel: string, post?: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

function postText(post: MetaPost) {
  return String(post.message ?? post.caption ?? "Publicação sem texto");
}

function postImage(post: MetaPost) {
  return (
    post.media_url ?? post.thumbnail_url ?? post.attachments?.data?.[0]?.media?.image?.src ?? null
  );
}

function postComments(post: MetaPost) {
  return Array.isArray(post.comments?.data) ? post.comments.data : [];
}

function commentsCount(post: MetaPost) {
  return post.comments_count ?? post.comments?.summary?.total_count ?? postComments(post).length;
}

function reactionsCount(post: MetaPost) {
  return post.like_count ?? post.reactions?.summary?.total_count ?? 0;
}

function commentText(comment: MetaComment) {
  return String(comment.message ?? comment.text ?? "Comentário sem texto");
}

function commentAuthor(comment: MetaComment) {
  return String(comment.from?.name ?? comment.from?.username ?? comment.username ?? "Contato");
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR");
}

export function MetaContentCenter({ requestedChannel, requestedPost, onRouteSelection }: Props) {
  const loadChannels = useServerFn(listMetaChannels);
  const loadContent = useServerFn(listMetaContent);
  const loadPost = useServerFn(getMetaContentPost);
  const loadComments = useServerFn(listMetaPostComments);
  const replyComment = useServerFn(replyMetaComment);
  const publish = useServerFn(publishMetaContent);
  const runSync = useServerFn(syncMetaNow);

  const [channels, setChannels] = useState<MetaChannel[]>([]);
  const [selected, setSelected] = useState("");
  const [posts, setPosts] = useState<MetaPost[]>([]);
  const [openedPost, setOpenedPost] = useState<MetaPost | null>(null);
  const [openedComments, setOpenedComments] = useState<MetaComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const handledRequest = useRef("");

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.instanceName === selected) ?? null,
    [channels, selected],
  );

  const filteredPosts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return posts;
    return posts.filter((post) => postText(post).toLocaleLowerCase("pt-BR").includes(query));
  }, [posts, search]);

  const refreshChannels = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadChannels();
      const next = (result?.channels ?? []) as MetaChannel[];
      setChannels(next);
      setSelected((current) => {
        if (requestedChannel && next.some((item) => item.instanceName === requestedChannel))
          return requestedChannel;
        if (current && next.some((item) => item.instanceName === current)) return current;
        return next[0]?.instanceName ?? "";
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [loadChannels, requestedChannel]);

  const refreshContent = useCallback(
    async (instanceName: string) => {
      if (!instanceName) return;
      setContentLoading(true);
      try {
        const result = await loadContent({ data: { instanceName } });
        setPosts(Array.isArray(result?.posts) ? (result.posts as MetaPost[]) : []);
      } catch (error) {
        setPosts([]);
        toast.error(errorMessage(error));
      } finally {
        setContentLoading(false);
      }
    },
    [loadContent],
  );

  const refreshOpenedComments = useCallback(
    async (instanceName: string, post: MetaPost) => {
      const postId = String(post.id ?? "");
      if (!instanceName || !postId) return;
      setCommentsLoading(true);
      try {
        const result = await loadComments({ data: { instanceName, postId } });
        setOpenedComments(
          Array.isArray(result?.comments) ? (result.comments as MetaComment[]) : postComments(post),
        );
      } catch (error) {
        setOpenedComments(postComments(post));
        toast.error(errorMessage(error));
      } finally {
        setCommentsLoading(false);
      }
    },
    [loadComments],
  );

  const openPost = useCallback(
    (post: MetaPost, updateRoute = true) => {
      setOpenedPost(post);
      setOpenedComments(postComments(post));
      if (selected) void refreshOpenedComments(selected, post);
      if (updateRoute && selected && post.id) onRouteSelection?.(selected, String(post.id));
    },
    [onRouteSelection, refreshOpenedComments, selected],
  );

  useEffect(() => {
    void refreshChannels();
  }, [refreshChannels]);

  useEffect(() => {
    if (!selected) return;
    handledRequest.current = "";
    void refreshContent(selected);
    onRouteSelection?.(selected, requestedPost);
    // A rota é sincronizada ao trocar o canal; requestedPost não deve reiniciar a carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, refreshContent]);

  useEffect(() => {
    if (!requestedPost || !selected || contentLoading) return;
    const requestKey = `${selected}:${requestedPost}`;
    if (handledRequest.current === requestKey) return;
    handledRequest.current = requestKey;
    const local = posts.find((post) => String(post.id) === requestedPost);
    if (local) {
      openPost(local, false);
      return;
    }
    void loadPost({ data: { instanceName: selected, postId: requestedPost } })
      .then((result) => {
        if (result?.post) openPost(result.post as MetaPost, false);
      })
      .catch((error) => toast.error(errorMessage(error)));
  }, [contentLoading, loadPost, openPost, posts, requestedPost, selected]);

  async function handleReply(commentId: string) {
    const text = replyDrafts[commentId]?.trim();
    if (!selected || !openedPost || !text) return;
    setReplyingId(commentId);
    try {
      await replyComment({ data: { instanceName: selected, commentId, message: text } });
      setReplyDrafts((current) => ({ ...current, [commentId]: "" }));
      toast.success("Resposta publicada no comentário.");
      await refreshOpenedComments(selected, openedPost);
      await refreshContent(selected);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setReplyingId(null);
    }
  }

  async function handlePublish() {
    if (!selected || (!message.trim() && !link.trim() && !photoUrl.trim())) {
      toast.error("Informe texto, link ou imagem para publicar.");
      return;
    }
    setPublishing(true);
    try {
      await publish({
        data: {
          instanceName: selected,
          message: message.trim() || undefined,
          link: link.trim() || undefined,
          photoUrl: photoUrl.trim() || undefined,
        },
      });
      setMessage("");
      setLink("");
      setPhotoUrl("");
      toast.success("Conteúdo publicado.");
      await refreshContent(selected);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPublishing(false);
    }
  }

  async function handleSync() {
    if (!selected) return;
    setSyncing(true);
    try {
      const response = await runSync({ data: { instanceName: selected, full: false } });
      const result = response?.result;
      toast.success(
        `Atualizado: ${result?.comments ?? 0} comentários e ${result?.messages ?? 0} mensagens reconciliados.`,
      );
      await refreshContent(selected);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <Loader2 className="mx-auto my-16 size-7 animate-spin" />;

  if (!channels.length) {
    return (
      <Card>
        <CardContent className="py-14 text-center">
          <ImageIcon className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 font-semibold">Nenhum canal Meta conectado</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Conecte uma Página do Facebook ou uma conta profissional do Instagram em Conexão para
            visualizar publicações, comentários, menções e reações.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 pt-6 lg:grid-cols-[minmax(240px,1fr)_minmax(260px,1fr)_auto] lg:items-end">
          <div>
            <Label htmlFor="content-channel">Canal</Label>
            <select
              id="content-channel"
              value={selected}
              onChange={(event) => {
                setOpenedPost(null);
                const next = event.target.value;
                setSelected(next);
                onRouteSelection?.(next);
              }}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {channels.map((channel) => (
                <option key={channel.instanceName} value={channel.instanceName}>
                  {channel.displayName || channel.instanceName} ·{" "}
                  {channel.canal === "instagram" ? "Instagram" : "Facebook"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="content-search">Buscar publicação</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="content-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Texto da publicação"
              />
            </div>
          </div>
          <Button
            variant="outline"
            disabled={syncing || contentLoading}
            onClick={() => void handleSync()}
          >
            <RefreshCw className={`mr-2 size-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova publicação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Label htmlFor="content-message">Texto ou legenda</Label>
            <Textarea
              id="content-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Escreva o conteúdo"
              className="mt-1 min-h-24"
            />
          </div>
          <div>
            <Label htmlFor="content-link">Link opcional</Label>
            <Input
              id="content-link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label htmlFor="content-photo">URL pública da imagem</Label>
            <Input
              id="content-photo"
              value={photoUrl}
              onChange={(event) => setPhotoUrl(event.target.value)}
              placeholder="https://.../imagem.jpg"
            />
          </div>
          <div className="lg:col-span-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {activeChannel?.canal === "instagram"
                ? "O Instagram exige uma imagem pública para publicar por esta tela."
                : "Texto, link e foto são enviados pela API oficial da Meta."}
            </p>
            <Button disabled={publishing} onClick={() => void handlePublish()}>
              {publishing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              Publicar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Publicações</h2>
          <p className="text-sm text-muted-foreground">
            Abra uma publicação para ler a conversa completa e responder comentários.
          </p>
        </div>
        {activeChannel && (
          <Badge variant={activeChannel.status === "connected" ? "default" : "secondary"}>
            {activeChannel.canal === "instagram" ? (
              <Instagram className="mr-1 size-3" />
            ) : (
              <Facebook className="mr-1 size-3" />
            )}
            {activeChannel.status}
          </Badge>
        )}
      </div>

      {contentLoading ? (
        <Loader2 className="mx-auto my-16 size-7 animate-spin" />
      ) : filteredPosts.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            Nenhuma publicação encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPosts.map((post) => {
            const image = postImage(post);
            const created = post.created_time ?? post.timestamp;
            return (
              <Card
                key={String(post.id)}
                className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
                role="button"
                tabIndex={0}
                onClick={() => openPost(post)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") openPost(post);
                }}
              >
                {image ? (
                  <img
                    src={image}
                    alt="Mídia da publicação"
                    className="h-48 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-32 place-items-center bg-muted/40">
                    <ImageIcon className="size-8 text-muted-foreground" />
                  </div>
                )}
                <CardContent className="space-y-3 pt-4">
                  <p className="line-clamp-3 min-h-[3.75rem] text-sm">{postText(post)}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-3.5" />
                      {commentsCount(post)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-3.5" />
                      {reactionsCount(post)}
                    </span>
                    {created && <span className="ml-auto">{formatDate(created)}</span>}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={(event) => {
                      event.stopPropagation();
                      openPost(post);
                    }}
                  >
                    Abrir comentários
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(openedPost)}
        onOpenChange={(open) => {
          if (!open) {
            setOpenedPost(null);
            setOpenedComments([]);
            if (selected) onRouteSelection?.(selected);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          {openedPost && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {activeChannel?.canal === "instagram" ? (
                    <Instagram className="size-5" />
                  ) : (
                    <Facebook className="size-5" />
                  )}
                  Publicação e comentários
                </DialogTitle>
                <DialogDescription>
                  {formatDate(openedPost.created_time ?? openedPost.timestamp)}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-3">
                  {postImage(openedPost) && (
                    <img
                      src={postImage(openedPost) ?? ""}
                      alt="Mídia da publicação"
                      className="max-h-[430px] w-full rounded-lg border object-contain"
                    />
                  )}
                  <p className="whitespace-pre-wrap text-sm">{postText(openedPost)}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-4" />
                      {reactionsCount(openedPost)} reações
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-4" />
                      {commentsCount(openedPost)} comentários
                    </span>
                  </div>
                  {(openedPost.permalink ?? openedPost.permalink_url) && (
                    <a
                      href={String(openedPost.permalink ?? openedPost.permalink_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Abrir na rede social <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Comentários</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={commentsLoading}
                      onClick={() => void refreshOpenedComments(selected, openedPost)}
                    >
                      <RefreshCw className={`size-4 ${commentsLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  {commentsLoading && openedComments.length === 0 ? (
                    <Loader2 className="mx-auto my-12 size-6 animate-spin" />
                  ) : openedComments.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                      Esta publicação ainda não tem comentários.
                    </div>
                  ) : (
                    <div className="max-h-[580px] space-y-3 overflow-y-auto pr-1">
                      {openedComments.map((comment) => {
                        const commentId = String(comment.id ?? "");
                        const replies = Array.isArray(comment.replies?.data)
                          ? comment.replies.data
                          : Array.isArray(comment.comments?.data)
                            ? comment.comments.data
                            : [];
                        return (
                          <div key={commentId} className="rounded-lg border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">{commentAuthor(comment)}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                  {commentText(comment)}
                                </p>
                              </div>
                              {typeof comment.like_count === "number" && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Heart className="size-3" />
                                  {comment.like_count}
                                </span>
                              )}
                            </div>
                            {replies.length > 0 && (
                              <div className="ml-4 mt-3 space-y-2 border-l pl-3">
                                {replies.map((reply) => (
                                  <div
                                    key={String(reply.id)}
                                    className="rounded-md bg-muted/40 p-2 text-xs"
                                  >
                                    <p className="font-semibold">{commentAuthor(reply)}</p>
                                    <p className="mt-1 text-muted-foreground">
                                      {commentText(reply)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mt-3 flex gap-2">
                              <Input
                                value={replyDrafts[commentId] ?? ""}
                                onChange={(event) =>
                                  setReplyDrafts((current) => ({
                                    ...current,
                                    [commentId]: event.target.value,
                                  }))
                                }
                                placeholder="Responder comentário"
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void handleReply(commentId);
                                  }
                                }}
                              />
                              <Button
                                size="icon"
                                variant="outline"
                                title="Responder"
                                disabled={
                                  !replyDrafts[commentId]?.trim() || replyingId === commentId
                                }
                                onClick={() => void handleReply(commentId)}
                              >
                                {replyingId === commentId ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Reply className="size-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
