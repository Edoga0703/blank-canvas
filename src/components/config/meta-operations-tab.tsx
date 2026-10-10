import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMetaChannels } from "@/lib/meta.functions";
import {
  listMetaContent,
  publishMetaContent,
  replyMetaComment,
  syncMetaNow,
} from "@/lib/meta-content.functions";
import {
  ExternalLink,
  Instagram,
  Loader2,
  MessageCircle,
  RefreshCw,
  Reply,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { MetaAdsPanel } from "@/components/config/meta-ads-panel";

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
  username?: string;
  from?: { name?: string };
};

type MetaPost = {
  id?: string;
  message?: string;
  caption?: string;
  created_time?: string;
  timestamp?: string;
  permalink_url?: string;
  permalink?: string;
  comments?: { data?: MetaComment[] };
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export function MetaOperationsTab() {
  const loadChannels = useServerFn(listMetaChannels);
  const loadContent = useServerFn(listMetaContent);
  const runSync = useServerFn(syncMetaNow);
  const publish = useServerFn(publishMetaContent);
  const replyComment = useServerFn(replyMetaComment);

  const [channels, setChannels] = useState<MetaChannel[]>([]);
  const [selected, setSelected] = useState("");
  const [posts, setPosts] = useState<MetaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [syncing, setSyncing] = useState<"incremental" | "full" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.instanceName === selected) ?? null,
    [channels, selected],
  );

  const refreshChannels = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadChannels();
      const next = (result?.channels ?? []) as MetaChannel[];
      setChannels(next);
      setSelected((current) =>
        current && next.some((item) => item.instanceName === current)
          ? current
          : (next[0]?.instanceName ?? ""),
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [loadChannels]);

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

  useEffect(() => {
    void refreshChannels();
  }, [refreshChannels]);
  useEffect(() => {
    if (selected) void refreshContent(selected);
  }, [selected, refreshContent]);

  async function handleSync(full: boolean) {
    if (!selected) return;
    setSyncing(full ? "full" : "incremental");
    try {
      const response = await runSync({ data: { instanceName: selected, full } });
      const result = response?.result;
      toast.success(
        `Sincronização concluída: ${result?.messages ?? 0} mensagens, ${result?.comments ?? 0} comentários e ${result?.leads ?? 0} leads.`,
      );
      if (Array.isArray(result?.errors) && result.errors.length)
        toast.warning(`${result.errors.length} bloco(s) precisam de permissão ou revisão.`);
      await refreshContent(selected);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSyncing(null);
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
      toast.success("Conteúdo publicado pela Meta Graph API.");
      await refreshContent(selected);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPublishing(false);
    }
  }

  async function handleReply(commentId: string) {
    const reply = replyDrafts[commentId]?.trim();
    if (!selected || !reply) return;
    setReplyingId(commentId);
    try {
      await replyComment({ data: { instanceName: selected, commentId, message: reply } });
      setReplyDrafts((current) => ({ ...current, [commentId]: "" }));
      toast.success("Resposta publicada.");
      await refreshContent(selected);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setReplyingId(null);
    }
  }

  if (loading) return <Loader2 className="mx-auto my-12 size-6 animate-spin" />;

  if (!channels.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">Nenhum canal Meta conectado</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Conecte Instagram ou Messenger em Conexões para habilitar histórico, comentários,
            publicações e sincronização.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Canal e sincronização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="meta-channel">Canal conectado</Label>
              <select
                id="meta-channel"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {channels.map((channel) => (
                  <option key={channel.instanceName} value={channel.instanceName}>
                    {channel.displayName || channel.instanceName} ·{" "}
                    {channel.canal === "instagram" ? "Instagram" : "Messenger"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={Boolean(syncing)}
                onClick={() => void handleSync(false)}
              >
                {syncing === "incremental" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                Atualizar
              </Button>
              <Button
                variant="outline"
                disabled={Boolean(syncing)}
                onClick={() => void handleSync(true)}
              >
                {syncing === "full" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                Sincronização completa
              </Button>
            </div>
          </div>
          {activeChannel && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={activeChannel.status === "connected" ? "default" : "secondary"}>
                {activeChannel.status}
              </Badge>
              <span>
                {activeChannel.pageId ? `ID ${activeChannel.pageId}` : "ID não informado"}
              </span>
              <span>Mensagens em tempo real continuam chegando pelos webhooks.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Publicar conteúdo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="meta-message">Texto</Label>
              <textarea
                id="meta-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="mt-1 min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Escreva a legenda ou publicação"
              />
            </div>
            <div>
              <Label htmlFor="meta-link">Link opcional</Label>
              <Input
                id="meta-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="meta-photo">URL pública da imagem</Label>
              <Input
                id="meta-photo"
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
                placeholder="https://.../imagem.jpg"
              />
              {activeChannel?.canal === "instagram" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  O Instagram exige uma imagem pública para esta publicação.
                </p>
              )}
            </div>
            <Button disabled={publishing} onClick={() => void handlePublish()}>
              {publishing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              Publicar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Conteúdo recente</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                disabled={contentLoading}
                onClick={() => void refreshContent(selected)}
              >
                {contentLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {contentLoading ? (
              <Loader2 className="mx-auto my-8 size-5 animate-spin" />
            ) : posts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum conteúdo encontrado ou o canal ainda não possui a permissão necessária.
              </p>
            ) : (
              <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
                {posts.slice(0, 30).map((post) => {
                  const text = String(post?.message ?? post?.caption ?? "Publicação sem texto");
                  const created = post?.created_time ?? post?.timestamp;
                  const comments = Array.isArray(post?.comments?.data)
                    ? post.comments.data.length
                    : 0;
                  const postComments = Array.isArray(post?.comments?.data)
                    ? post.comments.data
                    : [];
                  const permalink = post?.permalink_url ?? post?.permalink;
                  return (
                    <div key={String(post?.id)} className="rounded-lg border p-3">
                      <div className="flex items-start gap-2">
                        {activeChannel?.canal === "instagram" ? (
                          <Instagram className="mt-0.5 size-4 shrink-0" />
                        ) : (
                          <MessageCircle className="mt-0.5 size-4 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-3 text-sm">{text}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {created && <span>{new Date(created).toLocaleString("pt-BR")}</span>}
                            <span>{comments} comentário(s)</span>
                            {permalink && (
                              <a
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                href={String(permalink)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir <ExternalLink className="size-3" />
                              </a>
                            )}
                          </div>
                          {postComments.length > 0 && (
                            <div className="mt-3 space-y-2 border-t pt-3">
                              {postComments.slice(0, 20).map((comment: MetaComment) => {
                                const commentId = String(comment?.id ?? "");
                                const commentText = String(
                                  comment?.message ?? comment?.text ?? "Comentário sem texto",
                                );
                                const author = String(
                                  comment?.from?.name ?? comment?.username ?? "Contato",
                                );
                                return (
                                  <div key={commentId} className="rounded-md bg-muted/40 p-2.5">
                                    <p className="text-xs font-semibold">{author}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {commentText}
                                    </p>
                                    <div className="mt-2 flex gap-2">
                                      <Input
                                        value={replyDrafts[commentId] ?? ""}
                                        onChange={(event) =>
                                          setReplyDrafts((current) => ({
                                            ...current,
                                            [commentId]: event.target.value,
                                          }))
                                        }
                                        placeholder="Responder comentário"
                                        className="h-8 text-xs"
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8"
                                        disabled={
                                          !replyDrafts[commentId]?.trim() ||
                                          replyingId === commentId
                                        }
                                        onClick={() => void handleReply(commentId)}
                                      >
                                        {replyingId === commentId ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                          <Reply className="size-3.5" />
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
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {selected && <MetaAdsPanel instanceName={selected} />}
    </div>
  );
}
