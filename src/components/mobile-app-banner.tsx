import { useEffect, useState } from "react";
import { Smartphone, X, ArrowRight } from "lucide-react";

const KEY = "metrix-mobile-banner-dismissed";

export function MobileAppBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setShow(false);
  }

  return (
    <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 sm:flex sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Smartphone className="size-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">Novo: use o {"Metrix"} no celular</div>
          <div className="truncate text-[12px] text-muted-foreground">
            Instale na tela de início e atenda leads de qualquer lugar.
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <a
          href="/mobile"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90"
        >
          Ver tutorial <ArrowRight className="size-3.5" />
        </a>
        <button
          onClick={dismiss}
          title="Dispensar"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
