import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFeatureFlags, updateFeatureFlag, type FeatureFlag, type FeatureRollout } from "@/lib/feature-flags.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Globe, FlaskConical, Lock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { invalidateFeatureFlags } from "@/hooks/use-feature-flags";

export const Route = createFileRoute("/master/feature-flags")({
  component: FeatureFlagsPage,
});

const ROLLOUT_META: Record<FeatureRollout, { label: string; icon: any; className: string }> = {
  interno:  { label: "Interno", icon: Lock,         className: "bg-slate-100 text-slate-700 border-slate-200" },
  beta:     { label: "Beta",    icon: FlaskConical, className: "bg-amber-100 text-amber-800 border-amber-200" },
  publico:  { label: "Público", icon: Globe,        className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

type Company = { id: string; nome: string };

function FeatureFlagsPage() {
  const listFn = useServerFn(listFeatureFlags);
  const updateFn = useServerFn(updateFeatureFlag);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [betaOpen, setBetaOpen] = useState<FeatureFlag | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void reload(); void loadCompanies(); }, []);

  async function reload() {
    setLoading(true);
    const data = await listFn();
    setFlags(data);
    setLoading(false);
    invalidateFeatureFlags();
  }

  async function loadCompanies() {
    const { data } = await supabase.from("company").select("id, nome").order("nome");
    setCompanies((data ?? []) as Company[]);
  }

  async function setRollout(flag: FeatureFlag, rollout: FeatureRollout) {
    if (rollout === "beta") { setBetaOpen(flag); return; }
    try {
      await updateFn({ data: { key: flag.key, rollout } });
      toast.success(`${flag.nome} → ${ROLLOUT_META[rollout].label}`);
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? flags.filter((f) => f.nome.toLowerCase().includes(term) || f.key.toLowerCase().includes(term)) : flags;
    const modulos = list.filter((f) => f.categoria === "modulo");
    const subs = list.filter((f) => f.categoria !== "modulo");
    return { modulos, subs };
  }, [flags, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <p className="text-sm text-muted-foreground">Controle interno/beta/público de cada módulo e sub-funcionalidade.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Carregando...</div> : (
        <>
          <Section title="Módulos" flags={filtered.modulos} companies={companies} onSet={setRollout} />
          <Section title="Sub-funcionalidades" flags={filtered.subs} companies={companies} onSet={setRollout} />
        </>
      )}

      <BetaDialog
        flag={betaOpen}
        companies={companies}
        onClose={() => setBetaOpen(null)}
        onSave={async (key, ids) => {
          try {
            await updateFn({ data: { key, rollout: "beta", beta_company_ids: ids } });
            toast.success("Salvo em Beta");
            setBetaOpen(null);
            await reload();
          } catch (e: any) { toast.error(e?.message ?? "Erro"); }
        }}
      />
    </div>
  );
}

function Section({ title, flags, companies, onSet }: {
  title: string; flags: FeatureFlag[]; companies: Company[];
  onSet: (f: FeatureFlag, r: FeatureRollout) => void;
}) {
  if (!flags.length) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
      <div className="rounded-lg border divide-y bg-card">
        {flags.map((f) => {
          const Meta = ROLLOUT_META[f.rollout];
          const Icon = Meta.icon;
          return (
            <div key={f.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{f.nome}</span>
                  <Badge variant="outline" className={`${Meta.className} text-[10.5px]`}>
                    <Icon className="size-3 mr-1" />{Meta.label}
                  </Badge>
                </div>
                <div className="text-[11.5px] text-muted-foreground font-mono">{f.key}</div>
                {f.descricao && <div className="text-xs text-muted-foreground mt-1">{f.descricao}</div>}
                {f.rollout === "beta" && (
                  <div className="text-xs text-amber-700 mt-1">
                    {f.beta_company_ids.length} empresa{f.beta_company_ids.length === 1 ? "" : "s"} em beta
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                {(["interno", "beta", "publico"] as FeatureRollout[]).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={f.rollout === r ? "default" : "outline"}
                    onClick={() => onSet(f, r)}
                  >
                    {ROLLOUT_META[r].label}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BetaDialog({ flag, companies, onClose, onSave }: {
  flag: FeatureFlag | null; companies: Company[];
  onClose: () => void; onSave: (key: string, ids: string[]) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => { setSelected(flag?.beta_company_ids ?? []); setSearch(""); }, [flag]);

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? companies.filter((c) => c.nome.toLowerCase().includes(term)) : companies;
  }, [companies, search]);

  if (!flag) return null;
  return (
    <Dialog open={!!flag} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Beta — {flag.nome}</DialogTitle>
        </DialogHeader>
        <Input placeholder="Buscar empresa..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-72 overflow-y-auto space-y-1 border rounded-md p-2">
          {list.map((c) => {
            const on = selected.includes(c.id);
            return (
              <label key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))}
                />
                <span className="text-sm">{c.nome}</span>
              </label>
            );
          })}
          {!list.length && <div className="text-xs text-muted-foreground p-2">Nenhuma empresa</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(flag.key, selected)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
