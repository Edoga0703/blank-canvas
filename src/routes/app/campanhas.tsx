import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listCampaigns, saveCampaign, deleteCampaign, startCampaign,
  pauseCampaign, cancelCampaign, listAvailableTags, getCampaign,
  listCampaignConnections, listCampaignTemplates,
} from "@/lib/campaigns.functions";
import { listApprovedHsmForInstance } from "@/lib/hsm-templates.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, Plus, Play, Pause, Trash2, X, Send, Eye, Download,
  Upload, MessageSquare, CheckCircle2, BookOpen, AlertTriangle, RefreshCw, Search,
} from "lucide-react";
import { brand } from "@/config/brand";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/app/campanhas")({
  head: () => ({ meta: [{ title: `${brand.name} — Campanhas` }] }),
  component: CampanhasPage,
});

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  enviando: "Enviando",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const STATUS_DOT: Record<string, string> = {
  rascunho: "bg-muted-foreground",
  agendada: "bg-blue-500",
  enviando: "bg-amber-500",
  pausada: "bg-orange-500",
  concluida: "bg-emerald-500",
  cancelada: "bg-red-500",
};
const STATUS_BG: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  agendada: "bg-blue-50 text-blue-700",
  enviando: "bg-amber-50 text-amber-700",
  pausada: "bg-orange-50 text-orange-700",
  concluida: "bg-violet-50 text-violet-700",
  cancelada: "bg-red-50 text-red-700",
};

type Connection = {
  id: string;
  instance_name: string;
  display_name: string | null;
  numero: string | null;
  provider_type: string;
  status: string;
  paused: boolean;
};
type Template = { id: string; atalho: string; texto: string };

function providerLabel(pt: string) {
  if (pt === "oficial_meta" || pt === "official") return "API Oficial";
  if (pt === "uazapi") return "Uazapi";
  return "Evolution";
}

function relativeTime(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "há instantes";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? "s" : ""}`;
  const M = Math.floor(d / 30);
  if (M < 12) return `há ${M} mese${M > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString();
}

