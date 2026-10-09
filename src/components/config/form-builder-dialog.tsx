import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, GripVertical, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { saveLeadForm, leadFormOptions } from "@/lib/lead-forms.functions";
import {
  DEFAULT_FIELDS,
  DEFAULT_THEME,
  slugifyForm,
  type FormField,
  type FormFieldType,
  type FormTheme,
  type LeadFormRow,
} from "@/lib/lead-forms-types";

const TIPOS: { v: FormFieldType; l: string }[] = [
  { v: "texto", l: "Texto" },
  { v: "email", l: "E-mail" },
  { v: "telefone", l: "Telefone/WhatsApp" },
  { v: "numero", l: "Número" },
  { v: "data", l: "Data" },
  { v: "select", l: "Lista de opções" },
  { v: "textarea", l: "Texto longo" },
  { v: "checkbox", l: "Aceite" },
];

type Draft = Partial<LeadFormRow>;

export function FormBuilderDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: LeadFormRow | null;
  onSaved: () => void;
}) {
  const save = useServerFn(saveLeadForm);
  const loadOpts = useServerFn(leadFormOptions);
  const [opts, setOpts] = useState<{ pipelines: any[]; stages: any[]; team: any[] }>({ pipelines: [], stages: [], team: [] });
  const [saving, setSaving] = useState(false);
  const [d, setD] = useState<Draft>({});

  useEffect(() => {
    if (!open) return;
    setD(
      initial
        ? { ...initial, theme: { ...DEFAULT_THEME, ...(initial.theme ?? {}) }, campos: initial.campos?.length ? initial.campos : DEFAULT_FIELDS }
        : { nome: "", slug: "", ativo: true, owner_mode: "fila", pos_envio: "mensagem", theme: { ...DEFAULT_THEME }, campos: [...DEFAULT_FIELDS], mensagem_sucesso: "Recebemos seus dados. Em breve entraremos em contato!", tags: [] },
    );
    loadOpts().then((r: any) => setOpts(r)).catch(() => {});
  }, [open, initial]);

  const theme = (d.theme ?? DEFAULT_THEME) as FormTheme;
  const campos = (d.campos ?? []) as FormField[];
  const setTheme = (patch: Partial<FormTheme>) => setD((p) => ({ ...p, theme: { ...theme, ...patch } }));
  const setCampos = (c: FormField[]) => setD((p) => ({ ...p, campos: c }));

  function addCampo() {
    setCampos([
      ...campos,
      { id: `c${Date.now().toString(36)}`, tipo: "texto", label: "Novo campo", obrigatorio: false, mapeia: null },
    ]);
  }
  function move(i: number, dir: -1 | 1) {
    const arr = [...campos];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setCampos(arr);
  }

  const stagesOfPipe = opts.stages.filter((s) => s.pipeline_id === d.pipeline_id);

  async function handleSave() {
    if (!campos.some((c) => c.mapeia === "numero")) {
      toast.error("Inclua um campo de WhatsApp (mapeado como telefone do lead).");
      return;
    }
    setSaving(true);
    try {
      await save({ data: d as any });
      toast.success("Formulário salvo");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const origin = "https://metrixcrm.com.br";
  const slugPreview = slugifyForm(d.slug || d.nome || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar formulário" : "Novo formulário"}</DialogTitle>
        </DialogHeader>

        <div className="grid lg:grid-cols-[1fr_360px] gap-4 overflow-hidden flex-1 min-h-0">
          <div className="overflow-y-auto pr-1 min-h-0">
            <Tabs defaultValue="campos">
              <TabsList className="w-full justify-start overflow-x-auto no-scrollbar flex-nowrap">
                <TabsTrigger value="campos">Campos</TabsTrigger>
                <TabsTrigger value="aparencia">Aparência</TabsTrigger>
                <TabsTrigger value="destino">Destino</TabsTrigger>
                <TabsTrigger value="pos">Pós-envio</TabsTrigger>
              </TabsList>

              <TabsContent value="campos" className="space-y-3 mt-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Nome interno</Label>
                    <Input value={d.nome ?? ""} onChange={(e) => setD((p) => ({ ...p, nome: e.target.value }))} placeholder="Campanha Black Friday" />
                  </div>
                  <div>
                    <Label>Link público</Label>
                    <Input value={d.slug ?? ""} onChange={(e) => setD((p) => ({ ...p, slug: e.target.value }))} placeholder="black-friday" />
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">{origin}/f/{slugPreview || "..."}</p>
                  </div>
                </div>

                {campos.map((c, i) => (
                  <div key={c.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="size-4 text-muted-foreground shrink-0" />
                      <Input
                        className="h-8"
                        value={c.label}
                        onChange={(e) => setCampos(campos.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCampos(campos.filter((_, j) => j !== i))}>
                        <Trash2 className="size-3.5 text-red-600" />
                      </Button>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <Select value={c.tipo} onValueChange={(v) => setCampos(campos.map((x, j) => (j === i ? { ...x, tipo: v as FormFieldType } : x)))}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select
                        value={c.mapeia ?? "nenhum"}
                        onValueChange={(v) => setCampos(campos.map((x, j) => (j === i ? { ...x, mapeia: v === "nenhum" ? null : (v as any) } : x)))}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Campo extra</SelectItem>
                          <SelectItem value="nome">Nome do lead</SelectItem>
                          <SelectItem value="numero">WhatsApp do lead</SelectItem>
                          <SelectItem value="email">E-mail do lead</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch checked={c.obrigatorio} onCheckedChange={(v) => setCampos(campos.map((x, j) => (j === i ? { ...x, obrigatorio: v } : x)))} />
                        Obrigatório
                      </label>
                    </div>
                    <Input
                      className="h-8"
                      placeholder="Dica dentro do campo (opcional)"
                      value={c.placeholder ?? ""}
                      onChange={(e) => setCampos(campos.map((x, j) => (j === i ? { ...x, placeholder: e.target.value } : x)))}
                    />
                    {c.tipo === "select" && (
                      <Input
                        className="h-8"
                        placeholder="Opções separadas por vírgula"
                        value={(c.opcoes ?? []).join(", ")}
                        onChange={(e) =>
                          setCampos(campos.map((x, j) => (j === i ? { ...x, opcoes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)))
                        }
                      />
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addCampo}><Plus className="size-4 mr-1" /> Adicionar campo</Button>
              </TabsContent>

              <TabsContent value="aparencia" className="space-y-3 mt-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Layout</Label>
                    <Select value={theme.layout} onValueChange={(v) => setTheme({ layout: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="centralizado">Centralizado</SelectItem>
                        <SelectItem value="dividido">Dividido (duas colunas)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cantos</Label>
                    <Select value={theme.arredondamento} onValueChange={(v) => setTheme({ arredondamento: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suave">Suave</SelectItem>
                        <SelectItem value="medio">Médio</SelectItem>
                        <SelectItem value="pill">Bem arredondado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cor principal</Label>
                    <Input type="color" value={theme.corPrimaria} onChange={(e) => setTheme({ corPrimaria: e.target.value })} className="h-10 p-1" />
                  </div>
                  <div>
                    <Label>Cor de fundo</Label>
                    <Input type="color" value={theme.corFundo} onChange={(e) => setTheme({ corFundo: e.target.value })} className="h-10 p-1" />
                  </div>
                </div>
                <div>
                  <Label>Logo (URL da imagem)</Label>
                  <Input value={theme.logoUrl ?? ""} onChange={(e) => setTheme({ logoUrl: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <Label>Imagem de fundo (URL, opcional)</Label>
                  <Input value={theme.imagemFundo ?? ""} onChange={(e) => setTheme({ imagemFundo: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <Label>Título</Label>
                  <Input value={theme.titulo} onChange={(e) => setTheme({ titulo: e.target.value })} />
                </div>
                <div>
                  <Label>Subtítulo</Label>
                  <Textarea rows={2} value={theme.subtitulo ?? ""} onChange={(e) => setTheme({ subtitulo: e.target.value })} />
                </div>
                <div>
                  <Label>Benefícios (um por linha)</Label>
                  <Textarea
                    rows={3}
                    value={(theme.bullets ?? []).join("\n")}
                    onChange={(e) => setTheme({ bullets: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Texto do botão</Label>
                    <Input value={theme.textoBotao} onChange={(e) => setTheme({ textoBotao: e.target.value })} />
                  </div>
                  <div>
                    <Label>Rodapé</Label>
                    <Input value={theme.rodape ?? ""} onChange={(e) => setTheme({ rodape: e.target.value })} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="destino" className="space-y-3 mt-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Funil</Label>
                    <Select value={d.pipeline_id ?? ""} onValueChange={(v) => setD((p) => ({ ...p, pipeline_id: v, stage_id: null }))}>
                      <SelectTrigger><SelectValue placeholder="Funil padrão" /></SelectTrigger>
                      <SelectContent>{opts.pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Etapa</Label>
                    <Select value={d.stage_id ?? ""} onValueChange={(v) => setD((p) => ({ ...p, stage_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Primeira etapa" /></SelectTrigger>
                      <SelectContent>{stagesOfPipe.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Responsável</Label>
                    <Select value={d.owner_mode ?? "fila"} onValueChange={(v) => setD((p) => ({ ...p, owner_mode: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fila">Fila de distribuição</SelectItem>
                        <SelectItem value="fixo">Pessoa fixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {d.owner_mode === "fixo" && (
                    <div>
                      <Label>Quem recebe</Label>
                      <Select value={d.owner_id ?? ""} onValueChange={(v) => setD((p) => ({ ...p, owner_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{opts.team.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.nome ?? u.user_id}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Valor padrão da oportunidade</Label>
                    <Input
                      type="number"
                      value={d.valor_padrao ?? ""}
                      onChange={(e) => setD((p) => ({ ...p, valor_padrao: e.target.value ? Number(e.target.value) : null }))}
                    />
                  </div>
                  <div>
                    <Label>Tags (separadas por vírgula)</Label>
                    <Input
                      value={(d.tags ?? []).join(", ")}
                      onChange={(e) => setD((p) => ({ ...p, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="pos" className="space-y-3 mt-4">
                <div>
                  <Label>Ao enviar</Label>
                  <Select value={d.pos_envio ?? "mensagem"} onValueChange={(v) => setD((p) => ({ ...p, pos_envio: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensagem">Mostrar mensagem de agradecimento</SelectItem>
                      <SelectItem value="redirect">Redirecionar para uma página</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {d.pos_envio === "redirect" ? (
                  <div>
                    <Label>URL de destino</Label>
                    <Input value={d.redirect_url ?? ""} onChange={(e) => setD((p) => ({ ...p, redirect_url: e.target.value }))} placeholder="https://seusite.com/obrigado" />
                  </div>
                ) : (
                  <div>
                    <Label>Mensagem de agradecimento</Label>
                    <Textarea rows={2} value={d.mensagem_sucesso ?? ""} onChange={(e) => setD((p) => ({ ...p, mensagem_sucesso: e.target.value }))} />
                  </div>
                )}
                <div className="rounded-lg border p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Switch checked={!!d.wa_auto_enviar} onCheckedChange={(v) => setD((p) => ({ ...p, wa_auto_enviar: v }))} />
                    Enviar WhatsApp automático para o lead
                  </label>
                  {d.wa_auto_enviar && (
                    <Textarea
                      rows={3}
                      value={d.wa_mensagem ?? ""}
                      onChange={(e) => setD((p) => ({ ...p, wa_mensagem: e.target.value }))}
                      placeholder="Olá {{nome}}, recebemos seu contato e já vamos te atender!"
                    />
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={d.ativo ?? true} onCheckedChange={(v) => setD((p) => ({ ...p, ativo: v }))} />
                  Formulário ativo
                </label>
              </TabsContent>
            </Tabs>
          </div>

          <div className="hidden lg:block overflow-y-auto rounded-xl border bg-muted/30 p-3 min-h-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2"><Eye className="size-3.5" /> Pré-visualização</div>
            <Preview theme={theme} campos={campos} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />} Salvar formulário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RADIUS: Record<string, string> = { suave: "0.5rem", medio: "1rem", pill: "1.75rem" };

function Preview({ theme, campos }: { theme: FormTheme; campos: FormField[] }) {
  const radius = RADIUS[theme.arredondamento] ?? RADIUS.medio;
  return (
    <div
      className="rounded-xl p-4"
      style={
        theme.imagemFundo
          ? { backgroundImage: `url(${theme.imagemFundo})`, backgroundSize: "cover" }
          : { background: theme.corFundo }
      }
    >
      <div className="bg-white shadow p-4" style={{ borderRadius: radius, color: theme.corTexto }}>
        {theme.logoUrl && <img src={theme.logoUrl} alt="" className="h-7 mb-3 object-contain" />}
        <div className="font-bold text-base leading-tight">{theme.titulo}</div>
        {theme.subtitulo && <div className="text-[11px] opacity-70 mt-1">{theme.subtitulo}</div>}
        <div className="space-y-2 mt-3">
          {campos.map((c) => (
            <div key={c.id}>
              <div className="text-[10px] font-semibold opacity-70">{c.label}</div>
              <div className="h-8 border border-slate-200 bg-slate-50" style={{ borderRadius: radius }} />
            </div>
          ))}
        </div>
        <div
          className="mt-3 h-9 grid place-items-center text-white text-xs font-semibold"
          style={{ background: theme.corPrimaria, borderRadius: radius }}
        >
          {theme.textoBotao}
        </div>
        {theme.rodape && <div className="text-[9px] text-center opacity-60 mt-2">{theme.rodape}</div>}
      </div>
    </div>
  );
}
