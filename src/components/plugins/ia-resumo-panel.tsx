import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

/** Explica onde usar o resumo automático de conversa. */
export function IaResumoPanel() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Com o plugin instalado, cada conversa ganha o botão de <b>resumo por IA</b> (✨) no topo:
        em segundos a equipe vê o que o cliente quer, o que já foi tratado e o próximo passo sugerido.
      </p>
      <Link to="/app/conversas" search={{ n: undefined }}>
        <Button className="w-full">
          <Sparkles className="size-4 mr-2" /> Abrir Conversas
        </Button>
      </Link>
    </div>
  );
}
