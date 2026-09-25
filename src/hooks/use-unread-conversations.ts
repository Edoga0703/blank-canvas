import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const readKey = (cid: string) => `conv-read:${cid}`;

export function getConvReadMap(companyId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(readKey(companyId)) || "{}") || {}; }
  catch { return {}; }
}

export function markConvRead(companyId: string, numero: string, when: string = new Date().toISOString()) {
  if (typeof window === "undefined" || !companyId || !numero) return;
  const map = getConvReadMap(companyId);
  map[numero] = when;
  try { localStorage.setItem(readKey(companyId), JSON.stringify(map)); } catch {}
  try { window.dispatchEvent(new CustomEvent("conv-read-changed", { detail: { companyId, numero } })); } catch {}
}

/** Sentinela: conversa marcada manualmente como "não lida" (estilo WhatsApp). */
export const CONV_FORCE_UNREAD = "force-unread";

export function markConvUnread(companyId: string, numero: string) {
  if (typeof window === "undefined" || !companyId || !numero) return;
  const map = getConvReadMap(companyId);
  map[numero] = CONV_FORCE_UNREAD;
  try { localStorage.setItem(readKey(companyId), JSON.stringify(map)); } catch {}
  try { window.dispatchEvent(new CustomEvent("conv-read-changed", { detail: { companyId, numero } })); } catch {}
}

/**
 * Conta conversas cuja última mensagem é de entrada E ainda não foi "lida"
 * (aberta) pelo usuário atual neste navegador.
 */
export function useUnreadConversations(
  companyId?: string | null,
  opts?: { onlyOwnerId?: string | null },
) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlyOwnerId = opts?.onlyOwnerId ?? null;

  useEffect(() => {
    if (!companyId) { setCount(0); return; }
    const cid = companyId;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("mensagens")
        .select("numero,direcao,created_at")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (cancelled || !data) return;
      const latest = new Map<string, { direcao: string; created_at: string }>();
      for (const m of data as any[]) {
        // Grupos têm aba própria e não contam como atendimento aberto.
        if (String(m.numero).includes("@g.us")) continue;
        if (!latest.has(m.numero)) latest.set(m.numero, { direcao: m.direcao, created_at: m.created_at });
      }
      // Quando o usuário só enxerga o que é dele, conta apenas conversas designadas.
      let permitidos: Set<string> | null = null;
      if (onlyOwnerId) {
        const { data: cards } = await supabase
          .from("crm_cards")
          .select("numero,owner_id,transfer_status,transfer_para_user_id")
          .eq("company_id", cid);
        if (cancelled) return;
        permitidos = new Set(
          ((cards as any[]) ?? [])
            .filter((c) =>
              c.owner_id === onlyOwnerId ||
              (c.transfer_status === "pendente" && c.transfer_para_user_id === onlyOwnerId))
            .map((c) => c.numero as string),
        );
      }
      const readMap = getConvReadMap(cid);
      let c = 0;
      for (const [numero, info] of latest.entries()) {
        if (permitidos && !permitidos.has(numero)) continue;
        if (readMap[numero] === CONV_FORCE_UNREAD) { c++; continue; }
        if (info.direcao !== "entrada") continue;
        const readAt = readMap[numero];
        if (!readAt || new Date(readAt).getTime() < new Date(info.created_at).getTime()) c++;
      }
      setCount(c);
    }

    function scheduleReload() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { void load(); }, 1500);
    }

    void load();
    const ch = supabase
      .channel(`unread:${cid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `company_id=eq.${cid}` },
        () => { scheduleReload(); },
      )
      .subscribe();

    const onRead = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.companyId === cid) scheduleReload();
    };
    window.addEventListener("conv-read-changed", onRead);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
      window.removeEventListener("conv-read-changed", onRead);
    };
  }, [companyId, onlyOwnerId]);

  return count;
}
