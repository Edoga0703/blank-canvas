/**
 * D-API Connect Client (Oficial WhatsApp API SaaS via Meta Embedded Signup)
 * Protocolo de janela hospedada D-API com suporte nativo a Coexistência (WhatsApp Business App).
 */

export const DEFAULT_DAPI_PUBLISHABLE_KEY = "pk_live_d9dc49boZsfVWh_G8lhymuQgGNQurJ4deRjS1i";
export const DAPI_CONNECT_ORIGIN = "https://connect.d-api.cloud";

export interface DapiConnectResult {
  connectionId: string;
  phoneNumber?: string | null;
  status: string;
  accessToken?: string;
  accessTokenKind?: "permanent" | "long_lived" | "short_lived" | "unknown";
  accessTokenLabel?: string;
  accessTokenExpiresAt?: string | null;
  wabaId?: string;
  phoneNumberId?: string;
}

export interface DapiConnectOptions {
  publishableKey?: string;
  mode?: "coexistence" | "standard";
  webhookUrl?: string;
  metadata?: Record<string, any>;
}

export function openDapiOfficialPopup(options: DapiConnectOptions = {}): Promise<DapiConnectResult> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Conexão via Popup só pode ser executada no navegador."));
  }

  const pk =
    options.publishableKey?.trim() ||
    (import.meta.env.VITE_DAPI_PUBLISHABLE_KEY as string | undefined)?.trim() ||
    DEFAULT_DAPI_PUBLISHABLE_KEY;

  const origin = DAPI_CONNECT_ORIGIN;
  const popup = window.open(`${origin}/connect`, "dapi-connect", "width=600,height=760");

  if (!popup) {
    return Promise.reject(
      new Error("Popup bloqueado pelo navegador. Por favor, permita popups neste site para abrir o login da Meta.")
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", handleMessage);
      window.clearInterval(pollTimer);
    };

    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== popup) return;
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "dapi-connect-ready") {
        popup.postMessage(
          {
            type: "dapi-connect-init",
            pk,
            mode: options.mode ?? "coexistence",
            webhookUrl: options.webhookUrl,
            webhookMode: "normalized",
            metadata: options.metadata,
          },
          origin
        );
      } else if (msg.type === "dapi-connect-result") {
        cleanup();
        try {
          popup.close();
        } catch {}
        if (msg.ok && msg.data) {
          resolve(msg.data as DapiConnectResult);
        } else {
          reject(new Error(msg.error || "Onboarding da Meta / D-API não foi concluído."));
        }
      }
    };

    const pollTimer = window.setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error("Conexão cancelada (janela fechada antes de concluir)."));
      }
    }, 500);

    window.addEventListener("message", handleMessage);
  });
}
