import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/master/cobrancas")({
  beforeLoad: () => {
    throw redirect({ to: "/master/financeiro" });
  },
});
