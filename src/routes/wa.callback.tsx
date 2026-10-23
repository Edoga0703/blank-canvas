import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listWhatsappInstances } from "@/lib/evolution.functions";

export const Route = createFileRoute("/wa/callback")({
  head: () => ({
    meta: [
      { title: "Conexão concluída · Capi Conversa" },
      { name: "description", content: "Retorno do onboarding WhatsApp Oficial." },
    ],
  }),
  component: WaCallback,
});

function WaCallback() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [nome, setNome] = useState<string | null>(null);
  const [tentativas, setTentativas] = useState(0);
  const parado = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function tick(n: number) {
      if (parado.current) return;
      try {
        const res = await listWhatsappInstances();
        const oficial = (res.instances as any[]).find(
          (i) => i.provider === "dapi_official" || i.provider_type === "dapi_official" || i.provider === "dapi",
        );
        if (oficial && oficial.status === "connected") {
          setNome(oficial.display_name || oficial.numero || "WhatsApp Oficial");
          setPronto(true);
          setTimeout(() => void navigate({ to: "/app/conexao" }), 2500);
          return;
        }
      } catch {}
      setTentativas(n + 1);
      if (n < 40) timer = setTimeout(() => void tick(n + 1), 3000);
    }
    void tick(0);
    return () => {
      parado.current = true;
      clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 p-6">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        <div
          className={`mx-auto size-14 rounded-full grid place-items-center ${
            pronto ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"
          }`}
        >
          {pronto ? <CheckCircle2 className="size-8" /> : <Loader2 className="size-8 animate-spin" />}
        </div>
        <h1 className="text-xl font-semibold">
          {pronto ? "Conexão concluída!" : "Conexão em processamento"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pronto
            ? `${nome} já está conectado. Estamos te levando para a lista de Conexões…`
            : "Recebemos o retorno da Meta. Assim que a confirmação chegar (geralmente em segundos), sua nova conexão aparece aqui automaticamente."}
        </p>
        {!pronto && tentativas > 20 && (
          <p className="text-xs text-muted-foreground">
            Está demorando mais que o normal. Você pode voltar e conferir depois — o processo continua.
          </p>
        )}
        <Button asChild className="w-full" variant={pronto ? "default" : "outline"}>
          <Link to="/app/conexao">Voltar para Conexões</Link>
        </Button>
      </Card>
    </div>
  );
}
