import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listWebhooks, saveWebhook, deleteWebhook, listWebhookLogs, testWebhook,
  listApiTokens, createApiToken, revokeApiToken,
} from "@/lib/integrations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Copy, Webhook, KeyRound, Link2, BookOpen } from "lucide-react";
import { IntegracaoGuias } from "@/components/config/integracao-guias";
import { useCapacidadeAtiva } from "@/hooks/use-capacidades";
import { Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { featuresFor } from "@/lib/plan-features";
import { requireAdmin } from "@/lib/route-guards";

export const Route = createFileRoute("/app/integracoes")({
  head: () => ({ meta: [{ title: `${brand.name} — Integrações` }] }),
  beforeLoad: ({ context }) => requireAdmin(context),
  component: IntegracoesPage,
});

const EVENTS = [
  { id: "message.received", label: "Mensagem recebida" },
  { id: "message.sent", label: "Mensagem enviada" },
  { id: "lead.created", label: "Lead criado" },
  { id: "lead.won", label: "Venda ganha" },
  { id: "lead.lost", label: "Lead perdido" },
  { id: "csat.responded", label: "CSAT respondido" },
];

function IntegracoesPage() {
  const ctx = Route.useRouteContext();
  return <IntegracoesContent company={ctx.company} />;
}

export function IntegracoesContent({ company }: { company: any }) {
  const planSlug = (company as any)?.plan_slug || "starter";
  const features = featuresFor(planSlug);
  const isBusiness = planSlug === "business" || features.apiWebhooks;

  return (
    <div className="space-y-6 max-w-5xl">
      <Tabs defaultValue="guias">
        <TabsList>
          <TabsTrigger value="guias"><BookOpen className="size-4 mr-1.5" /> Guias</TabsTrigger>
          <TabsTrigger value="webhooks"><Webhook className="size-4 mr-1.5" /> Webhooks</TabsTrigger>
          <TabsTrigger value="api"><KeyRound className="size-4 mr-1.5" /> API pública</TabsTrigger>
          <TabsTrigger value="utm"><Link2 className="size-4 mr-1.5" /> Links UTM</TabsTrigger>
        </TabsList>

        <TabsContent value="guias" className="mt-4"><IntegracaoGuias /></TabsContent>
        <TabsContent value="webhooks" className="mt-4"><WebhooksTab /></TabsContent>
        <TabsContent value="api" className="mt-4"><ApiTab isBusiness={isBusiness} /></TabsContent>
        <TabsContent value="utm" className="mt-4"><UtmTab company={company} /></TabsContent>
      </Tabs>

    </div>
  );
}

function WebhooksTab() {
  const ativo = useCapacidadeAtiva("webhooks-out");
  const list = useServerFn(listWebhooks);
  const save = useServerFn(saveWebhook);
  const del = useServerFn(deleteWebhook);
  const logsFn = useServerFn(listWebhookLogs);
  const testFn = useServerFn(testWebhook);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  async function refresh() {
    setLoading(true);
    try { const [r, l] = await Promise.all([list(), logsFn()]); setRows(r as any); setLogs(l as any); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (ativo) void refresh(); else setLoading(false); }, [ativo]);

  if (!ativo) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Para enviar eventos para Zapier, Make, n8n ou seu servidor, instale o plugin <b>Webhooks</b> na Loja de Plugins.
        </p>
        <Link to="/app/plugins"><Button>Abrir Loja de Plugins</Button></Link>
      </Card>
    );
  }

  function openNew() { setEditing({ nome: "", url: "", eventos: [], ativo: true }); setOpen(true); }

  async function handleSave() {
    if (!editing.nome || !editing.url) { toast.error("Nome e URL obrigatórios"); return; }
    try {
      await save({ data: { id: editing.id, nome: editing.nome, url: editing.url, eventos: editing.eventos, ativo: editing.ativo } });
      toast.success("Salvo"); setOpen(false); await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Envie eventos do atendimento para Zapier, Make, n8n ou seu próprio servidor. Assinatura HMAC-SHA256 no header <code>X-AtendeZap-Signature</code>.</p>
        <Button onClick={openNew}><Plus className="size-4 mr-1" /> Novo webhook</Button>
      </div>

      {loading ? <Loader2 className="size-5 animate-spin mx-auto my-10" /> : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum webhook configurado.</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((w) => (
            <Card key={w.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{w.nome}</h3>
                  {w.ativo ? <Badge variant="outline" className="text-emerald-600">ativo</Badge> : <Badge variant="outline">inativo</Badge>}
                  {(w.eventos ?? []).map((e: string) => <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>)}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{w.url}</p>
                <p className="text-xs text-muted-foreground mt-1">Secret: <code className="text-[10px]">{w.secret}</code></p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testingId === w.id}
                  onClick={async () => {
                    setTestingId(w.id);
                    try {
                      const r: any = await testFn({ data: { id: w.id } });
                      if (r?.ok) toast.success(`Teste enviado (HTTP ${r.status})`);
                      else toast.error(r?.erro ?? `Falha no envio${r?.status ? ` (HTTP ${r.status})` : ""}`);
                      await refresh();
                    } catch (e: any) { toast.error(e?.message ?? "Erro no teste"); }
                    finally { setTestingId(null); }
                  }}
                >
                  {testingId === w.id ? <Loader2 className="size-4 animate-spin" /> : "Testar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(w); setOpen(true); }}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Excluir?")) { await del({ data: { id: w.id } }); await refresh(); } }}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {logs.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2 text-sm">Últimas entregas</h3>
          <div className="space-y-1 max-h-60 overflow-auto">
            {logs.map((l) => (
              <div key={l.id} className="text-xs flex items-center gap-2 font-mono">
                <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                <span>{l.evento}</span>
                <span className={l.status_code >= 200 && l.status_code < 300 ? "text-emerald-600" : "text-red-600"}>
                  {l.status_code ?? "ERR"}
                </span>
                {l.erro && <span className="text-red-500 truncate">{l.erro}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Novo"} webhook</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} placeholder="Notificar CRM" /></div>
              <div><Label>URL</Label><Input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://hooks.zapier.com/..." /></div>
              <div>
                <Label>Eventos (vazio = todos)</Label>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {EVENTS.map((ev) => {
                    const on = editing.eventos.includes(ev.id);
                    return (
                      <button key={ev.id} type="button"
                        onClick={() => setEditing({ ...editing, eventos: on ? editing.eventos.filter((x: string) => x !== ev.id) : [...editing.eventos, ev.id] })}
                        className={`text-xs px-2 py-1.5 rounded border text-left ${on ? "bg-primary text-primary-foreground border-primary" : "border-input"}`}>
                        {ev.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} /> Ativo</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApiTab({ isBusiness }: { isBusiness: boolean }) {
  const list = useServerFn(listApiTokens);
  const create = useServerFn(createApiToken);
  const revoke = useServerFn(revokeApiToken);
  const [rows, setRows] = useState<any[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() { setLoading(true); try { setRows(await list() as any); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);

  async function handleCreate() {
    if (!label.trim()) return;
    try { await create({ data: { label: label.trim() } }); setLabel(""); toast.success("Token criado"); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  if (!isBusiness) {
    return <Card className="p-8 text-center">
      <KeyRound className="size-10 mx-auto mb-3 text-muted-foreground" />
      <p className="font-medium">API pública disponível no plano Business</p>
      <p className="text-sm text-muted-foreground">Faça upgrade para gerar tokens e acessar endpoints REST.</p>
    </Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold mb-1">Base URL</h3>
        <code className="text-xs">{typeof window !== "undefined" ? window.location.origin : ""}/api/public/v1/?resource=contacts</code>
        <p className="text-xs text-muted-foreground mt-2">Autentique com <code>Authorization: Bearer &lt;token&gt;</code>. Recursos: <code>contacts</code> (GET), <code>messages</code> (GET/POST).</p>
      </Card>

      <div className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome do token (ex: integração CRM)" />
        <Button onClick={handleCreate}><Plus className="size-4 mr-1" /> Gerar</Button>
      </div>

      {loading ? <Loader2 className="size-5 animate-spin mx-auto my-10" /> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center">Nenhum token ainda.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => (
            <Card key={t.id} className="p-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <strong>{t.label}</strong>
                  {t.revogado && <Badge variant="outline" className="text-red-600">revogado</Badge>}
                </div>
                <code className="text-xs text-muted-foreground break-all">{t.token}</code>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(t.token); toast.success("Copiado"); }}>
                <Copy className="size-4" />
              </Button>
              {!t.revogado && (
                <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Revogar token?")) { await revoke({ data: { id: t.id } }); await refresh(); } }}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UtmTab({ company }: { company: any }) {
  const [numero, setNumero] = useState(company?.telefone ?? "");
  const [mensagem, setMensagem] = useState("Olá! Vi seu anúncio.");
  const [source, setSource] = useState("meta-ads");
  const [medium, setMedium] = useState("cpc");
  const [campaign, setCampaign] = useState("black-friday");

  const num = numero.replace(/\D/g, "");
  const text = encodeURIComponent(`${mensagem} [utm:${source}/${medium}/${campaign}]`);
  const link = num ? `https://wa.me/${num}?text=${text}` : "";

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Gere links rastreáveis para WhatsApp com parâmetros UTM. Quando o lead enviar a primeira mensagem, o sistema captura a origem
          (procure pelo padrão <code>[utm:...]</code> no texto inicial e registra <code>utm_source/medium/campaign</code> no contato do CRM).
        </p>
      </Card>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Número (com DDI)</Label><Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="5511999999999" /></div>
        <div><Label>Mensagem inicial</Label><Input value={mensagem} onChange={(e) => setMensagem(e.target.value)} /></div>
        <div><Label>utm_source</Label><Input value={source} onChange={(e) => setSource(e.target.value)} /></div>
        <div><Label>utm_medium</Label><Input value={medium} onChange={(e) => setMedium(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>utm_campaign</Label><Input value={campaign} onChange={(e) => setCampaign(e.target.value)} /></div>
      </div>
      {link && (
        <Card className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground">Seu link:</p>
          <code className="block text-xs break-all">{link}</code>
          <Button size="sm" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}>
            <Copy className="size-4 mr-1" /> Copiar
          </Button>
        </Card>
      )}
    </div>
  );
}
