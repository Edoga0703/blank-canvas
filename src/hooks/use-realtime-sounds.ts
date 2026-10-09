import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playNewLeadSound, playNewMessageSound } from "@/lib/alert-sounds";

const MUTE_KEY = "app_sounds_muted";
const EVT = "app-sounds-muted-changed";

export function isSoundsMuted() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function useSoundsMuted() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(isSoundsMuted());
    const on = () => setMuted(isSoundsMuted());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);

  const toggle = useCallback(() => {
    const next = !isSoundsMuted();
    try { localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch { /* noop */ }
    setMuted(next);
    try { window.dispatchEvent(new Event(EVT)); } catch { /* noop */ }
  }, []);

  return { muted, toggle };
}

/**
 * Toca sons distintos para: lead novo (crm_cards insert) e
 * mensagem nova de entrada em qualquer conversa (mensagens insert).
 */
export function useRealtimeSounds(companyId?: string | null) {
  const lastPlay = useRef(0);

  useEffect(() => {
    if (!companyId) return;
    const cid = companyId;

    // ignora eventos antigos vindos no primeiro carregamento
    const startedAt = Date.now();

    function play(kind: "lead" | "message") {
      if (isSoundsMuted()) return;
      const now = Date.now();
      if (now - startedAt < 1500) return;
      if (now - lastPlay.current < 800) return; // anti-spam
      lastPlay.current = now;
      if (kind === "lead") playNewLeadSound();
      else playNewMessageSound();
    }

    const ch = supabase
      .channel(`sounds:${cid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_cards", filter: `company_id=eq.${cid}` },
        () => play("lead"),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `company_id=eq.${cid}` },
        (payload) => {
          const row = payload.new as { direcao?: string };
          if (row?.direcao !== "entrada") return;
          play("message");
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [companyId]);
}
