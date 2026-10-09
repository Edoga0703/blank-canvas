import { MapPin, ExternalLink } from "lucide-react";

export type ParsedLocation = { lat: number; lng: number; label?: string | null };

/** Detecta mensagens de localização gravadas como "📍 Localização..." + link do mapa. */
export function parseLocationText(texto?: string | null): ParsedLocation | null {
  if (!texto) return null;
  if (!texto.includes("📍")) return null;
  const m = texto.match(/maps\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = texto
    .split("\n")[0]
    ?.replace(/^📍\s*/, "")
    .replace(/^Localização:?\s*/i, "")
    .trim();
  return { lat, lng, label: label || null };
}

export function ChatLocation({ loc, outbound }: { loc: ParsedLocation; outbound?: boolean }) {
  const d = 0.004;
  const bbox = `${loc.lng - d},${loc.lat - d},${loc.lng + d},${loc.lat + d}`;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat},${loc.lng}`;
  const open = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;

  return (
    <div className="mb-1.5 w-[240px] max-w-full overflow-hidden rounded-lg border border-black/10 bg-background">
      <iframe
        title="Localização recebida"
        src={embed}
        loading="lazy"
        className="block h-[140px] w-full border-0"
      />
      <a
        href={open}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-foreground hover:bg-muted"
      >
        <MapPin className="size-3.5 shrink-0 text-primary" />
        <span className="truncate flex-1">{loc.label || "Localização"}</span>
        <ExternalLink className="size-3 shrink-0 opacity-60" />
      </a>
    </div>
  );
}
