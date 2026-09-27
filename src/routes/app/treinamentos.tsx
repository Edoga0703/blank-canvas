import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/treinamentos")({
  head: () => ({
    meta: [
      { title: "Capi Conversa Academy — O Portal da sua Evolução" },
      { name: "description", content: "Centro de treinamentos e vídeo aulas da Capi Conversa Academy." },
      { property: "og:title", content: "Capi Conversa Academy" },
      { property: "og:description", content: "Centro de treinamentos e vídeo aulas da Capi Conversa Academy." },
      { name: "theme-color", content: "#050505" },
    ],
  }),
  component: () => <Outlet />,
});
