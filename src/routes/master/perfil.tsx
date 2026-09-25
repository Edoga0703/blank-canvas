import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, X, Save, ShieldCheck, UserRound } from "lucide-react";
import { getSuperAdminEmails, setSuperAdminEmails } from "@/lib/master.functions";
import { supabase } from "@/integrations/supabase/client";
import { brand } from "@/config/brand";
import { toast } from "sonner";

export const Route = createFileRoute("/master/perfil")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Sistema · Perfil` },
      { name: "description", content: "Sua conta master e quem tem acesso ao painel administrativo." },
      { property: "og:title", content: `${brand.name} — Perfil master` },
      { property: "og:description", content: "Gerencie sua conta master e os acessos ao painel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerfilMasterPage,
});

function PerfilMasterPage() {
  return (
    <div className="p-3 sm:p-4 md:p-8 space-y-4 bg-[#f6f7f9] min-h-full">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold">Perfil</h1>
        <p className="text-xs text-muted-foreground">Sua conta e o controle de acesso ao painel master.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 max-w-5xl">
        <MinhaConta />
        <AcessoMaster />
      </div>
    </div>
  );
}

function MinhaConta() {
  const [email, setEmail] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      setEmail(data.user?.email ?? null);
      let n =
        (data.user?.user_metadata as Record<string, string> | undefined)?.nome ??
        (data.user?.user_metadata as Record<string, string> | undefined)?.full_name ??
        null;
      if (uid) {
        const { data: prof } = await supabase.from("profiles").select("nome").eq("user_id", uid).maybeSingle();
        if (prof?.nome) n = prof.nome;
      }
      setNome(n);
      setLoading(false);
    })();
  }, []);


  return (
    <Card className="rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <UserRound className="size-4 text-muted-foreground" />
        <h2 className="font-semibold text-sm">Minha conta</h2>
      </div>
      {loading ? (
        <div className="grid place-items-center py-6"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <span className="text-muted-foreground text-xs">Nome</span>
            <span className="truncate">{nome ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <span className="text-muted-foreground text-xs">E-mail</span>
            <span className="truncate">{email ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <span className="text-muted-foreground text-xs">Papel</span>
            <span className="text-emerald-700 font-medium">Super admin</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function AcessoMaster() {
  const get = useServerFn(getSuperAdminEmails);
  const set = useServerFn(setSuperAdminEmails);
  const [emails, setEmails] = useState<string[]>([]);
  const [novo, setNovo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try { const r = await get(); setEmails(r.emails); }
      catch (e: any) { toast.error(e?.message ?? "Falha ao carregar acessos"); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = novo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast.error("Email inválido");
    if (emails.includes(v)) return toast.message("Já está na lista");
    setEmails([...emails, v]);
    setNovo("");
  }

  async function save() {
    setSaving(true);
    try { await set({ data: { emails } }); toast.success("Salvo"); }
    catch (e: any) { toast.error(e?.message); }
    finally { setSaving(false); }
  }

  return (
    <Card className="rounded-2xl border-[color:var(--hairline)] bg-white shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <h2 className="font-semibold text-sm">Acesso master</h2>
      </div>
      <p className="text-xs text-muted-foreground">E-mails com permissão de super admin no painel.</p>
      <form onSubmit={add} className="flex gap-2">
        <Input placeholder="email@exemplo.com" value={novo} onChange={(e) => setNovo(e.target.value)} />
        <Button type="submit" variant="outline"><Plus className="size-4 mr-1" /> Adicionar</Button>
      </form>
      {loading ? (
        <div className="grid place-items-center py-4"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="space-y-2">
          {emails.length === 0 && <li className="text-sm text-muted-foreground">Nenhum email cadastrado.</li>}
          {emails.map((e) => (
            <li key={e} className="flex items-center justify-between border rounded-md px-3 py-2 bg-card">
              <span className="text-sm truncate">{e}</span>
              <button onClick={() => setEmails(emails.filter((x) => x !== e))} className="text-muted-foreground hover:text-destructive" title="Remover">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />} Salvar
        </Button>
      </div>
    </Card>
  );
}
