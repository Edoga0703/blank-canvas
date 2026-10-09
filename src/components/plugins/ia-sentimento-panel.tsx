import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Gauge } from "lucide-react";

/** Explica onde usar a análise de sentimento. */
export function IaSentimentoPanel() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Com o plugin instalado, cada conversa ganha o botão de <b>análise de sentimento</b> no topo:
        a IA lê o histórico e mostra se o cliente está satisfeito, neutro ou insatisfeito, com nota,
        alerta de risco e os trechos que justificam.
      </p>
      <Link to="/app/conversas" search={{ n: undefined }}>
        <Button className="w-full">
          <Gauge className="size-4 mr-2" /> Abrir Conversas
        </Button>
      </Link>
    </div>
  );
}
