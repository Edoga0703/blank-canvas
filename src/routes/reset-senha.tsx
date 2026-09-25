import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { AuthShell, PasswordField } from "@/components/auth-shell";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: `${brand.name} — Definir nova senha` }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [show, setShow] = useState(false);
  const [show2, setShow2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) return toast.error("Senha precisa ter pelo menos 6 caracteres.");
    if (pwd !== pwd2) return toast.error("As senhas não conferem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada!");
    navigate({ to: "/app/dashboard", replace: true });
  }

  return (
    <AuthShell
      title="Definir nova senha"
      subtitle={ready ? "Escolha uma senha forte para proteger sua conta." : "Validando link de recuperação…"}
      footer={
        <Link to="/entrar" className="text-[#0A0A0F]/60 hover:text-[#0B22FE] hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <PasswordField
          id="pwd"
          label="Nova senha"
          value={pwd}
          onChange={setPwd}
          show={show}
          toggle={() => setShow((s) => !s)}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
          disabled={!ready}
        />
        <PasswordField
          id="pwd2"
          label="Confirmar senha"
          value={pwd2}
          onChange={setPwd2}
          show={show2}
          toggle={() => setShow2((s) => !s)}
          placeholder="Repita a senha"
          autoComplete="new-password"
          disabled={!ready}
        />
        <Button
          type="submit"
          disabled={loading || !ready}
          className="w-full h-11 bg-[#0B22FE] hover:bg-[#0918cc] text-white font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…
            </>
          ) : (
            "Atualizar senha"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
