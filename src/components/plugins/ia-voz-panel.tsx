import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AudioLines } from "lucide-react";

/** Explica onde usar a transcrição de áudio por IA. */
export function IaVozPanel() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Com o plugin instalado, todo <b>áudio recebido ou enviado</b> na conversa ganha o botão
        <b> Transcrever</b>: a IA escreve em texto o que foi dito, ideal para equipes que atendem
        muitos áudios por dia.
      </p>
      <Link to="/app/conversas" search={{ n: undefined }}>
        <Button className="w-full">
          <AudioLines className="size-4 mr-2" /> Abrir Conversas
        </Button>
      </Link>
    </div>
  );
}
