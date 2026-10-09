import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Copy, CheckCircle2, AlertCircle, BookOpen } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { brand } from "@/config/brand";
import {
  getBillingWebhookInfo, listRecentBillingEvents, getBillingGateway, setBillingGateway,
} from "@/lib/billing.functions";

export const Route = createFileRoute("/master/configuracoes")({
  head: () => ({ meta: [{ title: `${brand.name} — Webhooks` }] }),
  component: ConfigPage,
});

const PROVIDERS = [
  { key: "abacatepay", label: "AbacatePay", hint: "Gateway padrão — PIX e cartão do checkout interno." },
  { key: "kiwify", label: "Kiwify", hint: "Clientes legados com assinatura ativa na Kiwify." },
] as const;

const EVENTOS = [
  "purchase_approved", "subscription_renewed", "subscription_canceled",
  "refunded", "chargeback", "payment_failed",
];

function ConfigPage() {
  const getWebhooks = useServerFn(getBillingWebhookInfo);
  const getEvents = useServerFn(listRecentBillingEvents);

  const getGateway = useServerFn(getBillingGateway);
  const saveGateway = useServerFn(setBillingGateway);

  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<Record<string, string> | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [gateway, setGateway] = useState<string>("kiwify");
  const [portalUrl, setPortalUrl] = useState<string>("");
  const [savingGateway, setSavingGateway] = useState(false);

  useEffect(() => {
    void (async () => {
      const [w, e, g] = await Promise.allSettled([getWebhooks(), getEvents(), getGateway()]);
      if (w.status === "fulfilled") setTokens(w.value as any);
      else toast.error(`Webhooks: ${w.reason?.message ?? w.reason}`);
      if (e.status === "fulfilled") setEvents(e.value);
      else toast.error(`Eventos: ${e.reason?.message ?? e.reason}`);
      if (g.status === "fulfilled") {
        setGateway((g.value as any).gateway ?? "kiwify");
        setPortalUrl((g.value as any).portalUrl ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function salvarGateway() {
    setSavingGateway(true);
    try {
      await saveGateway({ data: { gateway, portalUrl } });
      toast.success("Gateway padrão salvo");
    } catch (err: any) {
      toast.error(err?.message ?? "Não consegui salvar");
    } finally {
      setSavingGateway(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = (provider: string) =>
    tokens?.[provider]
      ? `${origin}/api/public/billing/webhook?provider=${provider}&${
          provider === "abacatepay" ? "webhookSecret" : "token"
        }=${tokens[provider]}`
      : "";

  async function copy(s: string) {
    try { await navigator.clipboard.writeText(s); toast.success("Copiado"); }
    catch { toast.error("Não consegui copiar"); }
  }

  return (
    <div className="space-y-5 w-full animate-in fade-in duration-200">
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-tight leading-tight">Webhooks</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          URLs de integração com os checkouts e eventos de cobrança recebidos.
        </p>
      </div>

      <Card className="p-5 rounded-2xl border-[color:var(--hairline)] space-y-3">
        <div>
          <h2 className="font-semibold text-[15px]">Gateway padrão dos clientes</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Define para onde o cliente é levado ao pagar em Configurações → Plano. Com a Kiwify, o checkout interno
            (PIX/cartão do AbacatePay) fica oculto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={gateway === p.key ? "default" : "outline"}
              onClick={() => setGateway(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-center">
          <Input
            value={portalUrl}
            onChange={(e) => setPortalUrl(e.target.value)}
            placeholder="Link do portal de assinatura (troca de cartão) — opcional"
            className="text-[12px]"
          />
          <Button size="sm" onClick={salvarGateway} disabled={savingGateway}>
            {savingGateway ? <Loader2 className="size-3.5 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] items-start">
        <Card className="p-5 rounded-2xl border-[color:var(--hairline)] space-y-4">
          <div>
            <h2 className="font-semibold text-[15px]">Webhooks de cobrança</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Cole as URLs no painel do checkout. Venda aprovada libera o cliente pelo <b>e-mail do comprador</b>;
              cancelamento, reembolso ou chargeback suspendem a conta e a renovação reativa.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EVENTOS.map((e) => (
                <span key={e} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{e}</span>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid place-items-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              {PROVIDERS.map((p) => (
                <div key={p.key} className="border border-[color:var(--hairline)] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider">{p.label}</span>
                    {tokens?.[p.key]
                      ? <Badge variant="secondary" className="text-[10px]">configurado</Badge>
                      : <Badge variant="destructive" className="text-[10px]">sem token</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">{p.hint}</p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={url(p.key) || "(defina o secret)"} className="font-mono text-[11px]" />
                    <Button size="sm" variant="outline" onClick={() => copy(url(p.key))} disabled={!url(p.key)}>
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Accordion type="single" collapsible className="border border-[color:var(--hairline)] rounded-xl">
            <AccordionItem value="howto" className="border-0">
              <AccordionTrigger className="px-3 py-2 text-sm font-semibold hover:no-underline">
                <span className="flex items-center gap-2"><BookOpen className="size-4" /> Como integrar passo a passo</span>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3 space-y-4 text-xs">
                <div>
                  <div className="font-bold uppercase tracking-wider mb-1">AbacatePay</div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                    <li>Painel AbacatePay → <b>Integrações</b> → <b>Webhooks</b>.</li>
                    <li>Cole a URL do AbacatePay acima (o segredo já vai na própria URL).</li>
                    <li>Ative os eventos de pagamento aprovado, cancelado e estornado.</li>
                    <li>Faça uma cobrança teste de R$1 — ela deve aparecer em "Últimos eventos".</li>
                  </ol>
                </div>
                <div>
                  <div className="font-bold uppercase tracking-wider mb-1">Kiwify</div>
                  <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                    <li>Painel Kiwify → <b>Apps</b> → <b>Webhooks</b> → <b>Nova URL</b>.</li>
                    <li>Cole a URL da Kiwify acima.</li>
                    <li>Marque: <code>compra aprovada</code>, <code>reembolso</code>, <code>chargeback</code>, <code>assinatura cancelada</code>, <code>assinatura renovada</code>.</li>
                    <li>Salve e valide com uma compra teste.</li>
                  </ol>
                </div>
                <div className="rounded-lg border border-[color:var(--hairline)] bg-muted/40 p-2.5">
                  <b>Vínculo cliente → empresa:</b> usamos o e-mail do comprador. O cadastro no {brand.name} precisa usar o
                  <b> mesmo e-mail</b> da compra. O plano é identificado pelo <code>slug</code> ou pelo <code>product_id</code>.
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        <Card className="p-5 rounded-2xl border-[color:var(--hairline)] space-y-3">
          <h3 className="text-sm font-semibold">Últimos eventos recebidos</h3>
          {loading ? (
            <div className="grid place-items-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum webhook recebido ainda.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs border border-[color:var(--hairline)] rounded-lg px-2.5 py-1.5">
                  {e.processed && !e.error
                    ? <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                    : <AlertCircle className="size-3.5 text-amber-600 shrink-0" />}
                  <span className="font-mono text-[10px] uppercase">{e.provider}</span>
                  <span className="truncate">{e.event_type}</span>
                  <span className="text-muted-foreground truncate">{e.buyer_email || "—"}</span>
                  {e.error && <span className="text-amber-600 truncate">{e.error}</span>}
                  <span className="text-muted-foreground ml-auto whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
