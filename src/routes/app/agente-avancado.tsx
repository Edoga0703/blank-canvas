import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  id: z.string().optional(),
});

// A página legada de edição avançada foi unificada diretamente dentro do Agente Studio (/app/agente).
// Redireciona automaticamente preservando o ID do agente e abrindo a aba 'avancado'.
export const Route = createFileRoute("/app/agente-avancado")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/app/agente",
      search: {
        id: search?.id,
        tab: "avancado",
      },
    });
  },
  component: () => null,
});
