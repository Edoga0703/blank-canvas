import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { toast } from "sonner";
import { Loader2, Save, Target, TrendingUp } from "lucide-react";

type MemberGoal = {
  user_id: string;
  nome: string;
  avatar_url: string | null;
  valor_meta: number;
  meta_id?: string;
};

export function MetasPanel({ isOwner }: { isOwner: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<MemberGoal[]>([]);
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const loadMetas = async () => {
    setLoading(true);
    try {
      const { data: companyData } = await supabase.from("company_user").select("company_id").limit(1).maybeSingle();
      if (!companyData) return;
      const companyId = companyData.company_id;

      const [{ data: team }, { data: metas }] = await Promise.all([
        supabase.from("company_user").select("user_id, profiles(nome, avatar_url)").eq("company_id", companyId).eq("ativo", true),
        supabase.from("crm_goals" as any).select("*").eq("company_id", companyId).eq("year_month", currentMonth),
      ]);

      const metasMap = new Map((metas ?? []).map((m: any) => [m.user_id, m]));
      
      const list = (team ?? []).map((t: any) => {
        const profile = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
        const meta = metasMap.get(t.user_id);
        return {
          user_id: t.user_id,
          nome: profile?.nome || "Atendente",
          avatar_url: profile?.avatar_url || null,
          valor_meta: meta ? Number(meta.value_cents) / 100 : 0,
          meta_id: meta?.id,
        };
      });

      setMembers(list);
    } catch (e: any) {
      toast.error("Erro ao carregar metas: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetas();
  }, []);

  const saveMetas = async () => {
    setSaving(true);
    try {
      const { data: companyData } = await supabase.from("company_user").select("company_id").limit(1).maybeSingle();
      if (!companyData) return;
      const companyId = companyData.company_id;

      const upserts = members.map(m => ({
        company_id: companyId,
        user_id: m.user_id,
        year_month: currentMonth,
        value_cents: Math.round(m.valor_meta * 100),
      }));

      const { error } = await supabase.from("crm_goals" as any).upsert(upserts, { onConflict: "company_id,user_id,year_month" });
      if (error) throw error;
      toast.success("Metas salvas com sucesso!");
    } catch (e: any) {
      toast.error("Erro ao salvar metas: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const totalEmpresa = members.reduce((sum, m) => sum + m.valor_meta, 0);

  if (loading) return <div className="p-12 text-center"><Loader2 className="size-8 animate-spin mx-auto text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 bg-primary/5 p-4 rounded-xl border border-primary/10">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Target className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Meta Geral da Empresa</h3>
            <p className="text-sm text-muted-foreground">Soma das metas individuais dos atendentes para {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-primary">
            {totalEmpresa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <Badge variant="outline" className="mt-1 font-bold">Meta Consolidada</Badge>
        </div>
      </div>

      <Card className="divide-y divide-border/50">
        <div className="p-4 bg-muted/30 font-bold text-sm flex items-center gap-2">
          <TrendingUp className="size-4" /> Metas Individuais
        </div>
        {members.map((m, idx) => (
          <div key={m.user_id} className="p-4 flex items-center gap-4 hover:bg-muted/10 transition-colors">
            <InitialsAvatar name={m.nome} size={40} />
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{m.nome}</div>
              <div className="text-xs text-muted-foreground">ID: {m.user_id.slice(0,8)}</div>
            </div>
            <div className="w-40">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block text-right">Valor da Meta</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <Input
                  className="pl-8 text-right font-bold"
                  type="number"
                  value={m.valor_meta || ""}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMembers(prev => prev.map((it, i) => i === idx ? { ...it, valor_meta: val } : it));
                  }}
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
        ))}
      </Card>

      <div className="flex justify-end pt-2">
        <Button size="lg" className="rounded-xl px-8 font-bold" onClick={saveMetas} disabled={saving}>
          {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
          Salvar Metas do Mês
        </Button>
      </div>
    </div>
  );
}
