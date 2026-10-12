import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, AlertTriangle, CheckCircle2, Plus, Trash2, Upload, Eye, EyeOff, Copy,
  Settings as SettingsIcon, Sparkles, Key, Save, Power, ShieldCheck,
} from "lucide-react";

import {
  listAllAnnouncements, createAnnouncement, deleteAnnouncement,
  updateAnnouncement, setAnnouncementActive,
} from "@/lib/announcements.functions";
import { getGlobalAiConfig, saveGlobalAiConfig, testGlobalAiConfig } from "@/lib/master.functions";
import { brand } from "@/config/brand";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

import { OpenAiSpendPanel } from "@/components/master/openai-spend-panel";

export const Route = createFileRoute("/master/sistema")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Sistema · Master` },
      { name: "description", content: "Configuração de IA global e avisos exibidos aos clientes." },
    ],
  }),
  component: SistemaPage,
});

function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[24px] font-semibold tracking-tight leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

function annStatus(a: any): { label: string; cls: string } {
  const expired = a.expires_at && new Date(a.expires_at).getTime() <= Date.now();
  if (!a.is_active) return { label: "Inativo", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  if (expired) return { label: "Expirado", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "No ar", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function SistemaPage() {
  const loadAnnouncements = useServerFn(listAllAnnouncements);
  const saveAnnouncement = useServerFn(createAnnouncement);
  const removeAnnouncement = useServerFn(deleteAnnouncement);
  const editAnnouncement = useServerFn(updateAnnouncement);
  const toggleAnnouncement = useServerFn(setAnnouncementActive);
  const loadGlobalAi = useServerFn(getGlobalAiConfig);
  const saveGlobalAi = useServerFn(saveGlobalAiConfig);
  const testAi = useServerFn(testGlobalAiConfig);

  const loc = useLocation();
  const search = loc.search as Record<string, unknown> | undefined;
  const activeTab = search?.v === "popups" ? "popups" : "ia";

  const [announcements, setAnnouncements] = useState<any[] | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [globalAi, setGlobalAi] = useState({
    openai_api_key: "",
    anthropic_api_key: "",
    ai_provider: "openai",
    ai_model: "gpt-4o-mini",
  });
  const [savedKeys, setSavedKeys] = useState({ openai: false, anthropic: false });
  const [testing, setTesting] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showKeys, setShowKeys] = useState({ openai: false, anthropic: false });

  async function copyKey(key: string, provider: string) {
    try {
      await navigator.clipboard.writeText(key);
      toast.success(`Chave ${provider} copiada`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  const [newAnn, setNewAnn] = useState({
    title: "", content: "", image_url: "", button_text: "", button_link: "", size: "md" as any,
    display_time_seconds: 10, expires_at: ""
  });

  async function refreshAnnouncements() {
    try {
      const ann = await loadAnnouncements();
      setAnnouncements(ann);
    } catch (e: any) {
      setAnnouncements([]);
      toast.error(e?.message ?? "Erro ao carregar avisos");
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive || !session) return;
      void refreshAnnouncements();
      void loadGlobalAi().then((cfg: any) => {
        if (!cfg || !alive) return;
        setGlobalAi((prev) => ({ ...prev, ...cfg }));
        setSavedKeys({
          openai: !!cfg.openai_api_key,
          anthropic: !!cfg.anthropic_api_key,
        });
      }).catch(() => {});
    })();
    return () => { alive = false; };
  }, []);

  async function handleAdd() {
    if (!newAnn.title) return toast.error("Título é obrigatório");
    try {
      if (editingId) {
        await editAnnouncement({
          data: {
            id: editingId,
            ...newAnn,
            expires_at: newAnn.expires_at ? new Date(newAnn.expires_at).toISOString() : null,
          },
        });
        toast.success("Aviso atualizado");
      } else {
        await saveAnnouncement({
          data: {
            ...newAnn,
            expires_at: newAnn.expires_at ? new Date(newAnn.expires_at).toISOString() : null,
          },
        });
        toast.success("Aviso criado com sucesso");
      }
      setIsAddOpen(false);
      setEditingId(null);
      setNewAnn({ title: "", content: "", image_url: "", button_text: "", button_link: "", size: "md", display_time_seconds: 10, expires_at: "" });
      void refreshAnnouncements();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar"); }
  }

  function handleEdit(a: any) {
    setEditingId(a.id);
    setNewAnn({
      title: a.title,
      content: a.content || "",
      image_url: a.image_url || "",
      button_text: a.button_text || "",
      button_link: a.button_link || "",
      size: a.size || "md",
      display_time_seconds: a.display_time_seconds || 10,
      expires_at: a.expires_at ? new Date(a.expires_at).toISOString().split('T')[0] : ""
    });
    setIsAddOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este aviso definitivamente?")) return;
    setBusyId(id);
    try {
      await removeAnnouncement({ data: { id } });
      setAnnouncements((prev) => (prev ?? []).filter((a) => a.id !== id));
      toast.success("Aviso removido");
      void refreshAnnouncements();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível remover"); }
    finally { setBusyId(null); }
  }

  async function handleToggle(a: any) {
    setBusyId(a.id);
    try {
      await toggleAnnouncement({ data: { id: a.id, is_active: !a.is_active } });
      toast.success(a.is_active ? "Aviso desativado" : "Aviso ativado");
      void refreshAnnouncements();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível alterar"); }
    finally { setBusyId(null); }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `announcements/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('public-assets').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: signed, error: signErr } = await supabase.storage
        .from('public-assets')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 5);
      if (signErr) throw signErr;
      setNewAnn({ ...newAnn, image_url: signed.signedUrl });
      toast.success("Imagem enviada!");
    } catch (error: any) {
      toast.error("Erro no upload: " + error.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveAi() {
    setSavingAi(true);
    try {
      await saveGlobalAi({ data: globalAi });
      setSavedKeys({ openai: !!globalAi.openai_api_key, anthropic: !!globalAi.anthropic_api_key });
      toast.success("Configuração de IA salva com sucesso");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally { setSavingAi(false); }
  }

  async function handleTestAi() {
    setTesting(true);
    setTestResult(null);
    try {
      await saveGlobalAi({ data: globalAi });
      const r: any = await testAi();
      setTestResult(r);
      r?.ok ? toast.success("IA respondendo") : toast.error("IA não respondeu");
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message ?? "Erro" });
    } finally {
      setTesting(false);
    }
  }

  if (activeTab === "popups") {
    return (
      <div className="space-y-5 w-full animate-in fade-in duration-200">
        <PageHeader
          title="Popups e avisos"
          description="Avisos globais exibidos no painel dos clientes."
          actions={
            <Dialog open={isAddOpen} onOpenChange={(o) => { setIsAddOpen(o); if (!o) setEditingId(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-lg gap-2"><Plus className="size-4" /> Novo aviso</Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl rounded-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingId ? "Editar aviso" : "Criar novo aviso"}</DialogTitle></DialogHeader>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 py-4">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Título</Label>
                      <Input value={newAnn.title} onChange={e => setNewAnn({ ...newAnn, title: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Conteúdo</Label>
                      <Textarea value={newAnn.content || ''} onChange={e => setNewAnn({ ...newAnn, content: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Imagem</Label>
                        <div className="flex gap-2">
                          <Input value={newAnn.image_url || ''} onChange={e => setNewAnn({ ...newAnn, image_url: e.target.value })} className="flex-1" />
                          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                          <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Tamanho</Label>
                        <Select value={newAnn.size} onValueChange={v => setNewAnn({ ...newAnn, size: v as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sm">Pequeno (380px)</SelectItem>
                            <SelectItem value="md">Médio (560px)</SelectItem>
                            <SelectItem value="lg">Grande (800px)</SelectItem>
                            <SelectItem value="full">Tela cheia</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Duração ({newAnn.display_time_seconds}s)</Label>
                        <Input type="range" min={1} max={60} value={newAnn.display_time_seconds} onChange={e => setNewAnn({ ...newAnn, display_time_seconds: parseInt(e.target.value) })} />
                        <p className="text-[10px] text-muted-foreground">Tempo que o popup fica na tela</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Prazo de expiração</Label>
                        <Input type="date" value={newAnn.expires_at} onChange={e => setNewAnn({ ...newAnn, expires_at: e.target.value })} />
                        <p className="text-[10px] text-muted-foreground">O aviso sai do ar automaticamente após esta data.</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Pré-visualização</Label>
                    <div className="border border-dashed rounded-xl p-4 bg-muted/40 min-h-[200px] flex items-center justify-center">
                      <div className="bg-card rounded-xl border shadow-md p-4 w-full max-w-[300px] space-y-3">
                        {newAnn.image_url && <img src={newAnn.image_url} alt="" className="w-full aspect-video object-contain rounded-lg bg-muted" />}
                        <h4 className="font-bold">{newAnn.title || 'Título'}</h4>
                        <p className="text-xs text-muted-foreground">{newAnn.content || 'Conteúdo...'}</p>
                        <div className="text-[10px] text-center text-muted-foreground">Fecha em {newAnn.display_time_seconds}s</div>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter><Button onClick={handleAdd}>{editingId ? "Salvar alterações" : "Publicar aviso"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <Card className="rounded-2xl border-[color:var(--hairline)] p-2 sm:p-3">
          {announcements === null ? (
            <div className="py-16 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : announcements.length === 0 ? (
            <p className="text-center py-14 text-sm text-muted-foreground">Nenhum aviso cadastrado.</p>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto grid gap-2 p-1">
              {announcements.map(a => {
                const st = annStatus(a);
                return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl border border-[color:var(--hairline)] bg-card">
                    <div className="flex items-center gap-3 min-w-0">
                      {a.image_url
                        ? <img src={a.image_url} alt="" className="size-10 rounded-lg object-contain bg-muted border shrink-0" />
                        : <div className="size-10 rounded-lg bg-muted grid place-items-center shrink-0 text-muted-foreground"><Eye className="size-4" /></div>}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                          <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.label}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {a.display_time_seconds}s na tela
                          {a.expires_at ? ` · até ${new Date(a.expires_at).toLocaleDateString("pt-BR")}` : " · sem prazo"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="gap-1.5" disabled={busyId === a.id} onClick={() => void handleToggle(a)}>
                        <Power className="size-4" /> {a.is_active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(a)}><SettingsIcon className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" disabled={busyId === a.id} onClick={() => void handleDelete(a.id)}>
                        {busyId === a.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full animate-in fade-in duration-200">
      <PageHeader
        title="Inteligência Artificial"
        description="Configuração global dos agentes: provedor, modelo e chaves."
        actions={
          <Badge variant="outline" className="text-[11px] gap-1.5 py-1">
            <Sparkles className="size-3" /> {globalAi.ai_provider} · {globalAi.ai_model || "—"}
          </Badge>
        }
      />

      

      <OpenAiSpendPanel />


      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] items-start">
        <Card className="p-5 sm:p-6 rounded-2xl border-[color:var(--hairline)] space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Provedor padrão</Label>
              <Select
                value={globalAi.ai_provider}
                onValueChange={(v) => {
                  const defaultModel = v === "drael" ? "drael-v1" : v === "openai" ? "gpt-4o-mini" : "google/gemini-2.0-flash-exp";
                  setGlobalAi({ ...globalAi, ai_provider: v, ai_model: defaultModel });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI (GPT-4o / GPT-4o-mini)</SelectItem>
                  <SelectItem value="drael">Drael (drael.sh / drael-v1)</SelectItem>
                  <SelectItem value="gemini">Google Gemini (Gateway Capi Conversa)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modelo global</Label>
              <Input
                value={globalAi.ai_model}
                onChange={e => setGlobalAi({ ...globalAi, ai_model: e.target.value })}
                placeholder="ex: gpt-4o-mini ou drael-v1"
                list="ai-models"
              />
              <datalist id="ai-models">
                <option value="gpt-4o-mini" />
                <option value="gpt-4o" />
                <option value="drael-v1" />
                <option value="google/gemini-2.0-flash-exp" />
              </datalist>
            </div>
          </div>

          <div className="pt-4 border-t space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="size-3" /> API Key (OpenAI ou Drael)
                {savedKeys.openai && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700"><ShieldCheck className="size-3" /> chave salva</span>
                )}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showKeys.openai ? "text" : "password"}
                  value={globalAi.openai_api_key}
                  onChange={e => setGlobalAi({ ...globalAi, openai_api_key: e.target.value })}
                  placeholder="sk-... ou dk-..."
                  className="flex-1"
                />
                <Button
                  type="button" variant="ghost" size="icon" className="size-9 shrink-0"
                  title={showKeys.openai ? "Ocultar chave" : "Mostrar chave"}
                  onClick={() => setShowKeys(s => ({ ...s, openai: !s.openai }))}
                >
                  {showKeys.openai ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button
                  type="button" variant="ghost" size="icon" className="size-9 shrink-0"
                  title="Copiar chave"
                  disabled={!globalAi.openai_api_key}
                  onClick={() => copyKey(globalAi.openai_api_key, "OpenAI")}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1 gap-2" onClick={handleSaveAi} disabled={savingAi}>
              {savingAi ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar configuração
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={handleTestAi} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Testar resposta
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 rounded-2xl border-amber-200 bg-amber-50 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0" />
              <p className="text-xs leading-relaxed">
                As chaves definidas aqui valem para <b>todos</b> os clientes da plataforma.
                Confira o saldo nas respectivas plataformas antes de trocar o provedor.
              </p>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl border-[color:var(--hairline)]">
            <h3 className="text-sm font-semibold mb-2">Resultado do teste</h3>
            {!testResult ? (
              <p className="text-xs text-muted-foreground">Execute "Testar resposta" para validar provedor, modelo e chave.</p>
            ) : testResult.ok ? (
              <div className="flex items-start gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Respondendo.</strong> Latência: {testResult.ms}ms
                  <p className="opacity-80 mt-1 break-words">{String(testResult.sample ?? "").slice(0, 160)}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-red-800">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div className="break-words">
                  <strong>Falhou:</strong> {testResult.error}
                  {String(testResult.error ?? "").includes("invalid model ID") && (
                    <p className="mt-1 font-semibold">O modelo não corresponde ao provedor selecionado. Para OpenAI use gpt-4o-mini.</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
