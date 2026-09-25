import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { Loader2, MessageSquareText } from "lucide-react";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { brand } from "@/config/brand";

export function RoutePendingComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="size-12 rounded-xl grid place-items-center bg-gradient-brand text-primary-foreground shadow-md">
          <MessageSquareText className="size-6" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Carregando {brand.name}…</span>
        </div>
      </div>
    </div>
  );
}

function normalizeRouteError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.trim()) return new Error(error);
  if (error && typeof error === "object") {
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error("Falha inesperada ao carregar a página");
    }
  }
  return new Error("Falha inesperada ao carregar a página");
}

export function RouteErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const normalizedError = normalizeRouteError(error);
  console.error(normalizedError);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(normalizedError, {
      boundary: "tanstack_default_error_component",
      original_error_type: error === null ? "null" : typeof error,
    });
  }, [error, normalizedError.message]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tente novamente ou volte para a home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Precisa de ajuda? Faça login e abra um chamado no chat de suporte dentro do sistema.
        </p>
      </div>
    </div>
  );
}
