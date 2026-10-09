import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, QrCode, Sparkles, ArrowLeft, Lock, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listAddonsPublic, listMyAddons, type AddonProduct } from "@/lib/addons.functions";

type ProviderKey = "evolution" | "uazapi" | "oficial_meta";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateEvolution: (displayName: string) => Promise<void>;
  onCreateUazapi?: (displayName: string) => Promise<void>;
  onStartOficialMeta?: () => Promise<void>;
  creating: boolean;
  initialProvider?: ProviderKey | null;
};

type ProviderCard = {
  key: ProviderKey;
  addonTipo: "whatsapp_uazapi" | "whatsapp_meta" | null;
  name: string;
  fallbackPrice: string;
  desc: string;
  bullets: string[];
  icon: React.ReactNode;
  badge?: { label: string; className: string };
};

const PROVIDERS: ProviderCard[] = [
  {
    key: "uazapi",
    addonTipo: null,
    name: "WhatsApp QR Code",
    fallbackPrice: "Grátis",
    desc: "Conexão via QR Code com infra dedicada e reconexão automática.",
    bullets: ["Pareamento por QR Code", "Envio de mídia e áudio", "Reconexão automática"],
    icon: <QrCode className="size-6" />,
    badge: { label: "Recomendado", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  },
  {
    key: "oficial_meta",
    addonTipo: "whatsapp_meta",
    name: "WhatsApp API Oficial",
    fallbackPrice: "Upgrade",
    desc: "WhatsApp Business Cloud API oficial. Selo verificado e templates HSM.",
    bullets: ["Aprovação da Meta", "Selo verificado", "Templates oficiais"],
    icon: <Sparkles className="size-6" />,
  },
];


function priceLabel(cents: number, moeda: string, intervalo: string) {
  const v = new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(cents / 100);
  return `+ ${v}/${intervalo === "month" ? "mês" : "ano"}`;
}

export function NovaConexaoDialog({
  open,
  onOpenChange,
  onCreateEvolution,
  onCreateUazapi,
  onStartOficialMeta,
  creating,
  initialProvider = null,
}: Props) {
  const listCatalog = useServerFn(listAddonsPublic);
  const listMine = useServerFn(listMyAddons);

  const [selected, setSelected] = useState<ProviderKey | null>(null);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [catalog, setCatalog] = useState<AddonProduct[]>([]);
  const [activeTipos, setActiveTipos] = useState<Set<string>>(new Set());
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (initialProvider) {
      setSelected(initialProvider);
    }
    (async () => {
      try {
        const [cat, mine, u] = await Promise.all([
          listCatalog(),
          listMine(),
          supabase.auth.getUser(),
        ]);
        setCatalog(cat);
        setActiveTipos(new Set(
          mine.filter((m) => m.status === "active").map((m) => m.addon_product?.tipo).filter(Boolean) as string[],
        ));
        setUserEmail(u.data.user?.email ?? "");
      } catch {}
    })();
  }, [open, initialProvider]);

  function close() {
    if (creating) return;
    setSelected(null);
    setName("");
    setApiKey("");
    setAccountId("");
    setPhoneNumber("");
    setPhoneNumberId("");
    onOpenChange(false);
  }

  const provider = selected ? PROVIDERS.find((p) => p.key === selected) : null;
  const providerAddon = provider?.addonTipo ? catalog.find((c) => c.tipo === provider.addonTipo) : null;
  const isLocked = !!provider?.addonTipo && !activeTipos.has(provider.addonTipo);
  const nameOk = name.trim().length >= 2;

  const cards = PROVIDERS.map((p) => {
    const addon = p.addonTipo ? catalog.find((c) => c.tipo === p.addonTipo) : null;
    const locked = !!p.addonTipo && !activeTipos.has(p.addonTipo);
    const price = addon
      ? priceLabel(addon.preco_cents, addon.moeda, addon.intervalo)
      : p.fallbackPrice;
    return { ...p, addon, locked, price };
  });

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nova Conexão</DialogTitle>
          <DialogDescription>
            {!selected
              ? "Escolha o tipo de conexão WhatsApp."
              : isLocked
              ? "Este provedor é um upgrade. Contrate para liberar a conexão."
              : "Dê um nome à sua conexão para identificá-la."}
          </DialogDescription>
        </DialogHeader>

        {!selected && (
          <div className="grid gap-3 md:grid-cols-2">
            {cards.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelected(p.key)}
                className="text-left rounded-xl border p-4 transition-all hover:border-primary hover:shadow-sm cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="size-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    {p.icon}
                  </div>
                  {p.badge && !p.locked && (
                    <Badge variant="outline" className={`text-[10px] ${p.badge.className}`}>
                      {p.badge.label}
                    </Badge>
                  )}
                  {p.locked && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                      <Lock className="size-3 mr-1" /> Upgrade
                    </Badge>
                  )}
                  {!p.locked && p.addonTipo && (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                      <CheckCircle2 className="size-3 mr-1" /> Ativo
                    </Badge>
                  )}
                </div>
                <div className="mt-3 font-semibold">{p.name}</div>
                <div className="mt-1">
                  <span className="text-xl font-bold">{p.price}</span>
                  {p.addonTipo && <span className="text-xs text-muted-foreground ml-1">por conexão</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{p.desc}</p>
                <ul className="mt-3 space-y-1">
                  {p.bullets.map((b) => (
                    <li key={b} className="text-xs flex items-center gap-1.5 text-muted-foreground">
                      <CheckCircle2 className="size-3 text-emerald-500 shrink-0" /> {b}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        )}

        {provider && isLocked && (
          <div className="space-y-4">
            <Card className="p-4 bg-amber-500/5 border-amber-500/30">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                  <Lock className="size-5" />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold">
                    {provider.name}
                    {providerAddon && ` · ${priceLabel(providerAddon.preco_cents, providerAddon.moeda, providerAddon.intervalo)}`}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Este é um <b>upgrade</b> que se soma à sua assinatura mensal. Após a confirmação do pagamento, a conexão
                    é liberada automaticamente por e-mail.
                  </p>
                  {providerAddon?.descricao && (
                    <p className="text-xs text-muted-foreground">{providerAddon.descricao}</p>
                  )}
                </div>
              </div>
            </Card>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <ArrowLeft className="size-4 mr-1" /> Voltar
              </Button>
              {providerAddon?.checkout_url ? (
                <Button asChild>
                  <a
                    href={
                      providerAddon.checkout_url +
                      (providerAddon.checkout_url.includes("?") ? "&" : "?") +
                      `email=${encodeURIComponent(userEmail)}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Contratar upgrade <ExternalLink className="size-4 ml-1.5" />
                  </a>
                </Button>
              ) : (
                <Button disabled>Checkout indisponível</Button>
              )}
            </div>
          </div>
        )}

        {provider && !isLocked && provider.key !== "oficial_meta" && (
          <div className="space-y-4">
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  {provider.icon}
                </div>
                <div>
                  <div className="font-semibold">{provider.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Ao salvar, criamos a instância e geramos o QR Code para pareamento.
                  </div>
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="conn-name">Nome da conexão</Label>
              <Input
                id="conn-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Atendimento, Comercial, Suporte…"
                maxLength={60}
                disabled={creating}
              />
              <p className="text-xs text-muted-foreground">
                Este é o nome que aparecerá na lista de conexões para você identificar cada número.
              </p>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)} disabled={creating}>
                <ArrowLeft className="size-4 mr-1" /> Voltar
              </Button>
              <Button
                onClick={async () => {
                  if (provider.key === "uazapi" && onCreateUazapi) {
                    await onCreateUazapi(name.trim());
                  } else {
                    await onCreateEvolution(name.trim());
                  }
                  setSelected(null);
                  setName("");
                }}
                disabled={creating || !nameOk}
              >
                {creating ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" /> Criando…
                  </>
                ) : (
                  "Salvar e gerar QR"
                )}
              </Button>
            </div>
          </div>
        )}

        {provider && !isLocked && provider.key === "oficial_meta" && (
          <div className="space-y-4">
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  {provider.icon}
                </div>
                <div>
                  <div className="font-semibold">WhatsApp API Oficial · via WaBlast</div>
                  <div className="text-xs text-muted-foreground">
                    Você será redirecionado ao onboarding oficial da Meta para conectar seu número.
                    Nenhuma chave é solicitada — cuidamos disso pra você.
                  </div>
                </div>
              </div>
            </Card>

            <ul className="text-xs text-muted-foreground space-y-1 pl-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-emerald-500" /> Selo verificado da Meta</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-emerald-500" /> Templates HSM oficiais</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-emerald-500" /> A conexão aparece aqui automaticamente quando concluída</li>
            </ul>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)} disabled={creating}>
                <ArrowLeft className="size-4 mr-1" /> Voltar
              </Button>
              <Button
                onClick={async () => {
                  if (!onStartOficialMeta) return;
                  await onStartOficialMeta();
                }}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" /> Abrindo…
                  </>
                ) : (
                  <>
                    Conectar WhatsApp Oficial <ExternalLink className="size-4 ml-1.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
