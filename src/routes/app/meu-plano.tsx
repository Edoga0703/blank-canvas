import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/route-guards";

// O módulo "Meu plano" agora vive dentro de Configurações → Plano.
// Mantemos a rota antiga funcionando redirecionando para lá.
export const Route = createFileRoute("/app/meu-plano")({
  beforeLoad: ({ context }) => {
    requireAdmin(context);
    throw redirect({ to: "/app/configuracoes" });
  },
  component: () => null,
});
