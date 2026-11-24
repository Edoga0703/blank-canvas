// src/lib/automations/http-security.server.ts
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^[?::1]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\.google\.internal$/i,
];

export function assertSafeWebhookUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("URL de webhook inválida.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Por segurança, apenas URLs HTTPS são permitidas em webhooks de saída.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credenciais embutidas na URL não são permitidas; use cabeçalhos.");
  }
  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_HOST_PATTERNS.some((rx) => rx.test(host))) {
    throw new Error(`Destino bloqueado por política anti-SSRF: ${host}`);
  }
  return parsed;
}

const SENSITIVE_HEADER_KEYS = /authorization|api[-_]?key|token|secret|cookie|password/i;

export function redactHeadersForLog(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    safe[k] = SENSITIVE_HEADER_KEYS.test(k) ? "***REDACTED***" : String(v).slice(0, 120);
  }
  return safe;
}
