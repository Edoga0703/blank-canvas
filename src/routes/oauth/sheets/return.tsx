import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/sheets/return")({
  ssr: false,
  component: OAuthReturn,
  head: () => ({
    meta: [
      { title: "Conectando Google Sheets | Metrix CRM" },
      { name: "description", content: "Finalizando a conexão da sua conta do Google Sheets com o Metrix CRM." },
      { property: "og:title", content: "Conectando Google Sheets | Metrix CRM" },
      { property: "og:description", content: "Finalizando a conexão da sua conta do Google Sheets com o Metrix CRM." },
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
        { type, connectorId: "google_sheets", code: code ?? null },
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
