import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/master/cadastros")({
  beforeLoad: () => { throw redirect({ to: "/master/clientes" }); },
});
