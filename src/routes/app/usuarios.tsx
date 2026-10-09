import { createFileRoute, Navigate } from "@tanstack/react-router";
import { EquipeTab } from "@/components/config/equipe-tab";
import { brand } from "@/config/brand";

export const Route = createFileRoute("/app/usuarios")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Usuários` },
      { name: "description", content: "Gerencie usuários, funções e permissões da sua equipe." },
    ],
  }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const ctx = Route.useRouteContext();
  const role = (ctx as any).membership?.role;
  // Acesso liberado para atendentes verem a equipe
  return <EquipeTab isOwner={role === "owner"} role={role} showHeader />;
}
