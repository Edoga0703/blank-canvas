import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, QrCode, Sparkles, ArrowLeft, ExternalLink } from "lucide-react";

type ProviderKey = "dapi" | "oficial_meta";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDapi?: (displayName: string) => Promise<void>;
  onCreateDapiOfficial?: (params: {
    displayName: string;
    sessionId?: string;
    wabaId?: string;
    phoneNumberId?: string;
    accessToken?: string;
    phoneNumber?: string;
  }) => Promise<void>;
  creating: boolean;
  initialProvider?: ProviderKey | null;
};

type ProviderCard = {
  key: ProviderKey;
  name: string;
  price: string;
  desc: string;
  bullets: string[];
  icon: React.ReactNode;
  badge?: { label: string; className: string };
};

const PROVIDERS: ProviderCard[] = [
  {
    key: "dapi",
    name: "WhatsApp Não Oficial (QR Code / Celular)",
    price: "Instantâneo",
    desc: "Conecte seu celular físico em segundos escaneando o QR Code ou digitando o número para receber código de 8 dígitos.",
    bullets: [
      "Sem burocracia ou aprovação da Meta",
      "Pareamento por QR Code ou código de 8 dígitos",
      "Envio de mensagens, áudios PTT e mídias",
      "Reconexão automática com proxy dedicado",
    ],
    icon: <QrCode className="size-6" />,
    badge: { label: "Não Oficial · Celular", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  },
  {
    key: "oficial_meta",
    name: "WhatsApp API Oficial Meta (Cloud API)",
    price: "Oficial Meta",
    desc: "WhatsApp Business Cloud API oficial via D-API. Conexão corporativa direta com a Meta sem precisar de celular ligado.",
    bullets: [
      "API Oficial Cloud Meta (sem risco de bloqueio)",
      "Popup Hospedado (Embedded Signup em 1 clique)",
      "Compatível com Templates HSM aprovados",
      "Selo de verificação da empresa",
    ],
    icon: <Sparkles className="size-6" />,
    badge: { label: "Oficial Meta Cloud", className: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  },
];

export function NovaConexaoDialog({
  open,
  onOpenChange,
  onCreateDapi,
  onCreateDapiOfficial,
  creating,
  initialProvider = null,
}: Props) {
  const [selected, setSelected] = useState<ProviderKey | null>(null);
  const [officialMode, setOfficialMode] = useState<"popup" | "manual">("popup");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initialProvider) {
      setSelected(initialProvider);
    }
  }, [open, initialProvider]);

  useEffect(() => {
    if (!open || selected !== "oficial_meta" || !onCreateDapiOfficial) return;

    function handlePostMessage(event: MessageEvent) {
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;
      const isDapiOfficialEvent =
        payload.type === "whatsapp-connected" ||
        payload.type === "dapi:official:connected" ||
        payload.type === "d-api:official:connected" ||
        payload.event === "whatsapp.official.connected" ||
        (payload.sessionId && (payload.wabaId || payload.phoneNumberId));

      if (!isDapiOfficialEvent) return;

      void onCreateDapiOfficial({
        displayName: name.trim() || payload.displayName || "WhatsApp Oficial Meta",
        sessionId: String(payload.sessionId || ""),
        wabaId: payload.wabaId ? String(payload.wabaId) : undefined,
        phoneNumberId: payload.phoneNumberId ? String(payload.phoneNumberId) : undefined,
        accessToken: payload.accessToken ? String(payload.accessToken) : undefined,
        phoneNumber: payload.phoneNumber || payload.phone ? String(payload.phoneNumber || payload.phone) : undefined,
      }).then(() => {
        close();
      });
    }

    window.addEventListener("message", handlePostMessage);
    return () => window.removeEventListener("message", handlePostMessage);
  }, [open, selected, name, onCreateDapiOfficial]);

  function openDapiHostedPopup() {
    const sessionId = `dapi_meta_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const popupBaseUrl = "https://app.d-api.cloud/connect/official";
    const url = `${popupBaseUrl}?sessionId=${encodeURIComponent(sessionId)}&origin=${encodeURIComponent(window.location.origin)}`;
    window.open(url, "dapi_official_signup", "width=620,height=740,menubar=no,toolbar=no,location=no,status=no");
  }

  function close() {
    if (creating) return;
    setSelected(null);
    setOfficialMode("popup");
    setName("");
    setApiKey("");
    setAccountId("");
    setPhoneNumberId("");
    onOpenChange(false);
  }

  const provider = selected ? PROVIDERS.find((p) => p.key === selected) : null;
  const nameOk = name.trim().length >= 2;
  const officialManualOk =
    name.trim().length >= 2 &&
    accountId.trim().length >= 3 &&
    phoneNumberId.trim().length >= 3 &&
    apiKey.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nova Conexão WhatsApp (D-API)</DialogTitle>
          <DialogDescription>
            Escolha entre conexão instantânea para celular físico (Não Oficial) ou conexão corporativa direta da Meta (Oficial Cloud API).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setSelected("dapi")}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${selected === "dapi" ? "bg-background shadow-xs text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
          >
            <QrCode className="size-3.5" /> WhatsApp Não Oficial (QR / Celular)
          </button>
          <button
            type="button"
            onClick={() => setSelected("oficial_meta")}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${selected === "oficial_meta" ? "bg-background shadow-xs text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Sparkles className="size-3.5" /> WhatsApp API Oficial (Meta Cloud)
          </button>
        </div>

        {!selected && (
          <div className="grid gap-3 md:grid-cols-2">
            {PROVIDERS.map((p) => (
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
                  {p.badge && (
                    <Badge variant="outline" className={`text-[10px] ${p.badge.className}`}>
                      {p.badge.label}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 font-semibold">{p.name}</div>
                <div className="mt-1">
                  <span className="text-xl font-bold">{p.price}</span>
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

        {provider && provider.key === "dapi" && (
          <div className="space-y-4">
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  {provider.icon}
                </div>
                <div>
                  <div className="font-semibold">{provider.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Ao salvar, criamos a sessão na D-API e geramos o QR Code (ou código de 8 dígitos) para pareamento.
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
                  if (onCreateDapi) {
                    await onCreateDapi(name.trim());
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

        {provider && provider.key === "oficial_meta" && (
          <div className="space-y-4">
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    {provider.icon}
                  </div>
                  <div>
                    <div className="font-semibold">WhatsApp API Oficial · Meta Cloud API (D-API)</div>
                    <div className="text-xs text-muted-foreground">
                      Conecte via Popup Oficial da Meta (Embedded Signup) ou informe as credenciais WABA manualmente.
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setOfficialMode("popup")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${officialMode === "popup" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    Conexão Rápida (Popup)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfficialMode("manual")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${officialMode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    Credenciais WABA
                  </button>
                </div>
              </div>
            </Card>

            <div className="space-y-1.5">
              <Label htmlFor="off-name">Nome da conexão</Label>
              <Input
                id="off-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: WhatsApp Oficial Comercial"
                disabled={creating}
              />
            </div>

            {officialMode === "popup" ? (
              <Card className="p-4 border-dashed space-y-2">
                <div className="text-sm font-medium">Embedded Signup · D-API Provedor Oficial</div>
                <p className="text-xs text-muted-foreground">
                  Ao clicar em <b>Conectar com a Meta</b>, abrirá a janela hospedada da D-API para autenticar sua conta do Facebook Business e selecionar o número. Quando concluir, a conexão será registrada automaticamente via <code>postMessage</code>.
                </p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="off-waba">WABA ID (WhatsApp Business Account ID)</Label>
                  <Input
                    id="off-waba"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="Ex.: 109283746512345"
                    disabled={creating}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="off-phone-id">Phone Number ID</Label>
                  <Input
                    id="off-phone-id"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="Ex.: 102938475610293"
                    disabled={creating}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="off-token">Access Token Permanente (Meta Graph API)</Label>
                  <Input
                    id="off-token"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="EAAG..."
                    disabled={creating}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)} disabled={creating}>
                <ArrowLeft className="size-4 mr-1" /> Voltar
              </Button>
              {officialMode === "popup" ? (
                <Button
                  onClick={openDapiHostedPopup}
                  disabled={creating || !nameOk}
                >
                  Conectar com a Meta (Popup) <ExternalLink className="size-4 ml-1.5" />
                </Button>
              ) : (
                <Button
                  onClick={async () => {
                    if (onCreateDapiOfficial) {
                      await onCreateDapiOfficial({
                        displayName: name.trim(),
                        wabaId: accountId.trim(),
                        phoneNumberId: phoneNumberId.trim(),
                        accessToken: apiKey.trim(),
                      });
                      close();
                    }
                  }}
                  disabled={creating || !officialManualOk}
                >
                  {creating ? (
                    <>
                      <Loader2 className="size-4 mr-1.5 animate-spin" /> Conectando…
                    </>
                  ) : (
                    <>
                      Salvar Credenciais Oficiais <ExternalLink className="size-4 ml-1.5" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
