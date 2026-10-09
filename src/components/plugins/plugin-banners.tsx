import { useEffect, useState } from "react";
import type { PluginBanner } from "@/lib/plugin-banners.functions";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PluginBanners({
  banners,
  onSelect,
}: {
  banners: PluginBanner[];
  onSelect?: (b: PluginBanner) => void;
}) {
  const [idx, setIdx] = useState(0);
  const n = banners.length;

  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n]);

  useEffect(() => {
    if (idx >= n) setIdx(0);
  }, [n, idx]);

  if (n === 0) return null;

  const go = (d: -1 | 1) => setIdx((i) => (i + d + n) % n);

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-3xl bg-muted">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {banners.map((b) => {
            const img = (
              <picture>
                {b.imagem_mobile_url && (
                  <source media="(max-width: 640px)" srcSet={b.imagem_mobile_url} />
                )}
                <img
                  src={b.imagem_url}
                  alt={b.alt || "Banner"}
                  className="w-full aspect-[4/3] sm:aspect-[5/1] object-cover"
                  loading="lazy"
                />
              </picture>
            );
            const clickable = !!(b.link_url || b.plugin_id);
            return (
              <div key={b.id} className="shrink-0 w-full">
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (b.plugin_id) onSelect?.(b);
                      else if (b.link_url) window.open(b.link_url, "_blank", "noopener");
                    }}
                    className="block w-full text-left"
                  >
                    {img}
                  </button>
                ) : (
                  img
                )}
              </div>
            );
          })}
        </div>
      </div>

      {n > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            aria-label="Anterior"
            className="hidden md:grid absolute left-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background/90 border place-items-center shadow hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Próximo"
            className="hidden md:grid absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background/90 border place-items-center shadow hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                aria-label={`Banner ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-6 bg-primary" : "w-1.5 bg-background/70"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
