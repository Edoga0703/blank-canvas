import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LinkIcon, LogOut, Sheet, ExternalLink } from "lucide-react";
import {
  getSheetsStatus,
  startSheetsConnect,
  completeSheetsConnect,
  disconnectSheets,
  exportContatosSheets,
} from "@/lib/sheets.functions";

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
        event.data?.connectorId !== "google_sheets" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("Não foi possível autorizar o Google Sheets."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("A janela foi fechada antes de concluir."));
    }, 500);
  });
}

/** Conexão da conta do Google Sheets — uma por usuário do Metrix. */
export function GoogleSheetsPanel() {
  const status = useServerFn(getSheetsStatus);
  const start = useServerFn(startSheetsConnect);
  const complete = useServerFn(completeSheetsConnect);
  const desconectarFn = useServerFn(disconnectSheets);
  const exportar = useServerFn(exportContatosSheets);

  const [loading, setLoading] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ultimaUrl, setUltimaUrl] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r: any = await status();
      setConectado(!!r?.conectado);
    } catch {
      setConectado(false);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function conectar() {
    const popup = window.open("", "metrix-sheets-oauth", "width=600,height=720");
    if (!popup) return toast.error("Libere os pop-ups do navegador e tente de novo.");
    setBusy(true);
    try {
      const { authorizationUrl }: any = await start();
      const espera = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await espera;
      if (code) await complete({ data: { code } });
      toast.success("Google Sheets conectado!");
      await load();
    } catch (e: any) {
      popup.close();
      toast.error(e?.message ?? "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }

  async function desconectar() {
    setBusy(true);
    try {
      await desconectarFn();
      toast.success("Google Sheets desconectado.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao desconectar.");
    } finally {
      setBusy(false);
    }
  }

  async function exportarContatos() {
    setBusy(true);
    const t = toast.loading("Gerando planilha com seus contatos…");
    try {
      const r: any = await exportar();
      if (r?.ok) {
        setUltimaUrl(r.url);
        toast.success(`${r.total} contato(s) exportados para o Google Sheets!`, { id: t });
      } else if (r?.reconnect) {
        toast.error("Sua conexão com o Google expirou. Conecte novamente.", { id: t });
        setConectado(false);
      } else {
        toast.error(r?.erro ?? "Falha ao exportar.", { id: t });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao exportar.", { id: t });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Verificando conexão…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={conectado ? "default" : "secondary"}>
            {conectado ? "Conectado" : "Desconectado"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Cada atendente conecta a própria conta do Google.
          </span>
        </div>
        {conectado ? (
          <Button size="sm" variant="ghost" onClick={desconectar} disabled={busy} title="Sair / Desconectar o Google Sheets">
            <LogOut className="size-4 mr-1" /> Desconectar
          </Button>
        ) : null}
      </div>

      {!conectado ? (
        <Button onClick={conectar} disabled={busy} className="w-full">
          {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <LinkIcon className="size-4 mr-2" />}
          Conectar Google Sheets
        </Button>
      ) : (
        <div className="space-y-2">
          <Button onClick={exportarContatos} disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Sheet className="size-4 mr-2" />}
            Exportar contatos para uma planilha
          </Button>
          <p className="text-xs text-muted-foreground">
            Cria uma planilha nova na sua conta com todos os contatos da empresa (nome, telefone, e-mail, etapa, valor e última interação).
          </p>
          {ultimaUrl ? (
            <a
              href={ultimaUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="size-3" /> Abrir última planilha gerada
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
