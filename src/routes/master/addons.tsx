import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAddonsMaster, saveAddon, deleteAddon, type AddonProduct } from "@/lib/addons.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { brand } from "@/config/brand";
import { toast } from "sonner";
import { Plus, Edit3, Loader2, Trash2, Package, PlusSquare } from "lucide-react";

export const Route = createFileRoute("/master/addons")({
  head: () => ({ meta: [{ title: `${brand.name} — Upgrades` }] }),
  component: AddonsPage,
});

const empty: Partial<AddonProduct> = {
  slug: "",
  nome: "",
  descricao: "",
  tipo: "custom",
  preco_cents: 1990,
  moeda: "BRL",
  intervalo: "month",
  checkout_url: "",
  provider: "kiwify",
  external_product_id: "",
  ativo: true,
  ordem: 0,
  concede_usuarios: 0,
  concede_conexoes: 0,
};

function AddonsPage() {
  const list = useServerFn(listAddonsMaster);
  const save = useServerFn(saveAddon);
  const del = useServerFn(deleteAddon);

  const [items, setItems] = useState<AddonProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<AddonProduct> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = await list();
      setItems(rows);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function submit() {
    if (!editing) return;
    setSaving(true);
    try {
      await save({ data: editing as any });
      toast.success("Upgrade salvo");
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este upgrade? Empresas contratantes perdem o vínculo.")) return;
    try {
      await del({ data: { id } });
      toast.success("Upgrade excluído");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Upgrades</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Produtos extras (conexões WhatsApp, integrações) que somam ao plano do cliente.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...empty })}><Plus className="size-4 mr-1.5" /> Novo upgrade</Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <PlusSquare className="size-8 mx-auto mb-3 text-muted-foreground/50" />
          Nenhum upgrade cadastrado.
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <Card key={p.id} className={`p-5 flex flex-col gap-3 relative ${!p.ativo ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{tipoLabel(p.tipo)}</div>
                  <div className="text-lg font-bold truncate">{p.nome}</div>
                  <div className="text-[11px] text-muted-foreground">{p.slug}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {formatBRL(p.preco_cents, p.moeda)}
                    <span className="text-xs text-muted-foreground font-normal">/{p.intervalo === "month" ? "mês" : "ano"}</span>
                  </div>
                </div>
              </div>
              {p.descricao && <p className="text-xs text-muted-foreground line-clamp-2">{p.descricao}</p>}
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                <Package className="size-3 shrink-0" />
                {p.checkout_url ? (
                  <a href={p.checkout_url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                    {p.checkout_url}
                  </a>
                ) : (
                  <span className="text-amber-600">Sem URL de checkout</span>
                )}
              </div>
              {p.external_product_id && (
                <div className="text-[11px] text-muted-foreground">
                  ID <b>{p.provider}</b>: <code>{p.external_product_id}</code>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 mt-auto border-t">
                <div className="flex items-center gap-2">
                  <Switch checked={p.ativo} disabled />
                  <span className="text-xs text-muted-foreground">{p.ativo ? "Ativo" : "Inativo"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(p)}><Edit3 className="size-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(p.id)}><Trash2 className="size-3.5 text-destructive" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{(editing as any)?.id ? "Editar upgrade" : "Novo upgrade"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome"><Input value={editing.nome ?? ""} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} /></Field>
              <Field label="Slug"><Input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="conexao-custom" /></Field>
              <Field label="Descrição" full>
                <Textarea rows={2} value={editing.descricao ?? ""} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} />
              </Field>
              <Field label="Tipo">
                <select className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  value={editing.tipo ?? "custom"}
                  onChange={(e) => setEditing({ ...editing, tipo: e.target.value as any })}>
                  
                  <option value="whatsapp_meta">WhatsApp API Oficial (Meta)</option>
                  <option value="custom">Outro</option>
                </select>
              </Field>
              <Field label="Intervalo">
                <select className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  value={editing.intervalo ?? "month"}
                  onChange={(e) => setEditing({ ...editing, intervalo: e.target.value as any })}>
                  <option value="month">Mensal</option>
                  <option value="year">Anual</option>
                </select>
              </Field>
              <Field label="Preço (centavos)"><Input type="number" value={editing.preco_cents ?? 0} onChange={(e) => setEditing({ ...editing, preco_cents: Number(e.target.value) })} /></Field>
              <Field label="Moeda"><Input value={editing.moeda ?? "BRL"} onChange={(e) => setEditing({ ...editing, moeda: e.target.value.toUpperCase() })} /></Field>
              <Field label="Ordem"><Input type="number" value={editing.ordem ?? 0} onChange={(e) => setEditing({ ...editing, ordem: Number(e.target.value) })} /></Field>
              <Field label="Libera usuários (por unidade)">
                <Input type="number" min={0} value={editing.concede_usuarios ?? 0}
                  onChange={(e) => setEditing({ ...editing, concede_usuarios: Number(e.target.value) })} />
              </Field>
              <Field label="Libera conexões (por unidade)">
                <Input type="number" min={0} value={editing.concede_conexoes ?? 0}
                  onChange={(e) => setEditing({ ...editing, concede_conexoes: Number(e.target.value) })} />
              </Field>
              <Field label="Provider">
                <select className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  value={editing.provider ?? "kiwify"}
                  onChange={(e) => setEditing({ ...editing, provider: e.target.value })}>
                  <option value="kiwify">Kiwify</option>
                  <option value="cakto">Cakto</option>
                  <option value="perfectpay">Perfectpay</option>
                  <option value="abacatepay">Abacate Pay</option>
                </select>
              </Field>
              <Field label="ID do produto no provider" full>
                <Input
                  value={editing.external_product_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, external_product_id: e.target.value })}
                  placeholder="Ex.: abc123 (usado pelo webhook para casar a compra)"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Copie o <b>product_id</b> da oferta no Kiwify/Cakto/Perfectpay. É por ele que o webhook identifica que a compra
                  é deste upgrade e ativa a conexão automaticamente.
                </p>
              </Field>
              <Field label="URL de checkout" full>
                <Input
                  value={editing.checkout_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, checkout_url: e.target.value })}
                  placeholder="https://pay.kiwify.com.br/xxxxxx"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Link para onde o cliente é enviado ao clicar em <b>Contratar</b>. O sistema adiciona o e-mail dele automaticamente.
                </p>
              </Field>
              <div className="col-span-2 flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={!!editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} /> Ativo
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}Salvar
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
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function formatBRL(cents: number, moeda = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(cents / 100);
}
function tipoLabel(t: string) {
  return t === "whatsapp_uazapi" ? "Uazapi"
    : t === "whatsapp_meta" ? "API Oficial Meta"
    : "Custom";
}
