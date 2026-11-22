import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Loader2,
  QrCode,
  Sparkles,
  ArrowLeft,
  ExternalLink,
  Smartphone,
  Cloud,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { openDapiOfficialPopup } from "@/lib/dapi-connect";

type ProviderKey = "dapi" | "oficial_meta";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDapi?: (displayName: string) => Promise<void>;
  onCreateDapiOfficial?: (params: {
    displayName: string;
    sessionId?: string;
    connectionId?: string;
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
    desc: "WhatsApp Business Cloud API oficial via D-API. Conexão corporativa direta com a Meta, com suporte a Coexistência e selo de verificação.",
    bullets: [
      "Suporte a Coexistência (celular + API oficial juntos)",
      "Popup Oficial D-API (Embedded Signup em 1 clique)",
      "Sem risco de bloqueio ou banimento de número",
      "Compatível com envio em massa e templates HSM",
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
  const [signupMode, setSignupMode] = useState<"coexistence" | "standard">("coexistence");
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupError, setPopupError] = useState<string | null>(null);

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

  function close() {
    if (creating || popupLoading) return;
    setSelected(null);
    setOfficialMode("popup");
    setSignupMode("coexistence");
    setPopupError(null);
    setPopupLoading(false);
    setName("");
    setApiKey("");
    setAccountId("");
    setPhoneNumberId("");
    onOpenChange(false);
  }

  async function handleConnectWithMeta() {
    if (!onCreateDapiOfficial) return;
    setPopupLoading(true);
    setPopupError(null);

    try {
      const result = await openDapiOfficialPopup({
        mode: signupMode,
        metadata: {
          displayName: name.trim() || undefined,
        },
      });

      const effectiveName =
        name.trim() ||
        (result.phoneNumber
          ? `WhatsApp Oficial (${result.phoneNumber})`
          : signupMode === "coexistence"
          ? "WhatsApp Oficial (Coexistência)"
          : "WhatsApp Oficial Meta");

      await onCreateDapiOfficial({
        displayName: effectiveName,
        sessionId: result.connectionId,
        connectionId: result.connectionId,
        phoneNumber: result.phoneNumber || undefined,
        accessToken: result.accessToken,
        wabaId: result.wabaId,
        phoneNumberId: result.phoneNumberId,
      });

      close();
    } catch (err: any) {
      setPopupError(err?.message || "Não foi possível concluir a autenticação com a Meta.");
    } finally {
      setPopupLoading(false);
    }
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
            onClick={() => {
              setSelected("dapi");
              setPopupError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              selected === "dapi"
                ? "bg-background shadow-xs text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <QrCode className="size-3.5" /> WhatsApp Não Oficial (QR / Celular)
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected("oficial_meta");
              setPopupError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              selected === "oficial_meta"
                ? "bg-background shadow-xs text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
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
                      Conecte via Popup Oficial da Meta (com Coexistência no celular) ou informe as credenciais WABA manualmente.
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOfficialMode("popup");
                      setPopupError(null);
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      officialMode === "popup" ? "bg-background shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    Conexão Rápida (Popup)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOfficialMode("manual");
                      setPopupError(null);
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      officialMode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    Credenciais WABA
                  </button>
                </div>
              </div>
            </Card>

            <div className="space-y-1.5">
              <Label htmlFor="off-name">Nome da conexão (opcional)</Label>
              <Input
                id="off-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: WhatsApp Oficial Comercial"
                disabled={creating || popupLoading}
              />
            </div>

            {officialMode === "popup" ? (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Escolha o modo de conexão oficial
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div
                    onClick={() => !popupLoading && setSignupMode("coexistence")}
                    className={`rounded-xl border p-3.5 cursor-pointer transition-all ${
                      signupMode === "coexistence"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/40 bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                        <Smartphone className="size-4 text-emerald-600 shrink-0" /> Coexistência
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                      >
                        Recomendado
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      <b>Mantém o WhatsApp Business ativo no seu celular</b> e conecta à API Oficial ao mesmo tempo.
                      Você escaneia um QR Code no celular durante o popup da Meta e todo o histórico é mantido.
                    </p>
                  </div>

                  <div
                    onClick={() => !popupLoading && setSignupMode("standard")}
                    className={`rounded-xl border p-3.5 cursor-pointer transition-all ${
                      signupMode === "standard"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/40 bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                        <Cloud className="size-4 text-blue-600 shrink-0" /> Embedded Signup
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-500/30">
                        100% Nuvem
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Conecta ou registra um número corporativo direto na Cloud API da Meta (sem aplicativo ativo no celular físico).
                    </p>
                  </div>
                </div>

                {popupError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{popupError}</span>
                  </div>
                )}

                <Card className="p-3 bg-muted/40 border-dashed text-xs text-muted-foreground space-y-1.5">
                  <div className="font-medium text-foreground flex items-center gap-1.5">
                    <HelpCircle className="size-3.5 text-primary" /> O que acontecerá ao clicar no botão:
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[11px]">
                    <li>Uma janela segura da D-API (<code className="font-mono">connect.d-api.cloud</code>) abrirá a autenticação da Meta.</li>
                    <li>Faça login no Facebook e selecione seu portfólio de negócios (WABA).</li>
                    {signupMode === "coexistence" ? (
                      <li>
                        <b>No celular:</b> abra WhatsApp Business &gt; Aparelhos Conectados &gt; Conectar Aparelho e escaneie o QR da Meta.
                      </li>
                    ) : (
                      <li>Selecione o número de telefone da sua empresa para operar via Cloud API.</li>
                    )}
                    <li>Ao concluir, a janela fechará sozinha e o número estará pronto para uso.</li>
                  </ol>
                </Card>
              </div>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(null)}
                disabled={creating || popupLoading}
              >
                <ArrowLeft className="size-4 mr-1" /> Voltar
              </Button>
              {officialMode === "popup" ? (
                <Button
                  onClick={handleConnectWithMeta}
                  disabled={creating || popupLoading}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {popupLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Conectando com a Meta…
                    </>
                  ) : (
                    <>
                      Conectar com a Meta (Popup) <ExternalLink className="size-4 ml-1" />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={async () => {
                    if (onCreateDapiOfficial) {
                      await onCreateDapiOfficial({
                        displayName: name.trim() || "WhatsApp Oficial Meta",
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
