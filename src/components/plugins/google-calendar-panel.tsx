import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  startGoogleOAuth,
  disconnectGoogle,
  getGoogleStatus,
  listGoogleCalendars,
  setGoogleCalendar,
  testGoogleCalendar,
  syncGoogleNow,
  startCalendarSync,
} from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, RefreshCw, LinkIcon, Unlink, CalendarCheck, RotateCw } from "lucide-react";

type Status = {
  configured: boolean;
  conectado: boolean;
  email: string | null;
  calendarId: string | null;
  ultimaSync?: string | null;
  precisaReconectar?: boolean;
};
type Cal = { id: string; summary: string; primary: boolean };

export function GoogleCalendarPanel() {
  const status = useServerFn(getGoogleStatus);
  const start = useServerFn(startGoogleOAuth);
  const disconnect = useServerFn(disconnectGoogle);
  const listCals = useServerFn(listGoogleCalendars);
  const setCal = useServerFn(setGoogleCalendar);
  const test = useServerFn(testGoogleCalendar);
  const syncNow = useServerFn(syncGoogleNow);
  const startSync = useServerFn(startCalendarSync);

  const [st, setSt] = useState<Status | null>(null);
  const [cals, setCals] = useState<Cal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);


  async function load() {
    setLoading(true);
    try {
      const s = (await status()) as Status;
      setSt(s);
      if (s.conectado) {
        const r: any = await listCals();
        if (r.ok) setCals(r.items);
      } else setCals([]);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar status");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function conectar() {
    setBusy("connect");
    try {
      const r: any = await start();
      if (!r.ok) return toast.error(r.error);
      
      // Calculate popup size and position
      const width = 500;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        r.url,
        "google-oauth",
        `width=${width},height=${height},top=${top},left=${left},status=no,menubar=no,toolbar=no`
      );

      if (popup) {
        // Poll for window closure or location change
        const interval = setInterval(() => {
          if (popup.closed) {
            clearInterval(interval);
            void load();
          }
        }, 1000);
      } else {
        // If popup blocked, fallback to direct redirect
        window.location.href = r.url;
      }
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(null); }
  }

  async function desconectar() {
    if (!confirm("Desconectar o Google Agenda desta empresa?")) return;
    setBusy("disconnect");
    try { await disconnect(); toast.success("Desconectado"); await load(); }
    catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(null); }
  }

  async function escolher(id: string) {
    setBusy("cal");
    try {
      await setCal({ data: { calendarId: id } });
      setSt((p) => (p ? { ...p, calendarId: id } : p));
      toast.success("Agenda selecionada");
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(null); }
  }

  async function testar() {
    setBusy("test");
    try {
      const r: any = await test();
      if (r.ok) toast.success("Evento de teste criado no Google Agenda");
      else toast.error(r.error);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(null); }
  }

  async function sincronizar() {
    setBusy("sync");
    try {
      const r: any = await syncNow();
      if (r?.ok) {
        toast.success(r.atualizados ? `${r.atualizados} compromisso(s) atualizado(s)` : "Tudo sincronizado");
        await startSync().catch(() => {});
        await load();
      } else toast.error(r?.error || "Falha na sincronização");
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(null); }
  }


  if (loading) {
    return <div className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  if (st && !st.configured) {
    return <p className="text-sm text-muted-foreground">Credenciais do Google não configuradas no servidor.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant={st?.conectado ? "default" : "secondary"}>
          {st?.conectado ? "Conectado" : "Desconectado"}
        </Badge>
        {st?.email && <span className="text-xs text-muted-foreground truncate">{st.email}</span>}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={load}>
          <RefreshCw className="size-3.5 mr-1" /> Atualizar
        </Button>
      </div>

      {st?.conectado ? (
        <>
          <div>
            <Label className="text-xs">Agenda destino</Label>
            <select
              value={st.calendarId ?? "primary"}
              disabled={busy === "cal"}
              onChange={(e) => escolher(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {cals.length === 0 && <option value="primary">primary</option>}
              {cals.map((c) => (
                <option key={c.id} value={c.id}>{c.summary}{c.primary ? " (principal)" : ""}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy === "test"} onClick={testar}>
              {busy === "test" ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <CalendarCheck className="size-3.5 mr-1.5" />}
              Criar evento de teste
            </Button>
            <Button size="sm" variant="secondary" disabled={busy === "sync"} onClick={sincronizar}>
              {busy === "sync" ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <RotateCw className="size-3.5 mr-1.5" />}
              Sincronizar agora
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" disabled={busy === "disconnect"} onClick={desconectar}>
              <Unlink className="size-3.5 mr-1.5" /> Desconectar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Compromissos criados, editados ou excluídos no CRM sincronizam com esta agenda — e alterações feitas no Google voltam para o CRM automaticamente.
            {st?.ultimaSync && <> Última sincronização: {new Date(st.ultimaSync).toLocaleString("pt-BR")}.</>}
          </p>

        </>
      ) : (
        <Button size="sm" className="w-full" disabled={busy === "connect"} onClick={conectar}>
          {busy === "connect" ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <LinkIcon className="size-3.5 mr-1.5" />}
          Conectar com Google
        </Button>
      )}
    </div>
  );
}
