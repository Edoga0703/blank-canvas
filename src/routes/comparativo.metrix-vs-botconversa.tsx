import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/comparativo/metrix-vs-botconversa")({
  beforeLoad: () => {
    throw redirect({
      to: "/comparativo/capiversa-vs-botconversa",
      statusCode: 301,
    });
  },
});
