export type WhatsappConnectionStatus = "connected" | "connecting" | "disconnected";

export const WHATSAPP_RECOVERY_GRACE_MS = 10 * 60 * 1000;
export const WHATSAPP_RECOVERY_RETRY_MS = 2 * 60 * 1000;

const PERMANENT_DISCONNECT_REASONS = new Set([200, 401, 402, 403, 406]);

export function normalizeEvolutionState(state: string | null | undefined): WhatsappConnectionStatus | null {
  const s = String(state || "").toLowerCase().trim();
  if (["open", "connected"].includes(s)) return "connected";
  if (["connecting", "qr", "pairing"].includes(s)) return "connecting";
  if (["close", "closed", "disconnected", "logout", "loggedout"].includes(s)) return "disconnected";
  return null;
}

export function normalizeStatusReason(reason: unknown): number | null {
  if (typeof reason === "number" && Number.isFinite(reason)) return reason;
  if (typeof reason === "string" && reason.trim()) {
    const parsed = Number(reason.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isPermanentDisconnectReason(reasonCode: number | null | undefined) {
  return typeof reasonCode === "number" && PERMANENT_DISCONNECT_REASONS.has(reasonCode);
}

export function hasPermanentInstanceIssue(instance: any): boolean {
  const connectionStatus = String(instance?.connectionStatus ?? instance?.instance?.state ?? instance?.state ?? "").toLowerCase();
  const disconnectedAt = Date.parse(instance?.disconnectionAt ?? instance?.instance?.disconnectionAt ?? "");
  const updatedAt = Date.parse(instance?.updatedAt ?? instance?.instance?.updatedAt ?? "");
  if (connectionStatus === "open" && (!disconnectedAt || !updatedAt || updatedAt > disconnectedAt)) {
    return false;
  }
  const reason = normalizeStatusReason(
    instance?.disconnectionReasonCode ??
    instance?.instance?.disconnectionReasonCode ??
    instance?.disconnection?.reasonCode,
  );
  const details = JSON.stringify(
    instance?.disconnectionObject ??
    instance?.instance?.disconnectionObject ??
    instance?.disconnection ??
    {},
  ).toLowerCase();
  return isPermanentDisconnectReason(reason) && /device_removed|logged\s*out|logout|unauthorized|conflict|stream errored/.test(details);
}

export function isWithinRecoveryGrace(lastStateAt?: string | null, now = Date.now()) {
  const time = lastStateAt ? Date.parse(lastStateAt) : 0;
  return time > 0 && now - time < WHATSAPP_RECOVERY_GRACE_MS;
}

export function shouldRetryRecovery(lastStateAt?: string | null, now = Date.now()) {
  const time = lastStateAt ? Date.parse(lastStateAt) : 0;
  return !time || now - time >= WHATSAPP_RECOVERY_RETRY_MS;
}

export function statusAfterRecoveryPolicy(args: {
  rawStatus: WhatsappConnectionStatus;
  previousStatus?: string | null;
  reasonCode?: number | null;
  lastStateAt?: string | null;
  now?: number;
}): WhatsappConnectionStatus {
  const now = args.now ?? Date.now();
  if (args.rawStatus !== "disconnected") return args.rawStatus;
  if (isPermanentDisconnectReason(args.reasonCode)) return "disconnected";
  if (args.previousStatus === "connected") return "connecting";
  if (args.previousStatus === "connecting" && isWithinRecoveryGrace(args.lastStateAt, now)) return "connecting";
  return "disconnected";
}

export function canAttemptSilentRecovery(args: {
  rawStatus: WhatsappConnectionStatus | null;
  previousStatus?: string | null;
  reasonCode?: number | null;
  lastStateAt?: string | null;
  now?: number;
}) {
  if (args.rawStatus !== "disconnected") return false;
  if (isPermanentDisconnectReason(args.reasonCode)) return false;
  // Uma sessão em pareamento não pode ser reiniciada automaticamente: na
  // Uazapi isso troca as chaves e invalida o QR já exibido ao usuário.
  return args.previousStatus === "connected";
}