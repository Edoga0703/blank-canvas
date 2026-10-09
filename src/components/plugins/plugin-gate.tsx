import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCapacidades } from "@/hooks/use-capacidades";

/**
 * Bloqueia módulos que vêm de plugin. Se a capacidade não estiver instalada,
 * mostra o convite para a Loja de Plugins em vez da página.
 */
export function PluginGate({
  capacidade,
  nome,
  descricao,
  children,
}: {
  capacidade: string;
  nome: string;
  descricao?: string;
  children: ReactNode;
}) {
  const { capacidades, carregando } = useCapacidades();
  if (carregando) return <>{children}</>;
  if (capacidades.includes(capacidade)) return <>{children}</>;

  return (
    <div className="flex-1 grid place-items-center p-6">
      <div className="max-w-md w-full text-center rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mx-auto size-12 grid place-items-center rounded-xl bg-primary/10 text-primary">
          <Puzzle className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{nome} não está instalado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {descricao ?? "Este módulo é um plugin. Instale na Loja de Plugins para liberar o acesso."}
        </p>
        <Button asChild className="mt-5">
          <Link to="/app/plugins">Abrir Loja de Plugins</Link>
        </Button>
      </div>
    </div>
  );
}
