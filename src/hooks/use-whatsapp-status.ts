import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { checkWhatsappStatus } from "@/lib/evolution.functions";
import { supabase } from "@/integrations/supabase/client";

type Status = "connected" | "connecting" | "disconnected" | "unknown";

export function useWhatsappStatus(intervalMs = 60000) {
  const check = useServerFn(checkWhatsappStatus);
  const [status, setStatus] = useState<Status>("unknown");
  const prevRef = useRef<Status>("unknown");
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function run() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        // sem sessão ativa não há bearer token: evita 401 no server fn
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const r = await check({ data: { instanceName: null } });
        if (!alive) return;
        const next = ((r.status as Status) || "disconnected") as Status;
        setStatus(next);

        const prev = prevRef.current;
        // Notifica transições relevantes
        if (prev !== next) {
          if (next === "disconnected" && prev !== "unknown") {
            toastIdRef.current = toast.error("WhatsApp desconectado", {
              description: "Verifique o celular (internet/bateria) e reconecte em Conexão.",
              duration: Infinity,
              id: "wpp-disconnected",
            });
          } else if (next === "connected" && prev === "disconnected") {
            if (toastIdRef.current) toast.dismiss(toastIdRef.current);
            toastIdRef.current = null;
            toast.success("WhatsApp reconectado");
          }
          prevRef.current = next;
        }
      } catch {
        // erro transitório: NÃO derruba o status
      }
    }
    void run();
    timer = setInterval(() => { void run(); }, intervalMs);
    const onVis = () => { if (!document.hidden) void run(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [check, intervalMs]);

  return status;
}
