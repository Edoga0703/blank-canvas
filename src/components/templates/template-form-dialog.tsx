import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveHsmTemplate, type HsmButton, type HsmListItem } from "@/lib/hsm-templates.functions";

const CAT_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

export function TemplateFormDialog({
  open, onOpenChange, initial, instances, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Partial<HsmListItem> | null;
  instances: { id: string; instance_name: string; display_name: string | null; numero: string | null }[];
  onSaved: () => void;
}) {
  const save = useServerFn(saveHsmTemplate);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [categoria, setCategoria] = useState<string>(initial?.categoria ?? "MARKETING");
  const [idioma, setIdioma] = useState(initial?.idioma ?? "pt_BR");
  const [headerTipo, setHeaderTipo] = useState<string>(initial?.header_tipo ?? "NONE");
  const [headerConteudo, setHeaderConteudo] = useState(initial?.header_conteudo ?? "");
  const [corpo, setCorpo] = useState(initial?.corpo ?? "");
  const [rodape, setRodape] = useState(initial?.rodape ?? "");
  const [botoes, setBotoes] = useState<HsmButton[]>((initial?.botoes as HsmButton[]) ?? []);
  const [instanceId, setInstanceId] = useState<string>(initial?.instance_id ?? (instances[0]?.id ?? ""));

  function addBotao() {
    if (botoes.length >= 3) return;
    setBotoes([...botoes, { type: "QUICK_REPLY", texto: "" }]);
  }

  async function submit(sendToMeta: boolean) {
    setSaving(true);
    try {
      await save({ data: {
        id: initial?.id,
        instance_id: instanceId || null,
        nome, categoria, idioma,
        header_tipo: headerTipo,
        header_conteudo: headerTipo === "NONE" ? null : headerConteudo,
        corpo, rodape: rodape || null,
        botoes,
        submitToMeta: sendToMeta,
      } });
      toast.success(sendToMeta ? "Enviado para aprovação" : "Salvo como rascunho");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar Template" : "Novo Template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nome do Template *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value.toLowerCase())} placeholder="ex: confirmacao_pedido" />
            <p className="text-[11px] text-muted-foreground mt-1">Apenas letras minúsculas, números e underscore</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria *</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CAT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Idioma</Label>
              <Select value={idioma} onValueChange={setIdioma}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (BR)</SelectItem>
                  <SelectItem value="en">Inglês</SelectItem>
                  <SelectItem value="es">Espanhol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Tipo de Header</Label>
            <Select value={headerTipo} onValueChange={setHeaderTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Nenhum</SelectItem>
                <SelectItem value="TEXT">Texto</SelectItem>
                <SelectItem value="MEDIA">Mídia</SelectItem>
              </SelectContent>
            </Select>
            {headerTipo === "TEXT" && (
              <Input className="mt-2" value={headerConteudo} onChange={(e) => setHeaderConteudo(e.target.value)} placeholder="Título do header (até 60 caracteres)" maxLength={60} />
            )}
            {headerTipo === "MEDIA" && (
              <Input className="mt-2" value={headerConteudo} onChange={(e) => setHeaderConteudo(e.target.value)} placeholder="URL da imagem/vídeo/documento" />
            )}
          </div>

          <div>
            <Label>Corpo da Mensagem *</Label>
            <Textarea rows={5} value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder="Olá {{1}}! Sua compra no valor de {{2}} foi confirmada." maxLength={1024} />
            <p className="text-[11px] text-muted-foreground mt-1">Use {"{{1}}"}, {"{{2}}"} etc para variáveis. Máximo 1024 caracteres.</p>
          </div>

          <div>
            <Label>Rodapé (opcional)</Label>
            <Input value={rodape} onChange={(e) => setRodape(e.target.value)} placeholder="Texto do rodapé..." maxLength={60} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Botões (até 3)</Label>
              <Button type="button" size="sm" variant="ghost" onClick={addBotao} disabled={botoes.length >= 3}>
                <Plus className="size-3.5 mr-1" /> Adicionar botão
              </Button>
            </div>
            {botoes.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">Nenhum botão adicionado. Botões aparecem abaixo da mensagem.</p>
            )}
            {botoes.map((b, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_auto] gap-2 mt-2 items-center">
                <Select value={b.type} onValueChange={(v: any) => {
                  const copy = [...botoes]; copy[i] = { ...copy[i], type: v }; setBotoes(copy);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUICK_REPLY">Resposta</SelectItem>
                    <SelectItem value="URL">Link</SelectItem>
                    <SelectItem value="PHONE">Telefone</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={b.texto} onChange={(e) => {
                  const copy = [...botoes]; copy[i] = { ...copy[i], texto: e.target.value }; setBotoes(copy);
                }} placeholder="Texto do botão" maxLength={25} />
                <Button type="button" size="icon" variant="ghost" onClick={() => setBotoes(botoes.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <Label>Enviar para Meta API via conexão *</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger><SelectValue placeholder="Selecionar conexão oficial" /></SelectTrigger>
              <SelectContent>
                {instances.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma conexão API Oficial disponível</div>}
                {instances.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.display_name || c.instance_name}{c.numero ? ` · ${c.numero}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              O template será enviado para aprovação no painel da Meta ao salvar.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button variant="secondary" onClick={() => void submit(false)} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin mr-1.5" />} Salvar rascunho
          </Button>
          <Button onClick={() => void submit(true)} disabled={saving || !instanceId}>
            {saving && <Loader2 className="size-4 animate-spin mr-1.5" />} Enviar para Meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