function CampanhasPage() {
  const list = useServerFn(listCampaigns);
  const save = useServerFn(saveCampaign);
  const remove = useServerFn(deleteCampaign);
  const start = useServerFn(startCampaign);
  const pause = useServerFn(pauseCampaign);
  const cancel = useServerFn(cancelCampaign);
  const tagsFn = useServerFn(listAvailableTags);
  const getOne = useServerFn(getCampaign);
  const connsFn = useServerFn(listCampaignConnections);
  const tplsFn = useServerFn(listCampaignTemplates);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [conns, setConns] = useState<Connection[]>([]);
  const [tpls, setTpls] = useState<Template[]>([]);
  const [hsmTpls, setHsmTpls] = useState<Template[]>([]);
  const hsmFn = useServerFn(listApprovedHsmForInstance);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [perPage, setPerPage] = useState<number>(10);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [details, setDetails] = useState<any | null>(null);
  const [confirmStart, setConfirmStart] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [r, t, c, tp] = await Promise.all([list(), tagsFn(), connsFn(), tplsFn()]);
      setRows(r as any[]);
      setTags(t as string[]);
      setConns(c as Connection[]);
      setTpls(tp as Template[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const id = setInterval(() => { void list().then((r) => setRows(r as any[])); }, 15_000);
    return () => clearInterval(id);
  }, []);

  const kpis = useMemo(() => {
    let total = 0, executando = 0, enviadas = 0, entregues = 0, lidas = 0, falhas = 0;
    for (const c of rows as any[]) {
      total++;
      if (c.status === "enviando") executando++;
      enviadas += c.total_enviados || 0;
      entregues += c.total_entregues || 0;
      lidas += c.total_lidas || 0;
      falhas += c.total_falhas || 0;
    }
    return { total, executando, enviadas, entregues, lidas, falhas };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows as any[]).filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (term && !`${c.nome} ${c.descricao ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    }).slice(0, perPage);
  }, [rows, q, statusFilter, perPage]);

  function openNew() {
    setEditing({
      nome: "", descricao: "", mensagem: "", agendado_para: "", filtro_tags: [],
      intervalo_min_seg: 5, intervalo_max_seg: 20, pausa_apos_envios: 50, pausa_duracao_min: 10,
      janela_dias: [1, 2, 3, 4, 5], janela_hora_ini: "09:00", janela_hora_fim: "18:00",
      timezone: "America/Sao_Paulo", limite_diario: 200,
      aquecimento_ativo: false, aquecimento_dia_inicio: null,
      simular_digitacao: true, pular_ativos_dias: 15,
      origem_destinatarios: "csv", custom_targets: [],
      whatsapp_instance_id: conns[0]?.id ?? null,
      velocidade_msg_seg: 20,
      template_id: "",
    });
    setOpen(true);
  }

  function parseFile(file: File): Promise<{ numero: string; nome: string | null }[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        try {
          const data = reader.result as ArrayBuffer;
          const wb = XLSX.read(data, { type: "array" });
          const sh = wb.Sheets[wb.SheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
          const out: { numero: string; nome: string | null }[] = [];
          for (const r of rows) {
            if (!Array.isArray(r) || r.length === 0) continue;
            let numero = "", nome: string | null = null;
            for (const cell of r) {
              const s = String(cell ?? "").trim();
              const digits = s.replace(/\D/g, "");
              if (!numero && digits.length >= 8) numero = digits;
              else if (!nome && s && !/^[\d\s()+\-]+$/.test(s)) nome = s;
            }
            if (numero && !/^numero$|^phone$|^telefone$/i.test(numero)) {
              out.push({ numero, nome });
            }
          }
          resolve(out);
        } catch (e) { reject(e); }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function handleFileUpload(file: File) {
    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) { toast.error("Nenhum contato válido encontrado no arquivo"); return; }
      setEditing((p: any) => ({ ...p, custom_targets: parsed, origem_destinatarios: "csv" }));
      toast.success(`${parsed.length} contatos importados`);
    } catch (e: any) { toast.error(e?.message ?? "Falha ao ler arquivo"); }
  }

  function downloadTemplateCsv() {
    const csv = "numero,nome\n5511999998888,Ana Silva\n5511977776666,João Souza\n5511955554444,Maria Costa\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "modelo_campanha.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportCampaignCsv(id: string) {
    try {
      const r: any = await getOne({ data: { id } });
      const header = "numero,nome,status,enviado_em,erro\n";
      const body = (r.targets ?? [])
        .map((t: any) => [t.contato_numero, JSON.stringify(t.contato_nome ?? ""), t.status, t.enviado_em ?? "", JSON.stringify(t.ultimo_erro ?? "")].join(","))
        .join("\n");
      const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `campanha_${r.campaign.nome}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao exportar"); }
  }

  async function openDetails(id: string) {
    try {
      const r: any = await getOne({ data: { id } });
      setDetails(r.campaign);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao carregar"); }
  }

  async function handleSave() {
    if (!editing?.nome?.trim()) { toast.error("Informe o nome da campanha"); return; }
    if (!editing?.whatsapp_instance_id) { toast.error("Selecione uma conexão WhatsApp"); return; }
    const template = (isOfficial ? hsmTpls : tpls).find((t) => t.id === editing.template_id);
    const mensagem = editing.mensagem?.trim() || template?.texto?.trim() || "";
    if (!mensagem) { toast.error("Escreva uma mensagem ou selecione um template"); return; }
    try {
      await save({ data: {
        id: editing.id,
        nome: editing.nome.trim(),
        descricao: editing.descricao?.trim() || null,
        mensagem,
        agendado_para: editing.agendado_para || null,
        filtro_tags: editing.filtro_tags ?? [],
        janela_dias: editing.janela_dias ?? [1,2,3,4,5],
        janela_hora_ini: editing.janela_hora_ini || "09:00",
        janela_hora_fim: editing.janela_hora_fim || "18:00",
        timezone: editing.timezone || "America/Sao_Paulo",
        origem_destinatarios: editing.origem_destinatarios || "csv",
        custom_targets: editing.custom_targets ?? [],
        whatsapp_instance_id: editing.whatsapp_instance_id,
        velocidade_msg_seg: Number(editing.velocidade_msg_seg) || 20,
      } as any });
      toast.success("Campanha salva");
      setOpen(false);
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar"); }
  }

  async function handleStart(id: string) {
    try {
      const r: any = await start({ data: { id } });
      toast.success(`Campanha iniciada — ${r.total} destinatários`);
      setConfirmStart(null);
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao iniciar"); }
  }

  const selectedConn = conns.find((c) => c.id === editing?.whatsapp_instance_id);
  const isOfficial = selectedConn?.provider_type === "oficial_meta" || selectedConn?.provider_type === "official";
  const activeTpls = isOfficial ? hsmTpls : tpls;

  useEffect(() => {
    if (!editing?.whatsapp_instance_id || !isOfficial) { setHsmTpls([]); return; }
    void hsmFn({ data: { instanceId: editing.whatsapp_instance_id } })
      .then((r: any) => setHsmTpls((r ?? []).map((x: any) => ({ id: x.id, atalho: x.nome, texto: x.corpo }))))
      .catch(() => setHsmTpls([]));
  }, [editing?.whatsapp_instance_id, isOfficial]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Gerencie campanhas e templates de mensagens</p>
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="size-4 mr-1" /> Nova Campanha</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={<Send className="size-4" />} value={kpis.total} label="Campanhas" tint="violet" />
        <Kpi icon={<Play className="size-4" />} value={kpis.executando} label="Executando" tint="emerald" />
        <Kpi icon={<MessageSquare className="size-4" />} value={kpis.enviadas} label="Enviadas" tint="blue" />
        <Kpi icon={<CheckCircle2 className="size-4" />} value={kpis.entregues} label="Entregues" tint="teal" />
        <Kpi icon={<BookOpen className="size-4" />} value={kpis.lidas} label="Lidas" tint="cyan" />
        <Kpi icon={<AlertTriangle className="size-4" />} value={kpis.falhas} label="Falhas" tint="red" />
      </div>

      {/* Filters */}
      <Card className="p-3 flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanhas..." className="pl-9 border-0 bg-transparent focus-visible:ring-0" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Todos os status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v))}>
          <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 por página</SelectItem>
            <SelectItem value="25">25 por página</SelectItem>
            <SelectItem value="50">50 por página</SelectItem>
            <SelectItem value="100">100 por página</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => void refresh()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Send className="size-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">Nenhuma campanha encontrada</p>
          <p className="text-sm text-muted-foreground mb-4">Crie sua primeira campanha para começar.</p>
          <Button onClick={openNew}><Plus className="size-4 mr-1" /> Nova Campanha</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c: any) => {
            const total = c.total_destinatarios || 0;
            const enviados = c.total_enviados || 0;
            const pct = total > 0 ? Math.round((enviados / total) * 100) : 0;
            const conn = conns.find((x) => x.id === c.whatsapp_instance_id);
            const tpl = tpls.find((x) => x.texto === c.mensagem);
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{c.nome}</h3>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BG[c.status]}`}>
                        <span className={`size-1.5 rounded-full ${STATUS_DOT[c.status]}`} />
                        {STATUS_LABEL[c.status]}
                      </span>
                      {(c.filtro_tags ?? []).slice(0, 3).map((t: string) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <div className="flex-1 min-w-0 max-w-md">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">{enviados}/{total} ({pct}%)</span>
                      {c.total_entregues > 0 && (
                        <span className="text-emerald-600 flex items-center gap-1 whitespace-nowrap"><CheckCircle2 className="size-3" /> {c.total_entregues}</span>
                      )}
                      {c.total_lidas > 0 && (
                        <span className="text-blue-600 flex items-center gap-1 whitespace-nowrap"><BookOpen className="size-3" /> {c.total_lidas}</span>
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>👥 {total || (c.custom_targets?.length ?? 0)} contatos</span>
                      {conn && <span>📡 {conn.display_name || conn.instance_name}</span>}
                      {tpl && <span>📄 {tpl.atalho}</span>}
                      <span>{relativeTime(c.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.status === "rascunho" && (
                      <Button size="sm" onClick={() => setConfirmStart(c.id)}>
                        <Play className="size-4 mr-1" /> Iniciar
                      </Button>
                    )}
                    {c.status === "enviando" && (
                      <Button size="icon" variant="ghost" onClick={async () => { await pause({ data: { id: c.id, pause: true } }); await refresh(); }}>
                        <Pause className="size-4" />
                      </Button>
                    )}
                    {c.status === "pausada" && (
                      <Button size="icon" variant="ghost" onClick={async () => { await pause({ data: { id: c.id, pause: false } }); await refresh(); }}>
                        <Play className="size-4" />
                      </Button>
                    )}
                    {(c.status === "agendada" || c.status === "enviando" || c.status === "pausada") && (
                      <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Cancelar campanha?")) { await cancel({ data: { id: c.id } }); await refresh(); } }}>
                        <X className="size-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="text-red-600" onClick={async () => { if (confirm("Excluir campanha?")) { await remove({ data: { id: c.id } }); await refresh(); } }}>
                      <Trash2 className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => exportCampaignCsv(c.id)}>
                      <Download className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openDetails(c.id)}>
                      <Eye className="size-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Nova campanha dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid place-items-center size-8 rounded-full bg-violet-100 text-violet-600"><Send className="size-4" /></span>
              {editing?.id ? "Editar Campanha" : "Nova Campanha"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Nome da Campanha *</Label>
                  <Input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} placeholder="Ex.: Promoção Black Friday" />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={editing.descricao ?? ""} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} placeholder="Opcional..." />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Lista de Contatos <span className="text-muted-foreground font-normal">(opcional — pode importar depois)</span></Label>
                </div>
                <label className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/40 block">
                  <Upload className="size-5 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">Clique para selecionar arquivo</p>
                  <p className="text-xs text-muted-foreground">CSV, TXT, XLSX ou XLS</p>
                  <input type="file" className="hidden" accept=".csv,.txt,.xlsx,.xls"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); e.target.value = ""; }} />
                </label>
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-muted-foreground">Não sabe o formato?</span>
                  <button type="button" onClick={downloadTemplateCsv} className="text-primary hover:underline flex items-center gap-1">
                    <Download className="size-3" /> Baixar modelo .csv
                  </button>
                </div>
                {(editing.custom_targets ?? []).length > 0 && (
                  <p className="mt-1 text-xs text-emerald-600">✓ {editing.custom_targets.length} contatos carregados</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Conexão WhatsApp *</Label>
                  <Select value={editing.whatsapp_instance_id ?? ""} onValueChange={(v) => setEditing({ ...editing, whatsapp_instance_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar conexão" /></SelectTrigger>
                    <SelectContent>
                      {conns.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma conexão ativa</div>}
                      {conns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {(c.display_name || c.instance_name)} — {providerLabel(c.provider_type)}{c.numero ? ` · ${c.numero}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isOfficial ? "Template HSM (aprovado pela Meta)" : "Template"}</Label>
                  <Select value={editing.template_id ?? ""} onValueChange={(v) => {
                    const t = (isOfficial ? hsmTpls : tpls).find((x) => x.id === v);
                    setEditing({ ...editing, template_id: v, mensagem: t?.texto ?? editing.mensagem });
                  }}>
                    <SelectTrigger><SelectValue placeholder={isOfficial ? "Selecione um template aprovado" : "Nenhum (usar mensagem)"} /></SelectTrigger>
                    <SelectContent>
                      {!isOfficial && <SelectItem value="none">Nenhum (usar mensagem)</SelectItem>}
                      {isOfficial && activeTpls.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum template aprovado — crie em Templates</div>
                      )}
                      {activeTpls.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.atalho}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </div>

              <div>
                <Label>Mensagem *</Label>
                <Textarea rows={4} value={editing.mensagem} onChange={(e) => setEditing({ ...editing, mensagem: e.target.value })} placeholder="Digite a mensagem..." />
                {!isOfficial && (
                  <p className="mt-1 text-[11px] text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" /> Sem template, só funciona para contatos ativos nas últimas 24h
                  </p>
                )}
              </div>

              <div>
                <Label>Segmentar por Tags <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (!v) return;
                    const cur = editing.filtro_tags ?? [];
                    if (cur.includes(v)) return;
                    const next = [...cur, v];
                    setEditing({ ...editing, filtro_tags: next, origem_destinatarios: next.length ? "crm" : editing.origem_destinatarios });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tags.length === 0 ? "Nenhuma tag disponível — crie em CRM › Tags" : "Selecionar tag..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {tags.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma tag cadastrada</div>}
                    {tags
                      .filter((t) => !(editing.filtro_tags ?? []).includes(t))
                      .map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {(editing.filtro_tags ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(editing.filtro_tags as string[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          const next = (editing.filtro_tags as string[]).filter((x) => x !== t);
                          setEditing({ ...editing, filtro_tags: next });
                        }}
                        className="text-xs px-2.5 py-1 rounded-full border bg-orange-100 text-orange-700 border-orange-300"
                      >
                        {t} <span className="ml-1">×</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Crie novas tags no módulo <b>CRM</b> ao editar um lead.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Agendar para</Label>
                  <Input type="datetime-local" value={editing.agendado_para ? String(editing.agendado_para).slice(0, 16) : ""}
                    onChange={(e) => setEditing({ ...editing, agendado_para: e.target.value ? new Date(e.target.value).toISOString() : "" })} />
                  <p className="text-[11px] text-muted-foreground mt-1">Deixe vazio para iniciar manualmente</p>
                </div>
                <div>
                  <Label>Velocidade (msg/seg)</Label>
                  <Input type="number" min={1} max={60} value={editing.velocidade_msg_seg}
                    onChange={(e) => setEditing({ ...editing, velocidade_msg_seg: e.target.value })} />
                  <p className="text-[11px] text-muted-foreground mt-1">Máximo recomendado: 20–30</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}><Send className="size-4 mr-1" /> {editing?.id ? "Salvar" : "Criar Campanha"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={!!details} onOpenChange={(v) => !v && setDetails(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">{details?.nome}</DialogTitle>
          </DialogHeader>
          {details && (() => {
            const total = details.total_destinatarios || 0;
            const enviados = details.total_enviados || 0;
            const entregues = details.total_entregues || 0;
            const lidas = details.total_lidas || 0;
            const falhas = details.total_falhas || 0;
            const pctEntrega = enviados > 0 ? Math.round((entregues / enviados) * 100) : 0;
            const pctLeitura = entregues > 0 ? Math.round((lidas / entregues) * 100) : 0;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard value={total} label="Total" tint="slate" />
                  <StatCard value={enviados} label="Enviadas" tint="emerald" />
                  <StatCard value={entregues} label="Entregues" tint="blue" />
                  <StatCard value={lidas} label="Lidas" tint="violet" />
                </div>
                <div className="space-y-2">
                  <ProgressLine label="Taxa de Entrega" pct={pctEntrega} color="bg-emerald-500" />
                  <ProgressLine label="Taxa de Leitura" pct={pctLeitura} color="bg-blue-500" />
                </div>
                {falhas > 0 && (
                  <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="size-4" /> {falhas} falhas
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Confirm start */}
      <Dialog open={!!confirmStart} onOpenChange={(v) => !v && setConfirmStart(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid place-items-center size-8 rounded-full bg-emerald-100 text-emerald-600"><Play className="size-4" /></span>
              Iniciar Campanha
            </DialogTitle>
            <DialogDescription>
              Deseja iniciar o disparo desta campanha? As mensagens começarão a ser enviadas imediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStart(null)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => confirmStart && handleStart(confirmStart)}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon, value, label, tint }: { icon: React.ReactNode; value: number; label: string; tint: string }) {
  const tints: Record<string, string> = {
    violet: "bg-violet-100 text-violet-600",
    emerald: "bg-emerald-100 text-emerald-600",
    blue: "bg-blue-100 text-blue-600",
    teal: "bg-teal-100 text-teal-600",
    cyan: "bg-cyan-100 text-cyan-600",
    red: "bg-red-100 text-red-600",
  };
  return (
    <Card className="p-3 flex items-center gap-3">
      <span className={`grid place-items-center size-9 rounded-lg ${tints[tint] ?? tints.violet}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-lg font-semibold tabular-nums">{value.toLocaleString("pt-BR")}</div>
        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
      </div>
    </Card>
  );
}

function StatCard({ value, label, tint }: { value: number; label: string; tint: string }) {
  const tints: Record<string, string> = {
    slate: "bg-slate-50 text-slate-900",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <div className={`rounded-lg p-4 text-center ${tints[tint]}`}>
      <div className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

function ProgressLine({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="font-semibold" style={{ color: color.includes("emerald") ? "#059669" : "#2563eb" }}>{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
