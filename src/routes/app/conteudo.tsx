import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Send,
  MessageSquare,
  BarChart3,
  Layers,
  Activity,
  Sparkles,
} from "lucide-react";
import { MetaContentCenter } from "@/components/content/meta-content-center";
import { MetaContentHistory, MetaDiagnosticsPanel } from "@/components/content/meta-content-history";
import { OmnichannelPublisher } from "@/components/content/omnichannel-publisher";
import { OmnichannelCommentsInbox } from "@/components/content/omnichannel-comments-inbox";
import { OmnichannelAnalytics } from "@/components/content/omnichannel-analytics";
import { listSocialAccounts } from "@/lib/omnichannel-content.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brand } from "@/config/brand";
import type { SocialAccount } from "@/lib/social-content.types";

type ContentSearch = {
  tab?: string;
  channel?: string;
  post?: string;
};

export const Route = createFileRoute("/app/conteudo")({
  validateSearch: (search: Record<string, unknown>): ContentSearch => ({
    tab: typeof search.tab === "string" && search.tab ? search.tab : undefined,
    channel: typeof search.channel === "string" && search.channel ? search.channel : undefined,
    post: typeof search.post === "string" && search.post ? search.post : undefined,
  }),
  head: () => ({ meta: [{ title: `${brand.name} — Conteúdo Multicanal` }] }),
  component: ConteudoPage,
});

function ConteudoPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/conteudo" });
  const listAccountsFn = useServerFn(listSocialAccounts);

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [activeTab, setActiveTab] = useState<string>(search.tab || "publish");

  useEffect(() => {
    let alive = true;
    listAccountsFn()
      .then((res) => {
        if (alive && res?.accounts) {
          setAccounts(res.accounts);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [listAccountsFn]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    void navigate({
      search: { ...search, tab: val },
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <span>Central de Conteúdo & Redes</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider">
              Multicanal
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Publique, agende, responda comentários públicos e acompanhe estatísticas no Instagram, Facebook, TikTok e YouTube.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 rounded-2xl border border-[color:var(--hairline)] flex-wrap h-auto gap-1">
          <TabsTrigger value="publish" className="rounded-xl text-xs font-semibold gap-1.5 py-2">
            <Send className="size-3.5 text-primary" />
            <span>Publicar e Programar</span>
          </TabsTrigger>
          <TabsTrigger value="comments" className="rounded-xl text-xs font-semibold gap-1.5 py-2">
            <MessageSquare className="size-3.5 text-amber-500" />
            <span>Comentários e Vendas</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-xl text-xs font-semibold gap-1.5 py-2">
            <BarChart3 className="size-3.5 text-emerald-500" />
            <span>Estatísticas & IA</span>
          </TabsTrigger>
          <TabsTrigger value="live" className="rounded-xl text-xs font-semibold gap-1.5 py-2">
            <Layers className="size-3.5" />
            <span>Feeds de Perfis</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl text-xs font-semibold gap-1.5 py-2">
            <Activity className="size-3.5" />
            <span>Histórico Bruto</span>
          </TabsTrigger>
        </TabsList>

        {/* 1. Publicador e Agendador Multicanal */}
        <TabsContent value="publish" className="mt-0 focus-visible:outline-none">
          <OmnichannelPublisher
            accounts={accounts}
            onPublished={() => setActiveTab("history")}
          />
        </TabsContent>

        {/* 2. Bandeja Unificada de Comentários */}
        <TabsContent value="comments" className="mt-0 focus-visible:outline-none">
          <OmnichannelCommentsInbox />
        </TabsContent>

        {/* 3. Painel de Estatísticas & Métricas Propietárias */}
        <TabsContent value="analytics" className="mt-0 focus-visible:outline-none">
          <OmnichannelAnalytics accounts={accounts} />
        </TabsContent>

        {/* 4. Feeds dos Perfis ao Vivo */}
        <TabsContent value="live" className="mt-0 focus-visible:outline-none">
          <MetaContentCenter
            requestedChannel={search.channel}
            requestedPost={search.post}
            onRouteSelection={(channel, post) => {
              void navigate({
                search: { ...search, channel: channel || undefined, post: post || undefined },
                replace: true,
                resetScroll: false,
              });
            }}
          />
        </TabsContent>

        {/* 5. Histórico e Diagnóstico */}
        <TabsContent value="history" className="mt-0 focus-visible:outline-none">
          <MetaContentHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
