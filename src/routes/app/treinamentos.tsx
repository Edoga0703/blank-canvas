import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/treinamentos")({
  head: () => ({
    meta: [
      { title: "Capiconversa Academy — O Portal da sua Evolução" },
      { name: "description", content: "Centro de treinamentos e vídeo aulas do Capiconversa Academy." },
      { property: "og:title", content: "Capiconversa Academy" },
      { property: "og:description", content: "Centro de treinamentos e vídeo aulas do Capiconversa Academy." },
      { name: "theme-color", content: "#050505" },
    ],
  }),
  component: () => <Outlet />,
});
