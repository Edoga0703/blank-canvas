import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/master/billing")({
  beforeLoad: () => { throw redirect({ to: "/master/financeiro" }); },
});
