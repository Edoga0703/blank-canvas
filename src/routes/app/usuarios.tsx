import { createFileRoute } from "@tanstack/react-router";
import { EquipeTab } from "@/components/config/equipe-tab";
import { brand } from "@/config/brand";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute("/app/usuarios")({
  beforeLoad: ({ context }) => requirePermission(context, "configuracoes.team"),
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
  return <EquipeTab isOwner={role === "owner"} role={role} showHeader />;
}
