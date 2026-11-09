import { Input, Output, BufferSource, BufferTarget, OggOutputFormat, ALL_FORMATS, Conversion } from "mediabunny";

/**
 * Remuxea un buffer WebM Opus a contenedor OGG Opus nativo en Node / Cloudflare Server.
 * Usa mediabunny en TypeScript puro (sin depender de binarios externos de FFmpeg).
 */
export async function remuxWebmToOggOpus(inputBuffer: Buffer): Promise<Buffer | null> {
  try {
    const arrayBuffer = inputBuffer.buffer.slice(
      inputBuffer.byteOffset,
      inputBuffer.byteOffset + inputBuffer.byteLength,
    );
    const input = new Input({
      source: new BufferSource(arrayBuffer),
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
    return Buffer.from(target.buffer);
  } catch (err: any) {
    console.warn("[remuxWebmToOggOpus] Mediabunny remux warning:", err?.message);
    return null;
  }
}

export async function isFfmpegAvailable(): Promise<boolean> {
  return true;
}
