import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

let ffmpegCheckCache: boolean | null = null;

export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegCheckCache !== null) return ffmpegCheckCache;
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    ffmpegCheckCache = true;
  } catch {
    ffmpegCheckCache = false;
  }
  return ffmpegCheckCache;
}

/**
 * Remuxes a WebM (Opus) audio buffer to native Ogg Opus buffer.
 * Performs instantaneous stream copy (-c:a copy) without lossy re-encoding.
 */
export async function remuxWebmToOggOpus(inputBuffer: Buffer): Promise<Buffer | null> {
  const canRun = await isFfmpegAvailable();
  if (!canRun) return null;

  const inPath = join(tmpdir(), `in_${randomUUID()}.webm`);
  const outPath = join(tmpdir(), `out_${randomUUID()}.ogg`);

  try {
    await writeFile(inPath, inputBuffer);
    await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-c:a", "copy", outPath]);
    const oggBuffer = await readFile(outPath);
    return oggBuffer;
  } catch (err: any) {
    console.warn("[remuxWebmToOggOpus] FFmpeg remux failed, falling back:", err?.message);
    return null;
  } finally {
    void unlink(inPath).catch(() => {});
    void unlink(outPath).catch(() => {});
  }
}
