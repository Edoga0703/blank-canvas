/**
 * Puente reservado para el código que Lovable genere al vincular el conector
 * oficial de WhatsApp Business al proyecto publicado.
 *
 * No inventamos llamadas privadas al gateway. Cuando la conexión esté ligada,
 * se reemplazan únicamente estos cuerpos con las funciones generadas por
 * Lovable y se conserva el contrato interno de Capiversa.
 */

export class LovableWhatsAppNotLinkedError extends Error {
  constructor() {
    super(
      "WhatsApp Business todavía no está vinculado a este proyecto de Lovable. " +
        "Conecta WhatsApp Business en Lovable y genera el receptor y las acciones de envío.",
    );
    this.name = "LovableWhatsAppNotLinkedError";
  }
}

export class LovableWhatsAppWebhookAuthError extends Error {
  constructor(message = "La autenticación del webhook de Lovable no es válida.") {
    super(message);
    this.name = "LovableWhatsAppWebhookAuthError";
  }
}

export class LovableWhatsAppWebhookPayloadError extends Error {
  constructor(message = "El evento de Lovable WhatsApp no es válido.") {
    super(message);
    this.name = "LovableWhatsAppWebhookPayloadError";
  }
}

export type GeneratedWebhookEnvelope = {
  externalEventId: string;
  externalConnectionId?: string | null;
  raw: unknown;
};

/** Lovable debe verificar la firma real antes de devolver el evento. */
export async function generatedVerifyAndParseWebhook(
  _request: Request,
  _rawBody: string,
): Promise<GeneratedWebhookEnvelope> {
  throw new LovableWhatsAppNotLinkedError();
}

export type GeneratedSendResult = {
  messageId: string;
  raw?: unknown;
};

export async function generatedSendText(_input: {
  to: string;
  text: string;
  replyToMessageId?: string | null;
}): Promise<GeneratedSendResult> {
  throw new LovableWhatsAppNotLinkedError();
}

export async function generatedSendMedia(_input: {
  to: string;
  type: "image" | "audio" | "video" | "document";
  mediaUrl: string;
  mimeType?: string | null;
  fileName?: string | null;
  caption?: string | null;
}): Promise<GeneratedSendResult> {
  throw new LovableWhatsAppNotLinkedError();
}

export async function generatedSendTemplate(_input: {
  to: string;
  name: string;
  language: string;
  components?: unknown[];
}): Promise<GeneratedSendResult> {
  throw new LovableWhatsAppNotLinkedError();
}

export async function generatedNormalizeEvent(_raw: unknown): Promise<unknown[]> {
  throw new LovableWhatsAppNotLinkedError();
}

export async function generatedDownloadMedia(_input: {
  externalId?: string | null;
  providerUrl?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<{
  bytes: Uint8Array | ArrayBuffer;
  mimeType?: string | null;
  fileName?: string | null;
}> {
  throw new LovableWhatsAppNotLinkedError();
}
