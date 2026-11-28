// src/routes/app/automacoes.tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute("/app/automacoes")({
  beforeLoad: ({ context }) => requirePermission(context, "automacoes.manage"),
  head: () => ({
    meta: [
      { title: "Automações & Workflows — Capiconversa" },
      { name: "description", content: "Crie salesbots e fluxos visuais automáticos multicanal (WhatsApp, Instagram, Telegram e CRM)." },
      { property: "og:title", content: "Automações & Workflows — Capiconversa" },
      { property: "og:description", content: "Crie salesbots e fluxos visuais automáticos multicanal (WhatsApp, Instagram, Telegram e CRM)." },
      { name: "theme-color", content: "#050505" },
    ],
  }),
  component: () => <Outlet />,
});
