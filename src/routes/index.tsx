import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Página en blanco" },
      { name: "description", content: "Una página en blanco." },
      { property: "og:title", content: "Página en blanco" },
      { property: "og:description", content: "Una página en blanco." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <main className="min-h-screen bg-background" />;
}
