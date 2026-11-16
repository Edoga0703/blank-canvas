import { Toaster as Sonner, type ToasterProps, toast } from "sonner";
import { useEffect, useRef, useState } from "react";

// Suprime erros de requisição cancelada (AbortError / The operation was aborted)
// que ocorrem normalmente quando o usuário troca de chat ou navega rapidamente
export function isAbortLike(arg: unknown): boolean {
  if (!arg) return false;
  if (typeof arg === "string") {
    const s = arg.toLowerCase();
    return (
      s.includes("the operation was aborted") ||
      s.includes("aborterror") ||
      s.includes("user aborted a request") ||
      s.includes("fetch is aborted") ||
      s.includes("signal is aborted") ||
      s === "aborted"
    );
  }
  if (typeof arg === "object") {
    const err = arg as any;
    if (err.name === "AbortError") return true;
    if (typeof err.message === "string" && isAbortLike(err.message)) return true;
    if (typeof err.details === "string" && isAbortLike(err.details)) return true;
  }
  return false;
}

if (typeof window !== "undefined" && (toast as any) && !(toast as any).__abortGuarded) {
  (toast as any).__abortGuarded = true;
  const originalError = toast.error.bind(toast);
  toast.error = (message: any, data?: any) => {
    if (isAbortLike(message) || (data && isAbortLike(data?.description))) {
      console.debug("[sonner] Suppressed benign abort error:", message);
      return "" as any;
    }
    return originalError(message, data);
  };
}

// Beep sintetizado via WebAudio — evita depender de arquivo de áudio
function playToastSound(type: "success" | "error" | "info" = "info") {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freqs: Record<string, number[]> = {
      success: [660, 880],
      error: [420, 300],
      info: [720, 720],
    };
    const [f1, f2] = freqs[type] ?? freqs.info;
    osc.type = "sine";
    osc.frequency.setValueAtTime(f1, now);
    osc.frequency.exponentialRampToValueAtTime(f2, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
    osc.onended = () => ctx.close();
  } catch {
    // ignore
  }
}

const Toaster = ({ ...props }: ToasterProps) => {
  const seen = useRef<Set<string | number>>(new Set());

  useEffect(() => {
    // Observa novos toasts no DOM e toca som ao aparecerem
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const el = node.matches?.("[data-sonner-toast]") ? node : node.querySelector?.("[data-sonner-toast]");
          if (!el) return;
          const id = (el as HTMLElement).getAttribute("data-sonner-toast-id") || (el as HTMLElement).id || Math.random();
          if (seen.current.has(id)) return;
          seen.current.add(id);
          const type = (el as HTMLElement).getAttribute("data-type") as "success" | "error" | "info" | null;
          playToastSound(type === "success" || type === "error" ? type : "info");
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <Sonner
      className="toaster group"
      position={isMobile ? "top-center" : "bottom-right"}
      offset={isMobile ? 12 : 24}
      mobileOffset={12}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:text-[12.5px] group-[.toaster]:py-2.5 group-[.toaster]:px-3",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );

};

export { Toaster, toast };
