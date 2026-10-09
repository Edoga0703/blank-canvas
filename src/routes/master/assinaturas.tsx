import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/master/assinaturas")({
  beforeLoad: () => { throw redirect({ to: "/master/clientes" }); },
});
