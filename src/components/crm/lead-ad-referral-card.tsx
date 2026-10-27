import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendManualLeadConversionFn } from "@/lib/meta-capi.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ExternalLink,
  Copy,
  Send,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Tag,
  Radio,
} from "lucide-react";

interface LeadAdReferralCardProps {
  card: any;
  onConversionSent?: () => void;
}

export function LeadAdReferralCard({ card, onConversionSent }: LeadAdReferralCardProps) {
  const sendConversion = useServerFn(sendManualLeadConversionFn);
  const [sending, setSending] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string>("QualifiedLead");
  const [expanded, setExpanded] = useState(false);

  const extras = card?.campos_extras || {};
  const adRef = extras.ad_referral || null;
  const ctwaClid = card?.ctwa_clid || adRef?.ctwa_clid || extras.ctwa_clid || null;
  const fbclid = card?.fbclid || extras.fbclid || extras.browser_tracking?.fbc || null;
  const gclid = card?.gclid || extras.gclid || null;

  const utms = [
    { label: "source", val: card?.utm_source || extras.utm_source },
    { label: "medium", val: card?.utm_medium || extras.utm_medium },
    { label: "campaign", val: card?.utm_campaign || extras.utm_campaign },
    { label: "content", val: card?.utm_content || extras.utm_content },
    { label: "term", val: card?.utm_term || extras.utm_term },
  ].filter((u) => Boolean(u.val));

  const hasTracking = Boolean(
    adRef ||
    ctwaClid ||
    fbclid ||
    gclid ||
    card?.meta_lead_id ||
    utms.length > 0 ||
    card?.canal_entrada === "ads_meta" ||
    card?.canal_entrada === "ads_google"
  );

  if (!hasTracking) {
    return null;
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copiado`);
    });
  }

  async function handleSendManualConversion() {
    setSending(true);
    try {
      const res = await sendConversion({
        data: {
          cardId: card.id,
          eventName: selectedEvent as any,
          value: Number(card.valor) || undefined,
        },
      });

      if (!res.ok) {
        throw new Error(res.error || "Falha ao enviar evento para a Meta.");
      }

      toast.success(`Conversão "${selectedEvent}" atribuída com sucesso no Meta Ads!`);
      if (onConversionSent) onConversionSent();
    } catch (e: any) {
      toast.error(e?.message || "Erro no envio CAPI.");
    } finally {
      setSending(false);
    }
  }

  const headline = adRef?.headline || adRef?.title || "";
  const body = adRef?.body || adRef?.description || "";
  const mediaUrl = adRef?.media_url || adRef?.thumbnail_url || adRef?.image_url || "";
  const sourceUrl = adRef?.source_url || (adRef?.source_id ? `https://facebook.com/ads/experience/preview/?source_id=${adRef.source_id}` : "");

  return (
    <div className="rounded-lg border border-blue-500/25 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
            <Radio className="size-3.5" />
          </span>
          <div>
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              Rastreamento de Anúncio Meta Ads
              {ctwaClid && (
                <span className="rounded bg-blue-600/10 text-blue-700 dark:text-blue-300 px-1.5 py-0.2 text-[10px] font-medium">
                  Click to WhatsApp
                </span>
              )}
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Lead originado de campanha com atribuição Conversions API
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground text-xs p-1"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {/* Ad Preview Card */}
      {adRef && (
        <div className="flex gap-3 rounded-md border border-border bg-background p-2.5 items-start">
          {mediaUrl && (
            <img
              src={mediaUrl}
              alt="Anúncio"
              className="size-14 rounded object-cover border border-border shrink-0 bg-muted"
              onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            {headline && <div className="text-xs font-semibold text-foreground truncate">{headline}</div>}
            {body && <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{body}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10px] text-muted-foreground">
              {adRef.source_id && <span>ID: <code className="font-mono">{adRef.source_id}</code></span>}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Ver anúncio <ExternalLink className="size-2.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UTMs Tags */}
      {utms.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {utms.map((u) => (
            <span
              key={u.label}
              className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              <Tag className="size-2.5 text-primary opacity-70" />
              <strong className="text-foreground">{u.label}:</strong> {u.val}
            </span>
          ))}
        </div>
      )}

      {/* Details & Click IDs (Collapsible) */}
      {expanded && (
        <div className="space-y-2 pt-2 border-t border-border/60 text-[11px]">
          {ctwaClid && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-background border border-border">
              <span className="text-muted-foreground">CTWA Clid:</span>
              <code className="font-mono text-[10px] truncate max-w-[200px]" title={ctwaClid}>
                {ctwaClid}
              </code>
              <button
                type="button"
                onClick={() => copy(ctwaClid, "CTWA Clid")}
                className="text-muted-foreground hover:text-foreground p-0.5"
              >
                <Copy className="size-3" />
              </button>
            </div>
          )}

          {fbclid && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-background border border-border">
              <span className="text-muted-foreground">FBCLID:</span>
              <code className="font-mono text-[10px] truncate max-w-[200px]" title={fbclid}>
                {fbclid}
              </code>
              <button
                type="button"
                onClick={() => copy(fbclid, "FBCLID")}
                className="text-muted-foreground hover:text-foreground p-0.5"
              >
                <Copy className="size-3" />
              </button>
            </div>
          )}

          {gclid && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-background border border-border">
              <span className="text-muted-foreground">GCLID:</span>
              <code className="font-mono text-[10px] truncate max-w-[200px]" title={gclid}>
                {gclid}
              </code>
              <button
                type="button"
                onClick={() => copy(gclid, "GCLID")}
                className="text-muted-foreground hover:text-foreground p-0.5"
              >
                <Copy className="size-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Manual Conversion Action */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
        <select
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs flex-1 max-w-[195px]"
        >
          <option value="LeadSubmitted">LeadSubmitted (Nuevo Lead)</option>
          <option value="QualifiedLead">QualifiedLead (Lead Calificado)</option>
          <option value="AppointmentBooked">AppointmentBooked (Cita Agendada)</option>
          <option value="InitiateCheckout">InitiateCheckout (En Negociación)</option>
          <option value="OrderCreated">OrderCreated (Pedido Creado)</option>
          <option value="Purchase">Purchase (Venta Cerrada)</option>
        </select>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSendManualConversion}
          disabled={sending}
          className="h-8 text-xs gap-1.5 bg-background hover:bg-muted"
        >
          {sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3 text-blue-600" />}
          Atribuir Conversão Meta
        </Button>
      </div>
    </div>
  );
}
