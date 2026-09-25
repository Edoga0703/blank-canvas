import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/master/empresas")({
  beforeLoad: () => { throw redirect({ to: "/master/clientes" }); },
});
