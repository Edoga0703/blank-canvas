// src/routes/app/automacoes.tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações & Workflows — Capi Conversa" },
      { name: "description", content: "Crie salesbots e fluxos visuais automáticos multicanal (WhatsApp, Instagram, Telegram e CRM)." },
      { property: "og:title", content: "Automações & Workflows — Capi Conversa" },
      { property: "og:description", content: "Crie salesbots e fluxos visuais automáticos multicanal (WhatsApp, Instagram, Telegram e CRM)." },
      { name: "theme-color", content: "#050505" },
    ],
  }),
  component: () => <Outlet />,
});
