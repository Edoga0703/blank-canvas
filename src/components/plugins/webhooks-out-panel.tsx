import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Webhook } from "lucide-react";

/** Atalho para a tela de configuração dos webhooks de saída. */
export function WebhooksOutPanel() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Envie eventos do atendimento (mensagens, lead criado, venda ganha, lead perdido, CSAT)
        para Zapier, Make, n8n ou seu próprio servidor.
      </p>
      <Link to="/app/integracoes">
        <Button className="w-full">
          <Webhook className="size-4 mr-2" /> Configurar webhooks
        </Button>
      </Link>
    </div>
  );
}
