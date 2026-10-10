import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MetaContentCenter } from "@/components/content/meta-content-center";
import { brand } from "@/config/brand";

type ContentSearch = {
  channel?: string;
  post?: string;
};

export const Route = createFileRoute("/app/conteudo")({
  validateSearch: (search: Record<string, unknown>): ContentSearch => ({
    channel: typeof search.channel === "string" && search.channel ? search.channel : undefined,
    post: typeof search.post === "string" && search.post ? search.post : undefined,
  }),
  head: () => ({ meta: [{ title: `${brand.name} — Conteúdo` }] }),
  component: ConteudoPage,
});

function ConteudoPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/conteudo" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-extrabold tracking-tight">Conteúdo</h1>
        <p className="text-sm text-muted-foreground">
          Publique, acompanhe comentários, menções e reações e responda pela API oficial da Meta.
        </p>
      </div>
      <MetaContentCenter
        requestedChannel={search.channel}
        requestedPost={search.post}
        onRouteSelection={(channel, post) => {
          void navigate({
            search: { channel: channel || undefined, post: post || undefined },
            replace: true,
          });
        }}
      />
    </div>
  );
}
