import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Facebook, Instagram, Loader2, AlertTriangle, Plug } from "lucide-react";
import { toast } from "sonner";
import { startMetaOAuth } from "@/lib/meta-oauth.functions";

type Mode = "facebook" | "instagram";

/**
 * Fluxo de conexão dos canais Meta no estilo "escolha o caminho + passo a passo".
 * - Facebook: vai direto para o passo a passo e inicia o login.
 * - Instagram Business: primeiro pergunta se conecta via Facebook ou direto pelo Instagram.
 */
export function MetaConnectDialog({
  open, mode, onOpenChange,
}: {
  open: boolean;
  mode: Mode;
  onOpenChange: (v: boolean) => void;
}) {
  const startOAuth = useServerFn(startMetaOAuth);
  const [step, setStep] = useState<"choice" | "steps">("steps");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setStep(mode === "instagram" ? "choice" : "steps");
  }, [open, mode]);

  async function handleContinue() {
    setLoading(true);
    try {
      const r: any = await startOAuth({ data: { origin: window.location.origin } } as any);
      if (!r?.ok || !r.authUrl) {
        toast.error(r?.error || "Não foi possível iniciar o login da Meta.");
        return;
      }
      window.location.href = r.authUrl;
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível iniciar o login da Meta.");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "instagram" ? "Instagram Business" : "Facebook (Messenger)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === "choice" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-primary">Como você deseja conectar o Instagram Business?</DialogTitle>
              <DialogDescription>Escolha abaixo a melhor forma de integrar sua conta.</DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 p-3 text-sm">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>Apenas contas comerciais ou de criadores de conteúdo são compatíveis. Não é possível integrar contas pessoais.</span>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setStep("steps")}
                className="w-full text-left flex items-start gap-3 rounded-xl border p-3 hover:bg-muted/40 transition-colors"
              >
                <span className="size-9 rounded-full bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                  <Facebook className="size-4 text-[#1877F2]" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-sm">Integrar via Facebook</span>
                  <span className="block text-xs text-muted-foreground">Conecte uma conta do Instagram vinculada a uma Página do Facebook.</span>
                  <span className="block text-xs font-medium mt-0.5">Recomendado para contas com alto volume de dados.</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStep("steps")}
                className="w-full text-left flex items-start gap-3 rounded-xl border p-3 hover:bg-muted/40 transition-colors"
              >
                <span className="size-9 rounded-full bg-[#E4405F]/10 flex items-center justify-center shrink-0">
                  <Instagram className="size-4 text-[#E4405F]" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-sm">Integrar via Instagram Direct</span>
                  <span className="block text-xs text-muted-foreground">Conecte sua conta profissional do Instagram via Meta OAuth oficial.</span>
                  <span className="block text-xs font-medium mt-0.5">Recomendado para contas comerciais e criadores.</span>
                </span>
              </button>
            </div>

            <div className="flex justify-start">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-primary">Passo a passo de integração</DialogTitle>
              <DialogDescription>Siga os passos abaixo para que a integração de {title} funcione corretamente:</DialogDescription>
            </DialogHeader>

            <ol className="rounded-xl bg-primary/5 p-4 space-y-3 text-sm">
              {[
                <>Acesse o Facebook com a conta que gerencia a página que você deseja integrar.</>,
                <>Na janela que será exibida, clique em <strong>“Editar configurações anteriores”</strong>.</>,
                <>Em todas as telas de permissão, selecione a opção <strong>“Aceitar em todas as páginas atuais e futuras”</strong>.</>,
              ].map((txt, i) => (
                <li key={i} className="flex gap-3">
                  <span className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-foreground/80">{txt}</span>
                </li>
              ))}
            </ol>

            <p className="text-xs text-muted-foreground">
              Em caso de dúvida, entre em contato com o suporte pelo chat do sistema.
            </p>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => (mode === "instagram" ? setStep("choice") : onOpenChange(false))}
              >
                Voltar
              </Button>
              <Button onClick={handleContinue} disabled={loading}>
                {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plug className="size-4 mr-2" />}
                Continuar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
