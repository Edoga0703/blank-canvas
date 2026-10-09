import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/drive/return")({
  ssr: false,
  component: OAuthReturn,
  head: () => ({
    meta: [
      { title: "Conectando Google Drive | Capi Conversa" },
      { name: "description", content: "Finalizando a conexão da sua conta do Google Drive com o Capi Conversa." },
      { property: "og:title", content: "Conectando Google Drive | Capi Conversa" },
      { property: "og:description", content: "Finalizando a conexão da sua conta do Google Drive com o Capi Conversa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finalizando conexão…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_drive", code: code ?? null },
        window.location.origin,
      );
      window.close();
    };
    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "A autorização não foi concluída.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("A autorização terminou sem código de troca.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return <main className="grid min-h-screen place-items-center p-6 text-sm text-muted-foreground">{message}</main>;
}
