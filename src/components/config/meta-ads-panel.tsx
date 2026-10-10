import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMetaAdInsights,
  listMetaAdAccounts,
  listMetaAdCampaigns,
  updateMetaCampaignStatus,
} from "@/lib/meta-content.functions";
import { BarChart3, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type AdAccount = {
  id: string;
  name?: string;
  account_status?: number;
  currency?: string;
};

type Campaign = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  updated_time?: string;
};

type Insight = {
  campaign_id?: string;
  campaign_name?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Falha ao consultar a Meta.";
}

function numberOf(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function MetaAdsPanel({ instanceName }: { instanceName: string }) {
  const loadAccounts = useServerFn(listMetaAdAccounts);
  const loadCampaigns = useServerFn(listMetaAdCampaigns);
  const loadInsights = useServerFn(getMetaAdInsights);
  const changeStatus = useServerFn(updateMetaCampaignStatus);

  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);

  const account = accounts.find((item) => item.id === accountId) ?? null;
  const insightsByCampaign = useMemo(
    () =>
      new Map(
        insights.filter((item) => item.campaign_id).map((item) => [String(item.campaign_id), item]),
      ),
    [insights],
  );
  const totals = useMemo(
    () =>
      insights.reduce(
        (sum, item) => ({
          spend: sum.spend + numberOf(item.spend),
          reach: sum.reach + numberOf(item.reach),
          impressions: sum.impressions + numberOf(item.impressions),
          clicks: sum.clicks + numberOf(item.clicks),
        }),
        { spend: 0, reach: 0, impressions: 0, clicks: 0 },
      ),
    [insights],
  );

  const refreshAccounts = useCallback(async () => {
    if (!instanceName) return;
    setLoadingAccounts(true);
    try {
      const result = await loadAccounts();
      const next = (result?.accounts ?? []) as AdAccount[];
      setAccounts(next);
      setAccountId((current) =>
        current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? ""),
      );
    } catch (error) {
      setAccounts([]);
      setAccountId("");
      toast.error(messageOf(error));
    } finally {
      setLoadingAccounts(false);
    }
  }, [instanceName, loadAccounts]);

  const refreshCampaignData = useCallback(
    async (selectedAccount: string) => {
      if (!instanceName || !selectedAccount) return;
      setLoadingData(true);
      try {
        const [campaignResult, insightResult] = await Promise.all([
          loadCampaigns({ data: { instanceName, adAccountId: selectedAccount } }),
          loadInsights({
            data: { instanceName, adAccountId: selectedAccount, datePreset: "last_7d" },
          }),
        ]);
        setCampaigns((campaignResult?.campaigns ?? []) as Campaign[]);
        setInsights((insightResult?.data?.data ?? []) as Insight[]);
      } catch (error) {
        setCampaigns([]);
        setInsights([]);
        toast.error(messageOf(error));
      } finally {
        setLoadingData(false);
      }
    },
    [instanceName, loadCampaigns, loadInsights],
  );

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);
  useEffect(() => {
    if (accountId) void refreshCampaignData(accountId);
  }, [accountId, refreshCampaignData]);

  async function handleStatus(campaign: Campaign, status: "ACTIVE" | "PAUSED") {
    const verb = status === "ACTIVE" ? "ativar" : "pausar";
    if (!confirm(`Deseja ${verb} a campanha “${campaign.name || campaign.id}”?`)) return;
    setChangingId(campaign.id);
    try {
      await changeStatus({ data: { instanceName, campaignId: campaign.id, status } });
      toast.success(status === "ACTIVE" ? "Campanha ativada." : "Campanha pausada.");
      await refreshCampaignData(accountId);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setChangingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4" /> Campanhas e anúncios
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            disabled={loadingAccounts || loadingData}
            onClick={() => void refreshAccounts()}
          >
            {loadingAccounts || loadingData ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingAccounts ? (
          <Loader2 className="mx-auto my-8 size-5 animate-spin" />
        ) : accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            O token conectado não devolveu contas de anúncios. A permissão <code>ads_read</code>{" "}
            pode ainda não estar aprovada.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="meta-ad-account" className="text-sm font-medium">
                Conta de anúncios
              </label>
              <select
                id="meta-ad-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id} · {item.currency || "moeda não informada"}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Investimento · 7 dias"
                value={totals.spend.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: account?.currency || "BRL",
                })}
              />
              <Metric label="Alcance" value={totals.reach.toLocaleString("pt-BR")} />
              <Metric label="Impressões" value={totals.impressions.toLocaleString("pt-BR")} />
              <Metric label="Cliques" value={totals.clicks.toLocaleString("pt-BR")} />
            </div>

            {loadingData ? (
              <Loader2 className="mx-auto my-10 size-5 animate-spin" />
            ) : campaigns.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma campanha encontrada nessa conta.
              </p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((campaign) => {
                  const insight = insightsByCampaign.get(campaign.id);
                  const active =
                    campaign.status === "ACTIVE" || campaign.effective_status === "ACTIVE";
                  return (
                    <div key={campaign.id} className="rounded-lg border p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">
                              {campaign.name || campaign.id}
                            </p>
                            <Badge variant={active ? "default" : "secondary"}>
                              {campaign.effective_status || campaign.status || "UNKNOWN"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {campaign.objective || "Objetivo não informado"}
                          </p>
                          {insight && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {numberOf(insight.impressions).toLocaleString("pt-BR")} impressões ·{" "}
                              {numberOf(insight.clicks).toLocaleString("pt-BR")} cliques ·{" "}
                              {numberOf(insight.spend).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: account?.currency || "BRL",
                              })}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={changingId === campaign.id}
                          onClick={() => void handleStatus(campaign, active ? "PAUSED" : "ACTIVE")}
                        >
                          {changingId === campaign.id ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : active ? (
                            <Pause className="mr-2 size-4" />
                          ) : (
                            <Play className="mr-2 size-4" />
                          )}
                          {active ? "Pausar" : "Ativar"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
