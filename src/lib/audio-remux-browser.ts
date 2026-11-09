import { Input, Output, BlobSource, BufferTarget, OggOutputFormat, ALL_FORMATS, Conversion } from "mediabunny";

/**
 * Convierte un Blob de audio WebM (generado por MediaRecorder en Chrome/Edge)
 * a un Blob OGG Opus nativo directamente en el navegador antes de subirlo a R2/servidor.
 * WhatsApp exige estrictamente OGG Opus para notas de voz nativas (PTT).
 */
export async function convertWebmToOggBlob(webmBlob: Blob): Promise<Blob | null> {
  try {
    const input = new Input({
      source: new BlobSource(webmBlob),
      formats: ALL_FORMATS,
    });
    const target = new BufferTarget();
    const output = new Output({
      format: new OggOutputFormat(),
      target,
    });
    const conv = await Conversion.init({ input, output });
    if (!conv.isValid) return null;
    await conv.execute();
    if (!target.buffer) return null;
    return new Blob([target.buffer], { type: "audio/ogg; codecs=opus" });
  } catch (e: any) {
    console.warn("[convertWebmToOggBlob] Failed to convert WebM to Ogg:", e?.message);
    return null;
  }
}
