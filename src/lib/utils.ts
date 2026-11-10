import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Remueve bloques internos de análisis de medios (ej. [Imagen recibido: ...])
 * para que nunca se muestren en citas, previews o cotizaciones a WhatsApp.
 */
export function stripAiMediaAnalysis(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/\[(?:Imagen|Documento) recibid[ao]:[\s\S]*?\]/gi, "")
    .replace(/\[O cliente enviou um[a]? (?:imagem|documento|v[íi]deo)[^:]*:[\s\S]*?\]/gi, "")
    .trim();
}
