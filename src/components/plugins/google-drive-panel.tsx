import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LinkIcon, LogOut } from "lucide-react";
import { getDriveStatus, startDriveConnect, completeDriveConnect, disconnectDrive } from "@/lib/drive.functions";

function waitForOAuth(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.data?.connectorId !== "google_drive" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("Não foi possível autorizar o Google Drive."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("A janela foi fechada antes de concluir."));
    }, 500);
  });
}

/** Conexão da conta do Google Drive — uma por usuário do Metrix. */
export function GoogleDrivePanel() {
  const status = useServerFn(getDriveStatus);
  const start = useServerFn(startDriveConnect);
  const complete = useServerFn(completeDriveConnect);
  const desconectarFn = useServerFn(disconnectDrive);

  const [loading, setLoading] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [podeConectar, setPodeConectar] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r: any = await status();
      setConectado(!!r?.conectado);
      setPodeConectar(!!r?.podeConectar);
    } catch {
      setConectado(false);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function conectar() {
    const popup = window.open("", "metrix-drive-oauth", "width=600,height=720");
    if (!popup) return toast.error("Libere os pop-ups do navegador e tente de novo.");
    setBusy(true);
    try {
      const { authorizationUrl }: any = await start();
      const espera = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await espera;
      if (code) await complete({ data: { code } });
      toast.success("Google Drive conectado!");
      await load();
    } catch (e: any) {
      popup.close();
      toast.error(e?.message ?? "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }

  async function desconectar() {
    if (!window.confirm("Desconectar o Google Drive? Os arquivos continuam no seu Drive.")) return;
    setBusy(true);
    try {
      await desconectarFn();
      setConectado(false);
      toast.success("Google Drive desconectado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao desconectar.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={conectado ? "default" : "secondary"}>{conectado ? "Conectado" : "Desconectado"}</Badge>
        <span className="text-xs text-muted-foreground">Conta única da empresa: o administrador conecta e toda a equipe usa o mesmo Drive.</span>
      </div>

      {conectado ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Os arquivos aparecem no detalhe do lead, aba <strong>Mídia → Drive</strong>, em uma pasta por contato dentro de “Capi Conversa”, iguais para todos os usuários.
          </p>
          {podeConectar && (
            <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={desconectar}>
              <LogOut className="size-3.5 mr-1.5" /> Desconectar
            </Button>
          )}
        </div>
      ) : podeConectar ? (
        <Button size="sm" className="w-full" disabled={busy} onClick={conectar}>
          {busy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <LinkIcon className="size-3.5 mr-1.5" />}
          Conectar Google Drive
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Peça ao administrador para conectar a conta do Google Drive da empresa.</p>
      )}
    </div>
  );
}
