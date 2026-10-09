import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { registerSale, updateSale } from "@/lib/comercial.functions";
import { listProdutos, type Produto } from "@/lib/produtos.functions";
import { CANAIS_MANUAIS, CANAL_LABEL } from "@/lib/tracking-utils";

export type VendaRow = {
  id?: string;
  contato_nome?: string | null;
  contato_numero?: string | null;
  descricao?: string | null;
  valor_cents?: number | null;
  vendido_em?: string | null;
  owner_id?: string | null;
  metodo_pagamento?: string | null;
  canal?: string | null;
  item_id?: string | null;
  item_nome?: string | null;
  item_tipo?: string | null;
};

const PAGAMENTOS = ["Pix", "Cartão de crédito", "Cartão de débito", "Boleto", "Dinheiro", "Transferência", "Outro"];

function toDateInput(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function VendaDialog({
  open,
  onOpenChange,
  venda,
  members,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  venda?: VendaRow | null;
  members: Array<{ user_id: string; nome: string }>;
  onSaved: () => void;
}) {
  const create = useServerFn(registerSale);
  const update = useServerFn(updateSale);
  const listItems = useServerFn(listProdutos);

  const isEdit = !!venda?.id;
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [itemId, setItemId] = useState<string>("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(toDateInput());
  const [ownerId, setOwnerId] = useState<string>("");
  const [pagamento, setPagamento] = useState("Pix");
  const [descricao, setDescricao] = useState("");
  const [canal, setCanal] = useState("manual");

  useEffect(() => {
    if (!open) return;
    listItems().then((r) => setProdutos(r as Produto[])).catch(() => setProdutos([]));
    setNome(venda?.contato_nome ?? "");
    setNumero(venda?.contato_numero ?? "");
    setItemId(venda?.item_id ?? "");
    setValor(venda?.valor_cents != null ? String((venda.valor_cents / 100).toFixed(2)).replace(".", ",") : "");
    setData(toDateInput(venda?.vendido_em));
    setOwnerId(venda?.owner_id ?? "");
    setPagamento(venda?.metodo_pagamento ?? "Pix");
    setDescricao(venda?.descricao ?? "");
    setCanal(venda?.canal || "manual");
  }, [open, venda?.id]);

  const selectedItem = useMemo(() => produtos.find((p) => p.id === itemId), [produtos, itemId]);

  function pickItem(id: string) {
    setItemId(id);
    const p = produtos.find((x) => x.id === id);
    if (p && (!valor || Number(valor.replace(/\./g, "").replace(",", ".")) === 0)) {
      setValor(String(Number(p.preco || 0).toFixed(2)).replace(".", ","));
    }
  }

  async function submit() {
    const cents = Math.round(Number(String(valor).replace(/\./g, "").replace(",", ".")) * 100);
    if (!nome.trim()) return toast.error("Informe o nome do cliente");
    if (!cents || cents <= 0) return toast.error("Informe um valor válido");
    if (!isEdit && numero.replace(/\D/g, "").length < 8) return toast.error("Informe o WhatsApp do cliente");

    setSaving(true);
    try {
      const itemFields = selectedItem
        ? { item_id: selectedItem.id, item_nome: selectedItem.nome, item_tipo: ((selectedItem.tipo as any) === "servico" ? "servico" : "produto") as "produto" | "servico" }
        : { item_id: undefined, item_nome: undefined, item_tipo: undefined };

      if (isEdit) {
        await update({ data: {
          id: venda!.id!,
          contato_nome: nome,
          descricao: descricao || null,
          valor_cents: cents,
          vendido_em: new Date(`${data}T12:00:00`).toISOString(),
          owner_id: ownerId || null,
          metodo_pagamento: pagamento,
          canal: canal || "manual",
          item_id: itemFields.item_id ?? null,
          item_nome: itemFields.item_nome ?? null,
          item_tipo: itemFields.item_tipo ?? null,
        } });
        toast.success("Venda atualizada");
      } else {
        await create({ data: {
          contato_nome: nome,
          contato_numero: numero,
          descricao: descricao || undefined,
          valor_cents: cents,
          vendido_em: new Date(`${data}T12:00:00`).toISOString(),
          owner_id: ownerId || undefined,
          canal: canal || "manual",
          metodo_pagamento: pagamento,
          ...itemFields,
        } });
        toast.success("Venda registrada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar venda");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar venda" : "Registrar venda"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cliente *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div>
              <Label>WhatsApp {isEdit ? "" : "*"}</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} disabled={isEdit} placeholder="5511999999999" inputMode="numeric" />
            </div>
          </div>

          <div>
            <Label>Item do catálogo</Label>
            <Select value={itemId || "none"} onValueChange={(v) => pickItem(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione um produto ou serviço" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem item vinculado</SelectItem>
                {produtos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome} — {Number(p.preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1.500,00" inputMode="decimal" />
            </div>
            <div>
              <Label>Data da venda</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vendedor</Label>
              <Select value={ownerId || "none"} onValueChange={(v) => setOwnerId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não atribuído</SelectItem>
                  {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pagamento</Label>
              <Select value={pagamento} onValueChange={setPagamento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGAMENTOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Canal (origem da venda)</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Cadastro manual</SelectItem>
                {CANAIS_MANUAIS.map((c) => (
                  <SelectItem key={c} value={c}>{CANAL_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes da negociação..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin mr-2" />}
            {isEdit ? "Salvar alterações" : "Registrar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
