import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { AuthShell } from "@/components/auth-shell";
import { Loader2, Mail } from "lucide-react";

export const Route = createFileRoute("/esqueci-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: `${brand.name} — Recuperar senha` }] }),
  component: Page,
});

function Page() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-senha`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success("Enviamos um link se este e-mail existir.");
  }

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Informe seu e-mail e enviaremos um link para redefinir sua senha."
      footer={
        <Link to="/entrar" className="text-[#0A0A0F]/60 hover:text-[#0B22FE] hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-[#0B22FE]/20 bg-[#0B22FE]/5 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0B22FE] text-white grid place-items-center shrink-0">
            <Mail className="w-4 h-4" />
          </div>
          <div className="text-sm">
            <div className="font-bold">Verifique sua caixa de entrada</div>
            <div className="text-[#0A0A0F]/70 mt-0.5">
              Enviamos o link para <span className="font-semibold">{email}</span>. Não recebeu? Confira o spam.
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@empresa.com"
              autoComplete="email"
              className="h-11"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#0B22FE] hover:bg-[#0918cc] text-white font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…
              </>
            ) : (
              "Enviar link de recuperação"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
