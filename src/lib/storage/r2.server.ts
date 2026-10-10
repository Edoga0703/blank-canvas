import { createHash, createHmac, randomUUID } from "node:crypto";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: URL;
  publicBaseUrl: string | null;
  maxFileBytes: number;
  signedUrlTtlSeconds: number;
};

export type StoredMediaObject = {
  storageKey: string;
  storageUrl: string | null;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de servidor ${name} para usar Cloudflare R2.`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name] || fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig(): R2Config {
  const accountId = required("R2_ACCOUNT_ID");
  const endpoint = new URL(process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`);
  return {
    accountId,
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucket: required("R2_BUCKET"),
    endpoint,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || null,
    maxFileBytes: positiveInteger("R2_MAX_FILE_BYTES", 50 * 1024 * 1024),
    signedUrlTtlSeconds: Math.min(604800, positiveInteger("R2_SIGNED_URL_TTL_SECONDS", 900)),
  };
}

export function isR2Configured(): boolean {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].every((name) =>
    Boolean(process.env[name]?.trim()),
  );
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Uint8Array, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function signingKey(secret: string, dateStamp: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), "auto"), "s3"), "aws4_request");
}

function awsDate(date: Date): { amzDate: string; dateStamp: string } {
  const compact = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: compact, dateStamp: compact.slice(0, 8) };
}

function encodePath(value: string): string {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function encodeQuery(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function safeFileName(value: string | null | undefined): string {
  const normalized = (value || "archivo")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "archivo";
}

function objectParts(config: R2Config, storageKey: string) {
  const host = config.endpoint.host;
  const basePath = config.endpoint.pathname.replace(/\/$/, "");
  const canonicalUri = `${basePath}/${encodePath(config.bucket)}/${encodePath(storageKey)}`;
  return { host, canonicalUri, endpoint: `${config.endpoint.origin}${canonicalUri}` };
}

function permanentUrl(config: R2Config, storageKey: string): string | null {
  return config.publicBaseUrl ? `${config.publicBaseUrl}/${encodePath(storageKey)}` : null;
}

export async function storeMediaObject(input: {
  companyId: string;
  bytes: Uint8Array | ArrayBuffer;
  mimeType?: string | null;
  fileName?: string | null;
  occurredAt?: string | Date | null;
}): Promise<StoredMediaObject> {
  const config = getConfig();
  const bytes = input.bytes instanceof ArrayBuffer ? new Uint8Array(input.bytes) : input.bytes;
  if (bytes.byteLength === 0) throw new Error("El archivo recibido está vacío.");
  if (bytes.byteLength > config.maxFileBytes) throw new Error(`El archivo supera el límite de ${config.maxFileBytes} bytes.`);

  const digest = sha256(bytes);
  const fileName = safeFileName(input.fileName);
  const mimeType = input.mimeType?.trim() || "application/octet-stream";
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("La fecha del archivo no es válida.");
  const storageKey = `${input.companyId}/${occurredAt.getUTCFullYear()}/${String(occurredAt.getUTCMonth() + 1).padStart(2, "0")}/${digest.slice(0, 20)}-${randomUUID().slice(0, 8)}-${fileName}`;
  const { host, canonicalUri, endpoint } = objectParts(config, storageKey);
  const { amzDate, dateStamp } = awsDate(new Date());
  const canonicalHeaders = `content-type:${mimeType}\nhost:${host}\nx-amz-content-sha256:${digest}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, digest].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, dateStamp)).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "X-Amz-Content-Sha256": digest,
      "X-Amz-Date": amzDate,
    },
    body: Buffer.from(bytes),
  });
  if (!response.ok) throw new Error(`R2 rechazó el archivo (${response.status}).`);

  return { storageKey, storageUrl: permanentUrl(config, storageKey), mimeType, fileName, sizeBytes: bytes.byteLength, sha256: digest };
}

/** Genera una URL temporal para un objeto privado; no se guarda en la base. */
export function createR2DownloadUrl(storageKey: string, ttlSeconds?: number): string {
  const config = getConfig();
  const publicUrl = permanentUrl(config, storageKey);
  if (publicUrl) return publicUrl;

  const { host, canonicalUri, endpoint } = objectParts(config, storageKey);
  const { amzDate, dateStamp } = awsDate(new Date());
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const expires = Math.min(604800, Math.max(1, ttlSeconds ?? config.signedUrlTtlSeconds));
  const entries = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "host"],
  ].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = entries.map(([key, value]) => `${encodeQuery(key)}=${encodeQuery(value)}`).join("&");
  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, dateStamp)).update(stringToSign).digest("hex");
  return `${endpoint}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function createR2UploadTarget(input: {
  companyId: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes: number;
}): { uploadUrl: string; downloadUrl: string; storageKey: string; mimeType: string } {
  const config = getConfig();
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > config.maxFileBytes) {
    throw new Error(`Tamaño de archivo inválido o superior al límite de ${config.maxFileBytes} bytes.`);
  }
  const mimeType = (input.mimeType?.trim() || "application/octet-stream").replace(/[\r\n]/g, "");
  const now = new Date();
  const storageKey = `${input.companyId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/out-${randomUUID()}-${safeFileName(input.fileName)}`;
  const { host, canonicalUri, endpoint } = objectParts(config, storageKey);
  const { amzDate, dateStamp } = awsDate(now);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const expires = Math.min(3600, config.signedUrlTtlSeconds);
  const entries = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "content-type;host"],
  ].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = entries.map(([key, value]) => `${encodeQuery(key)}=${encodeQuery(value)}`).join("&");
  const canonicalHeaders = `content-type:${mimeType}\nhost:${host}\n`;
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, "content-type;host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, dateStamp)).update(stringToSign).digest("hex");
  return {
    uploadUrl: `${endpoint}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    downloadUrl: createR2DownloadUrl(storageKey),
    storageKey,
    mimeType,
  };
}
