import { normalizePhone } from "@/lib/br-phone";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Loader2, QrCode, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { toast } from "sonner";
import { checkWhatsappStatus, connectWhatsapp } from "@/lib/evolution.functions";

type Props = {
  open: boolean;
  instanceName: string | null;
  initialQr?: string | null;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
};

type Mode = "qr" | "phone";

function formatPhoneBR(digits: string) {
  const d = digits.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function QrCodeDialog({ open, instanceName, initialQr, onOpenChange, onConnected }: Props) {
  const check = useServerFn(checkWhatsappStatus);
  const connect = useServerFn(connectWhatsapp);
  const [mode, setMode] = useState<Mode>("qr");
  const [qr, setQr] = useState<string | null>(initialQr ?? null);
  const [status, setStatus] = useState<string>("connecting");
  const [refreshing, setRefreshing] = useState(false);
  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [requestingCode, setRequestingCode] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setQr(initialQr ?? null);
    setStatus("connecting");
    setPairCode(null);
    setPhone("");
    setMode("qr");
  }, [instanceName, initialQr]);

  useEffect(() => {
    if (!open || !instanceName) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const tick = async () => {
      try {
        const r: any = await check({ data: { instanceName } });
        if (r?.qrBase64) setQr(r.qrBase64);
        if (r?.status) setStatus(r.status);
        if (r?.status === "connected") {
          toast.success("WhatsApp conectado!");
          onConnected?.();
          onOpenChange(false);
        }
      } catch {}
    };
    void tick();
    pollRef.current = setInterval(tick, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [open, instanceName]);

  async function refreshQr() {
    if (!instanceName) return;
    setRefreshing(true);
    try {
      const r: any = await connect({ data: { instanceName, createNew: false } });
      if (r?.qrBase64) setQr(r.qrBase64);
      toast.message("QR Code atualizado.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar QR");
    } finally { setRefreshing(false); }
  }

  async function requestPairingCode() {
    if (!instanceName) return;
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 9) {
      toast.error("Informe um número válido com código de país.");
      return;
    }
    setRequestingCode(true);
    setPairCode(null);
    try {
      let lastQr: string | null = null;
      // Alguns servidores demoram a emitir o código; tenta por alguns segundos.
      for (let attempt = 0; attempt < 4; attempt++) {
        const r: any = await connect({ data: { instanceName, createNew: false, phone: normalized } });
        if (r?.qrBase64) lastQr = r.qrBase64;
        const code = r?.pairingCode || null;
        if (code) {
          setPairCode(String(code));
          return;
        }
        if (r?.state === "open" || r?.state === "connected") {
          toast.success("WhatsApp já está conectado.");
          return;
        }
        if (r?.error) {
          toast.error(r.error);
          return;
        }
        await new Promise((res) => setTimeout(res, 2500));
      }
      // Servidor não emite código de pareamento: cai para o QR Code automaticamente.
      if (lastQr) setQr(lastQr);
      setMode("qr");
      toast.message("Este servidor não entrega código de 8 dígitos. Use o QR Code abaixo.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar código");
    } finally { setRequestingCode(false); }
  }

  function copyCode() {
    if (!pairCode) return;
    navigator.clipboard.writeText(pairCode).then(() => toast.success("Código copiado!")).catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <QrCode className="size-4" />
            </div>
            Conectar WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("qr")}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "qr" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <QrCode className="size-3.5" /> QR Code
          </button>
          <button
            type="button"
            onClick={() => setMode("phone")}
            className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "phone" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Smartphone className="size-3.5" /> Número do WhatsApp
          </button>
        </div>

        {mode === "qr" ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="bg-white p-3 rounded-xl border w-fit">
              {qr ? (
                <img src={qr} alt="QR Code WhatsApp" className="size-64 object-contain" />
              ) : (
                <div className="size-64 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="size-8 animate-spin" />
                  <span className="text-xs">Gerando QR Code…</span>
                </div>
              )}
            </div>

            <div className="text-center space-y-1">
              <div className="text-sm font-medium">Abra o WhatsApp e escaneie o QR Code</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Verificando conexão automaticamente…
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={refreshQr} disabled={refreshing || !instanceName}>
                {refreshing ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <RefreshCw className="size-4 mr-1.5" />}
                Atualizar QR
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  if (!instanceName) return;
                  try {
                    const r: any = await check({ data: { instanceName } });
                    if (r?.status === "connected") {
                      toast.success("WhatsApp conectado!");
                      onConnected?.();
                      onOpenChange(false);
                    } else {
                      toast.message("Ainda não conectado. Escaneie o QR Code.");
                    }
                  } catch (e: any) { toast.error(e?.message || "Erro ao verificar"); }
                }}
                disabled={!instanceName}
              >
                <Wifi className="size-4 mr-1.5" /> Verificar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Número do WhatsApp (com DDD)</label>
              <Input
                value={formatPhoneBR(phone)}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(85) 99999-0000"
                inputMode="tel"
                maxLength={16}
                disabled={!!pairCode}
              />
            </div>

            {pairCode ? (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-xl border bg-muted/40 px-6 py-4 flex items-center gap-3">
                  <span className="text-2xl font-bold tracking-[0.3em] font-mono">{pairCode}</span>
                  <Button variant="ghost" size="icon" onClick={copyCode} aria-label="Copiar código">
                    <Copy className="size-4" />
                  </Button>
                </div>
                <div className="text-center space-y-1">
                  <div className="text-sm font-medium">Digite este código no seu WhatsApp</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    No celular: WhatsApp → Aparelhos conectados → Conectar aparelho →<br />
                    <span className="font-medium">"Conectar com número de telefone"</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 pt-1">
                    <Loader2 className="size-3 animate-spin" />
                    Verificando conexão automaticamente…
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={() => setPairCode(null)} disabled={requestingCode}>
                  <RefreshCw className="size-4 mr-1.5" /> Gerar outro código
                </Button>
              </div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  Você receberá um código de 8 dígitos para digitar no WhatsApp do número informado, em <span className="font-medium">Aparelhos conectados → Conectar aparelho</span>.
                </div>
                <Button className="w-full" onClick={requestPairingCode} disabled={requestingCode || !instanceName}>
                  {requestingCode ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Smartphone className="size-4 mr-1.5" />}
                  Gerar código de pareamento
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
