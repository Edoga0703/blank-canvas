import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brand } from "@/config/brand";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  getAdminCrmStatus,
  createAdminWorkspace,
  saveAdminAutomation,
  runAdminAutomationsNow,
  type AdminCrmStatus,
} from "@/lib/admin-crm.functions";
import { ConnectionHeader } from "@/components/master/crm-admin/connection-header";
import { OverviewTab } from "@/components/master/crm-admin/overview-tab";
import { BaseTab } from "@/components/master/crm-admin/base-tab";
import { AutomacoesTab } from "@/components/master/crm-admin/automacoes-tab";
import { DisparosTab } from "@/components/master/crm-admin/disparos-tab";
import { HistoricoTab } from "@/components/master/crm-admin/historico-tab";

export const Route = createFileRoute("/master/crm-admin")({
  head: () => ({
    meta: [
      { title: `${brand.name} — CRM Admin` },
      { name: "description", content: "Relacionamento com a base de clientes da plataforma." },
    ],
  }),
  component: CrmAdminPage,
});

function CrmAdminPage() {
  const fetchStatus = useServerFn(getAdminCrmStatus);
  const createWs = useServerFn(createAdminWorkspace);
  const saveAuto = useServerFn(saveAdminAutomation);
  const runNow = useServerFn(runAdminAutomationsNow);

  const [data, setData] = useState<AdminCrmStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      setData(await fetchStatus());
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const temConexao = !!data.workspace?.conexao;

  return (
    <div className="max-w-[1200px] mx-auto p-4 sm:p-6 space-y-5">
      <header>
        <h1 className="text-xl font-semibold">CRM Admin</h1>
        <p className="text-sm text-muted-foreground">
          Prospecção e relacionamento com a própria base, usando o WhatsApp comercial do Capi Conversa. Só o
          super admin enxerga.
        </p>
      </header>

      <ConnectionHeader
        workspace={data.workspace}
        busy={busy}
        onCreate={() => act("ws", () => createWs(), "Espaço interno criado")}
      />

      <Tabs defaultValue="visao">
        <TabsList className="flex-wrap">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="base">Base de clientes</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="disparos">Disparos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="mt-4">
          <OverviewTab status={data} />
        </TabsContent>

        <TabsContent value="base" className="mt-4">
          <BaseTab workspace={data.workspace} />
        </TabsContent>

        <TabsContent value="automacoes" className="mt-4">
          <AutomacoesTab
            automacoes={data.automacoes}
            temConexao={temConexao}
            busy={busy}
            onSave={(key, patch, ok) => void act(key, () => saveAuto({ data: patch }), ok)}
            onRun={() => void act("run", () => runNow(), "Gatilhos processados")}
          />
        </TabsContent>

        <TabsContent value="disparos" className="mt-4">
          <DisparosTab temConexao={temConexao} onDone={() => void load()} />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <HistoricoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
