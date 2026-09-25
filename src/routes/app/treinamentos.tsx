import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/treinamentos")({
  head: () => ({
    meta: [
      { title: "Metrix Academy — O Portal da sua Evolução" },
      { name: "description", content: "Centro de treinamentos e vídeo aulas da Metrix Academy." },
      { property: "og:title", content: "Metrix Academy" },
      { property: "og:description", content: "Centro de treinamentos e vídeo aulas da Metrix Academy." },
      { name: "theme-color", content: "#050505" },
    ],
  }),
  component: () => <Outlet />,
});
