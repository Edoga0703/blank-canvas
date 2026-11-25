import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { brand } from "@/config/brand";
import { toast } from "sonner";
import {
  Plus, Edit3, Star, Loader2, Trash2, Package, Infinity as InfinityIcon,
  MessageSquare, ShieldCheck, Instagram, Facebook, Send, Bot, Share2,
  Megaphone, Radar, HardDrive, GraduationCap, Check, Layers,
} from "lucide-react";

export const Route = createFileRoute("/master/planos")({
  head: () => ({ meta: [{ title: `${brand.name} — Planos Multicanal` }] }),
  component: PlanosPage,
});

type Plan = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  moeda: string;
  intervalo: "month" | "year";
  trial_days: number;
  limite_mensagens: number;
  limite_instancias: number;
  limite_usuarios: number;
  limite_contatos: number;
  features: Record<string, boolean> | string[];
  destaque: boolean;
  ativo: boolean;
  ordem: number;
  paddle_product_id: string | null;
  paddle_price_id: string | null;
  checkout_url: string | null;
};

const PLATFORMS = [
  { key: "whatsapp_dapi", label: "WhatsApp QR / D-API", icon: MessageSquare, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { key: "whatsapp_oficial", label: "WhatsApp Meta Cloud Oficial", icon: ShieldCheck, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { key: "instagram", label: "Instagram Direct", icon: Instagram, color: "text-pink-600 bg-pink-50 border-pink-200" },
  { key: "facebook", label: "Facebook Messenger", icon: Facebook, color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  { key: "telegram", label: "Telegram MTProto", icon: Send, color: "text-sky-600 bg-sky-50 border-sky-200" },
  { key: "ia", label: "Agente IA Studio (Gemini)", icon: Bot, color: "text-purple-600 bg-purple-50 border-purple-200" },
  { key: "meta_publicacoes", label: "Publicações & Feed Social", icon: Share2, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { key: "campanhas", label: "Campanhas em Massa", icon: Megaphone, color: "text-orange-600 bg-orange-50 border-orange-200" },
  { key: "radar", label: "Radar de Prospecção B2B", icon: Radar, color: "text-rose-600 bg-rose-50 border-rose-200" },
  { key: "r2_storage", label: "Armazenamento Vault R2", icon: HardDrive, color: "text-cyan-600 bg-cyan-50 border-cyan-200" },
  { key: "treinamentos", label: "Capiversa Academy", icon: GraduationCap, color: "text-teal-600 bg-teal-50 border-teal-200" },
];

const empty: Partial<Plan> = {
  slug: "",
  nome: "",
  descricao: "",
  preco_cents: 9700,
  moeda: "BRL",
  intervalo: "month",
  trial_days: 7,
  limite_mensagens: 2147483647,
  limite_instancias: 1,
  limite_usuarios: 2,
  limite_contatos: 2147483647,
  features: {
    whatsapp_dapi: true,
    whatsapp_oficial: true,
    instagram: true,
    ia: true,
    campanhas: true,
  },
  destaque: false,
  ativo: true,
  ordem: 0,
};

function parseFeatures(raw: any): Record<string, boolean> {
  if (!raw) return { whatsapp_dapi: true, whatsapp_oficial: true, ia: true };
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (Array.isArray(raw)) {
    const obj: Record<string, boolean> = {};
    raw.forEach((k: string) => {
      obj[k] = true;
    });
    return obj;
  }
  return { whatsapp_dapi: true, whatsapp_oficial: true, ia: true };
}

function PlanosPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);
  const [featureMap, setFeatureMap] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("plan").select("*").order("ordem", { ascending: true });
    if (error) toast.error(error.message);
    setPlans((data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing({ ...empty });
    setFeatureMap({
      whatsapp_dapi: true,
      whatsapp_oficial: true,
      instagram: true,
      ia: true,
      campanhas: true,
    });
  }

  function openEdit(p: Plan) {
    setEditing({ ...p });
    setFeatureMap(parseFeatures(p.features));
  }

  function toggleFeature(key: string) {
    setFeatureMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  async function save() {
    if (!editing) return;
    if (!editing.nome?.trim() || !editing.slug?.trim()) {
      return toast.error("Nome e slug são obrigatórios");
    }
    setSaving(true);

    const payload: any = {
      slug: editing.slug!.toLowerCase().trim(),
      nome: editing.nome!.trim(),
      descricao: editing.descricao ?? null,
      preco_cents: Number(editing.preco_cents ?? 0),
      moeda: (editing.moeda ?? "BRL").toUpperCase().trim(),
      intervalo: editing.intervalo ?? "month",
      trial_days: Number(editing.trial_days ?? 0),
      limite_mensagens: 2147483647, // Sempre ilimitadas (sem bloqueio)
      limite_instancias: Math.max(1, Number(editing.limite_instancias ?? 1)),
      limite_usuarios: Math.max(1, Number(editing.limite_usuarios ?? 1)),
      limite_contatos: 2147483647, // Sempre ilimitados (sem bloqueio)
      features: featureMap,
      destaque: !!editing.destaque,
      ativo: !!editing.ativo,
      ordem: Number(editing.ordem ?? 0),
      paddle_product_id: editing.paddle_product_id ?? null,
      paddle_price_id: editing.paddle_price_id ?? null,
      checkout_url: (editing.checkout_url ?? "").trim() || null,
    };

    const op = (editing as any).id
      ? supabase.from("plan").update(payload).eq("id", (editing as any).id)
      : supabase.from("plan").insert(payload);

    const { error } = await op;
    setSaving(false);
    if (error) return toast.error(error.message);

    toast.success("Plano salvo com sucesso");
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este plano? Empresas vinculadas perderão o vínculo com este plano.")) return;
    const { error } = await supabase.from("plan").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plano excluído");
    load();
  }

  async function toggleAtivo(p: Plan) {
    const { error } = await supabase.from("plan").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Planos Multicanal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo omnicanal com gestão de conexões (WhatsApp, Instagram, Telegram) e mensagens 100% ilimitadas.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4 mr-1.5" /> Novo plano
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : plans.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum plano cadastrado.</Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((p) => {
            const pFeatures = parseFeatures(p.features);
            const activePlatforms = PLATFORMS.filter((plat) => pFeatures[plat.key]);

            return (
              <Card
                key={p.id}
                className={`p-5 flex flex-col gap-4 relative transition-all duration-200 rounded-2xl border ${
                  p.destaque ? "border-primary/50 shadow-md ring-1 ring-primary/20" : ""
                } ${!p.ativo ? "opacity-60" : ""}`}
              >
                {p.destaque && (
                  <div className="absolute -top-2.5 right-4 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                    <Star className="size-3 fill-current" /> Destaque
                  </div>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                      {p.slug}
                    </div>
                    <div className="text-lg font-bold truncate text-foreground">{p.nome}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-foreground">
                      {formatBRL(p.preco_cents, p.moeda)}
                      <span className="text-xs text-muted-foreground font-normal">
                        /{p.intervalo === "month" ? "mês" : "ano"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-medium">
                      {p.trial_days > 0 ? `${p.trial_days}d trial grátis` : "Sem trial"}
                    </div>
                  </div>
                </div>

                {p.descricao && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{p.descricao}</p>
                )}

                {/* Métricas e limites operacionais */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-xl border border-border/50">
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <Layers className="size-3 text-primary" /> Conexões
                    </div>
                    <div className="font-semibold text-foreground">
                      {p.limite_instancias} {p.limite_instancias === 1 ? "canal" : "canais"}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <InfinityIcon className="size-3 text-emerald-600" /> Mensagens
                    </div>
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                      Ilimitadas
                    </div>
                  </div>

                  <div className="space-y-0.5 pt-1 border-t border-border/40">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Usuários / Equipe</div>
                    <div className="font-semibold text-foreground">{p.limite_usuarios} membros</div>
                  </div>

                  <div className="space-y-0.5 pt-1 border-t border-border/40">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <InfinityIcon className="size-3 text-emerald-600" /> Contatos / Leads
                    </div>
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                      Ilimitados
                    </div>
                  </div>
                </div>

                {/* Badges de canais e plataformas ativas */}
                <div className="space-y-1.5">
                  <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wider">
                    Plataformas & Módulos
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activePlatforms.length > 0 ? (
                      activePlatforms.map((plat) => {
                        const Icon = plat.icon;
                        return (
                          <span
                            key={plat.key}
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${plat.color}`}
                          >
                            <Icon className="size-3" />
                            {plat.label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">Canais básicos padrão</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 mt-auto border-t">
                  <div className="flex items-center gap-2">
                    <Switch checked={p.ativo} onCheckedChange={() => toggleAtivo(p)} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {p.ativo ? "Plano Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Edit3 className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p.id)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {p.checkout_url ? (
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 -mt-1 truncate">
                    <Package className="size-3 shrink-0 text-emerald-600" />
                    <a href={p.checkout_url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                      {p.checkout_url}
                    </a>
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-600 flex items-center gap-1.5 -mt-1">
                    <Package className="size-3" /> Sem URL de checkout externa
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Diálogo de Edição / Criação de Plano */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{(editing as any)?.id ? "Editar Plano Multicanal" : "Novo Plano Multicanal"}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nome do Plano">
                  <Input
                    value={editing.nome ?? ""}
                    onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                    placeholder="Ex: Capi PRO Multicanal"
                  />
                </Field>

                <Field label="Slug (Identificador Único)">
                  <Input
                    value={editing.slug ?? ""}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                    placeholder="ex: pro-multicanal"
                  />
                </Field>

                <Field label="Descrição" full>
                  <Textarea
                    rows={2}
                    value={editing.descricao ?? ""}
                    onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                    placeholder="Descrição para a tela de planos e checkout..."
                  />
                </Field>

                <Field label="Preço (em centavos: 19700 = R$ 197,00)">
                  <Input
                    type="number"
                    value={editing.preco_cents ?? 0}
                    onChange={(e) => setEditing({ ...editing, preco_cents: Number(e.target.value) })}
                  />
                </Field>

                <Field label="Moeda">
                  <Input
                    value={editing.moeda ?? "BRL"}
                    onChange={(e) => setEditing({ ...editing, moeda: e.target.value.toUpperCase() })}
                  />
                </Field>

                <Field label="Intervalo de Cobrança">
                  <select
                    className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                    value={editing.intervalo ?? "month"}
                    onChange={(e) => setEditing({ ...editing, intervalo: e.target.value as any })}
                  >
                    <option value="month">Mensal</option>
                    <option value="year">Anual</option>
                  </select>
                </Field>

                <Field label="Dias de Trial Grátis">
                  <Input
                    type="number"
                    value={editing.trial_days ?? 0}
                    onChange={(e) => setEditing({ ...editing, trial_days: Number(e.target.value) })}
                  />
                </Field>

                <Field label="Ordem de Exibição">
                  <Input
                    type="number"
                    value={editing.ordem ?? 0}
                    onChange={(e) => setEditing({ ...editing, ordem: Number(e.target.value) })}
                  />
                </Field>

                {/* Conexões Multicanal */}
                <Field label="Conexões Multicanal Disponíveis">
                  <Input
                    type="number"
                    min={1}
                    value={editing.limite_instancias ?? 1}
                    onChange={(e) => setEditing({ ...editing, limite_instancias: Number(e.target.value) })}
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Quantidade de canais (WhatsApp QR, Meta Oficial, Instagram, Telegram) que o cliente pode conectar.
                  </p>
                </Field>

                {/* Mensagens Mensais - Sempre Ilimitadas */}
                <Field label="Limite de Mensagens">
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
                    <InfinityIcon className="size-4 text-emerald-600 shrink-0" />
                    <span>Ilimitadas — Sem bloqueio de envio</span>
                  </div>
                </Field>

                <Field label="Limite de Usuários (Equipe)">
                  <Input
                    type="number"
                    min={1}
                    value={editing.limite_usuarios ?? 1}
                    onChange={(e) => setEditing({ ...editing, limite_usuarios: Number(e.target.value) })}
                  />
                </Field>

                <Field label="Limite de Contatos / Leads">
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                    <InfinityIcon className="size-4 shrink-0" />
                    Ilimitados em todos os planos
                  </div>
                </Field>
              </div>

              {/* Toggles de Módulos e Plataformas Incluídas */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Plataformas e Módulos Habilitados neste Plano
                </Label>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {PLATFORMS.map((plat) => {
                    const isChecked = !!featureMap[plat.key];
                    const Icon = plat.icon;
                    return (
                      <div
                        key={plat.key}
                        onClick={() => toggleFeature(plat.key)}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isChecked
                            ? "bg-primary/5 border-primary/40 shadow-sm"
                            : "bg-background border-border/70 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`size-4 ${plat.color.split(" ")[0]}`} />
                          <span className="text-xs font-semibold text-foreground">{plat.label}</span>
                        </div>
                        <div
                          className={`size-5 rounded-md flex items-center justify-center border transition-colors ${
                            isChecked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                          }`}
                        >
                          {isChecked && <Check className="size-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Field label="URL de Checkout Externo (Kiwify / Cakto / PerfectPay)" full>
                <Input
                  value={editing.checkout_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, checkout_url: e.target.value })}
                  placeholder="https://pay.kiwify.com.br/abc123"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Link para onde o cliente é enviado ao assinar. O sistema anexa o e-mail dele automaticamente para liberação via webhook.
                </p>
              </Field>

              <div className="flex items-center gap-6 pt-2 border-t">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch checked={!!editing.destaque} onCheckedChange={(v) => setEditing({ ...editing, destaque: v })} />
                  <span className="font-semibold">Destacar na tela de planos (Mais Popular)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch checked={!!editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} />
                  <span className="font-semibold">Plano Ativo</span>
                </label>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              Salvar Plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2" : ""}`}>
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function formatBRL(cents: number, moeda = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format((cents || 0) / 100);
}
