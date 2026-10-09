import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { ClientesLista } from "@/components/master/clientes-lista";
import { NovaEmpresaForm } from "@/components/master/nova-empresa-form";

export const Route = createFileRoute("/master/clientes")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Clientes` },
      { name: "description", content: "Gestão unificada de clientes: cadastro, assinatura, acesso e cobrança." },
      { property: "og:title", content: `${brand.name} — Clientes` },
      { property: "og:description", content: "Gestão unificada de clientes do painel master." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  const [novaOpen, setNovaOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] leading-tight tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastro, assinatura e acesso em um único lugar.</p>
        </div>
        <Button onClick={() => setNovaOpen(true)}>
          <Plus className="size-4 mr-1.5" /> Nova empresa
        </Button>
      </div>

      <ClientesLista />

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova empresa</DialogTitle>
            <DialogDescription>
              Cria a empresa, o usuário responsável e libera o plano com período de teste.
            </DialogDescription>
          </DialogHeader>
          <NovaEmpresaForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}
