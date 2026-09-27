import { createFileRoute } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import { DashboardGrid } from "@/components/dashboard-v2/DashboardGrid";
import { AnnouncementManager } from "@/components/announcement-manager";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: `${brand.name} — Painel` }, { name: "description", content: "Indicadores de atendimento e vendas do Capi Conversa." }, { property: "og:title", content: "Painel | Capi Conversa" }, { property: "og:description", content: "Indicadores de atendimento e vendas do Capi Conversa." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

function Dashboard() {
  const ctx = Route.useRouteContext();

  return (
    <div className="space-y-6">
      <AnnouncementManager />

      <DashboardGrid workspaceId={ctx.company?.id ?? null} operationalMode={ctx.company?.atendimento_operacional === true} />
    </div>
  );
}
