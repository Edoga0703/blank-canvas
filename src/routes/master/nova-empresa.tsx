import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/master/nova-empresa")({
  beforeLoad: () => { throw redirect({ to: "/master/clientes" }); },
});
