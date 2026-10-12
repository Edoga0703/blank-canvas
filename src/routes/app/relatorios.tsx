import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle, Bot, CheckCircle2, CircleDot, Clock3, FileSpreadsheet, FileText,
  Headphones, Loader2, RefreshCw, Search, Send, UsersRound, X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContactPicker } from "@/components/agenda/contact-picker";
import type { LeadOpt } from "@/components/agenda/appointment-form";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  analisarAtendimentosAtivos, listarContatosEnvioRelatorio, panoramaAtendimentos,
} from "@/lib/atendimento-relatorios.functions";
import { sendWhatsappMedia } from "@/lib/evolution.functions";
import { brand } from "@/config/brand";

export const Route = createFileRoute("/app/relatorios")({
  head: () => ({ meta: [
    { title: `${brand.name} — Relatórios de atendimento` },
    { name: "description", content: "Acompanhamento em tempo real e relatório diário dos atendimentos." },
    { property: "og:title", content: `${brand.name} — Relatórios de atendimento` },
    { property: "og:description", content: "Acompanhamento em tempo real e relatório diário dos atendimentos." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: RelatoriosPage,
});

type Row = Record<string, any>;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const LABEL: Record<string, string> = {
  resolvido: "Resolvido", pendente: "Pendente", em_atendimento: "Em atendimento", aguardando: "Aguardando",
};
const COR: Record<string, string> = {
  resolvido: "bg-prospect-success text-prospect-success-foreground",
  pendente: "bg-prospect-warning text-prospect-warning-foreground",
  em_atendimento: "bg-prospect-info text-prospect-info-foreground",
  aguardando: "bg-prospect-danger text-prospect-danger-foreground",
};

function RelatoriosPage() {
  const panoramaFn = useServerFn(panoramaAtendimentos);
  const analisarFn = useServerFn(analisarAtendimentosAtivos);
  const contatosFn = useServerFn(listarContatosEnvioRelatorio);
  const enviarMidiaFn = useServerFn(sendWhatsappMedia);
  const [de, setDe] = useState(isoDay(new Date()));
  const [ate, setAte] = useState(isoDay(new Date()));
  const [situacao, setSituacao] = useState("");
  const [atendenteId, setAtendenteId] = useState("");
  const [busca, setBusca] = useState("");
  const [data, setData] = useState<{ rows: Row[]; atendentes: { id: string; nome: string }[]; resumo: any }>({ rows: [], atendentes: [], resumo: {} });
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<LeadOpt[]>([]);
  const [recipient, setRecipient] = useState<LeadOpt | null>(null);
  const filtros = useRef({ de, ate, situacao, atendenteId });
  filtros.current = { de, ate, situacao, atendenteId };

  async function load(silencioso = false) {
    if (!silencioso) setLoading(true);
    try {
      const f = filtros.current;
      setData(await panoramaFn({ data: { de: f.de, ate: f.ate, situacao: f.situacao || null, atendenteId: f.atendenteId || null } }) as any);
      setUpdatedAt(new Date());
    } catch (e: any) {
      if (!silencioso) toast.error(e?.message ?? "Não foi possível carregar.");
    } finally {
      if (!silencioso) setLoading(false);
    }
  }

  async function analisar() {
    setAnalisando(true);
    setProgresso(0);
    let offset = 0;
    let total = 1;
    let analisados = 0;
    let falhas = 0;
    try {
      while (offset < total) {
        const result: any = await analisarFn({ data: { de, ate, offset, limite: 10, somentePendentes: false } });
        total = result?.total ?? 0;
        offset = result?.proximoOffset ?? total;
        analisados += result?.analisados ?? 0;
        falhas += result?.falhas ?? 0;
        setProgresso(total ? Math.min(100, Math.round((offset / total) * 100)) : 100);
        if (!total || !result?.proximoOffset) break;
      }
      toast.success(`${analisados} atendimentos analisados${falhas ? ` · ${falhas} não puderam ser analisados` : ""}.`);
      await load(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na análise.");
    } finally {
      setAnalisando(false);
      setProgresso(0);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const timer = setInterval(() => void load(true), 30000);
    return () => clearInterval(timer);
  }, []);

  const rows = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return q ? data.rows.filter((r) => [r.cliente, r.numero, r.solicitacao, r.andamento, r.responsavel_nome].some((v) => String(v ?? "").toLowerCase().includes(q))) : data.rows;
  }, [data.rows, busca]);

  const kpis = [
    { label: "Atendimentos", valor: rows.length, cor: "text-report-navy", icon: Headphones, iconStyle: "bg-report-accent-soft text-report-accent" },
    { label: "Em atendimento", valor: rows.filter((r) => r.situacao === "em_atendimento").length, cor: "text-prospect-info-foreground", icon: CircleDot, iconStyle: "bg-prospect-info text-prospect-info-foreground" },
    { label: "Aguardando", valor: rows.filter((r) => r.situacao === "aguardando").length, cor: "text-prospect-danger-foreground", icon: Clock3, iconStyle: "bg-prospect-danger text-prospect-danger-foreground" },
    { label: "Resolvidos", valor: rows.filter((r) => r.situacao === "resolvido").length, cor: "text-prospect-success-foreground", icon: CheckCircle2, iconStyle: "bg-prospect-success text-prospect-success-foreground" },
    { label: "Pendentes", valor: rows.filter((r) => r.situacao === "pendente").length, cor: "text-prospect-warning-foreground", icon: AlertCircle, iconStyle: "bg-prospect-warning text-prospect-warning-foreground" },
  ];

  async function limparFiltros() {
    const hoje = isoDay(new Date());
    setDe(hoje); setAte(hoje); setSituacao(""); setAtendenteId(""); setBusca("");
    filtros.current = { de: hoje, ate: hoje, situacao: "", atendenteId: "" };
    await load();
  }

  function excel() {
    const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
      "Última interação": r.ultima_em ? new Date(r.ultima_em).toLocaleString("pt-BR") : "—",
      Cliente: r.cliente, Solicitação: r.solicitacao, "Andamento / solução": r.andamento,
      Situação: LABEL[r.situacao] ?? r.situacao, "Responsável atual": r.responsavel_nome, Setor: r.setor_nome,
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Atendimentos");
    XLSX.writeFile(book, `relatorio-atendimentos-${de}-${ate}.xlsx`);
  }

  function makePdf() {
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 28;
    const columns = [
      { key: "ultima", label: "Data / hora", width: 68 },
      { key: "cliente", label: "Cliente", width: 106 },
      { key: "solicitacao", label: "Solicitação", width: 152 },
      { key: "andamento", label: "Andamento / solução", width: 168 },
      { key: "situacao", label: "Situação", width: 78 },
      { key: "responsavel", label: "Responsável", width: 104 },
      { key: "setor", label: "Setor", width: 78 },
    ];
    let y = 0;
    let page = 1;
    const header = () => {
      doc.setFillColor(11, 34, 254); doc.rect(0, 0, pageWidth, 66, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
      doc.text("Relatório de atendimentos", margin, 29);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(`${de} a ${ate}  ·  ${rows.length} atendimentos  ·  Atualizado em ${new Date().toLocaleString("pt-BR")}`, margin, 47);
      const summary = kpis.map((k) => `${k.label}: ${k.valor}`).join("   ");
      doc.setTextColor(42, 49, 70); doc.setFontSize(8.5); doc.text(summary, margin, 85);
      y = 105;
      doc.setFillColor(244, 245, 249); doc.rect(margin, y - 13, pageWidth - margin * 2, 22, "F");
      doc.setTextColor(58, 64, 82); doc.setFont("helvetica", "bold"); doc.setFontSize(7.2);
      let x = margin;
      for (const col of columns) { doc.text(col.label.toUpperCase(), x + 4, y + 1); x += col.width; }
      y += 18;
    };
    const footer = () => {
      doc.setDrawColor(226, 229, 238); doc.line(margin, pageHeight - 26, pageWidth - margin, pageHeight - 26);
      doc.setTextColor(110, 116, 134); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text("Capi Conversa · Operação Sevcon", margin, pageHeight - 13);
      doc.text(`Página ${page}`, pageWidth - margin, pageHeight - 13, { align: "right" });
    };
    header();
    for (const r of rows) {
      const values: Record<string, string> = {
        ultima: r.ultima_em ? new Date(r.ultima_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—",
        cliente: `${r.cliente || "—"}\n${r.numero || ""}`,
        solicitacao: r.solicitacao || "Sem análise",
        andamento: r.andamento || "—",
        situacao: LABEL[r.situacao] ?? r.situacao,
        responsavel: r.responsavel_nome || "Sem responsável",
        setor: r.setor_nome || "—",
      };
      const wrapped = columns.map((col) => doc.splitTextToSize(values[col.key], col.width - 8).slice(0, 4));
      const rowHeight = Math.max(25, Math.max(...wrapped.map((lines) => lines.length)) * 9 + 8);
      if (y + rowHeight > pageHeight - 34) { footer(); doc.addPage(); page += 1; header(); }
      let x = margin;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.4); doc.setTextColor(35, 38, 50);
      wrapped.forEach((lines, index) => { doc.text(lines, x + 4, y + 8); x += columns[index].width; });
      y += rowHeight; doc.setDrawColor(226, 229, 238); doc.line(margin, y, pageWidth - margin, y);
    }
    if (!rows.length) {
      doc.setTextColor(110, 116, 134); doc.setFontSize(10); doc.text("Nenhum atendimento encontrado para os filtros selecionados.", margin, y + 18);
    }
    footer();
    return doc;
  }

  function pdf() {
    makePdf().save(`relatorio-atendimentos-${de}-${ate}.pdf`);
  }

  async function openSend() {
    setSendOpen(true);
    if (contacts.length) return;
    setContactsLoading(true);
    try { setContacts(await contatosFn() as LeadOpt[]); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível carregar os contatos."); }
    finally { setContactsLoading(false); }
  }

  async function sendPdf() {
    if (!recipient) { toast.error("Selecione um contato."); return; }
    setSending(true);
    try {
      const filename = `relatorio-atendimentos-${de}-${ate}.pdf`;
      const media = makePdf().output("datauristring");
      const result: any = await enviarMidiaFn({ data: {
        numero: recipient.numero, contatoNome: recipient.nome, mediatype: "document",
        media, mimetype: "application/pdf", fileName: filename,
        caption: `Relatório de atendimentos · ${de} a ${ate}`,
      } });
      if (!result?.ok && !result?.queued) throw new Error(result?.error || "Não foi possível enviar o relatório.");
      toast.success(result?.queued ? "Relatório entrou na fila de envio." : "Relatório enviado pelo WhatsApp.");
      setSendOpen(false); setRecipient(null);
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível enviar o relatório."); }
    finally { setSending(false); }
  }

  return <div className="-m-4 min-h-full bg-report-background font-report-body sm:-m-6 lg:-m-7">
    <div className="w-full overflow-hidden border-y border-border bg-report-surface shadow-sm">
      <header className="flex flex-col gap-4 border-b border-border px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-7">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-report-accent">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-report-accent opacity-30" /><span className="relative inline-flex size-2 rounded-full bg-report-accent" /></span>
            OPERAÇÃO AO VIVO
          </div>
          <h1 className="font-report-heading text-xl font-bold text-report-navy sm:text-2xl">Relatórios de atendimento</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visão diária da equipe{updatedAt ? ` · Atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="bg-report-accent text-primary-foreground hover:bg-report-accent/90" onClick={() => void analisar()} disabled={analisando}>
            {analisando ? <Loader2 className="animate-spin" /> : <Bot />}{analisando ? `Analisando ${progresso}%` : "Analisar com IA"}
          </Button>
          <Button variant="outline" onClick={() => void openSend()}><Send />Enviar</Button>
          <Button variant="outline" onClick={pdf}><FileText />PDF</Button>
          <Button variant="outline" onClick={excel}><FileSpreadsheet />Excel</Button>
        </div>
      </header>

      <section className="border-b border-border bg-report-background/70 px-5 py-4 lg:px-7" aria-label="Filtros do relatório">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[0.9fr_0.9fr_1.15fr_1.25fr_auto_auto] xl:items-end">
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>Data inicial</span><Input className="bg-report-surface" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>Data final</span><Input className="bg-report-surface" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>Situação</span><select className="h-9 w-full rounded-md border border-input bg-report-surface px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring" value={situacao} onChange={(e) => setSituacao(e.target.value)}><option value="">Todas as situações</option><option value="em_atendimento">Em atendimento</option><option value="aguardando">Aguardando</option><option value="resolvido">Resolvidos</option><option value="pendente">Pendentes</option></select></label>
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>Responsável</span><select className="h-9 w-full rounded-md border border-input bg-report-surface px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring" value={atendenteId} onChange={(e) => setAtendenteId(e.target.value)}><option value="">Todos os responsáveis</option>{data.atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
          <Button onClick={() => void load()} disabled={loading}>{loading ? <RefreshCw className="animate-spin" /> : <Search />}Aplicar</Button>
          <Button variant="ghost" onClick={() => void limparFiltros()}><X />Limpar</Button>
        </div>
      </section>

      <section className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border md:grid-cols-5 md:divide-y-0" aria-label="Resumo operacional">
        {kpis.map((k) => { const Icon = k.icon; return <div key={k.label} className="flex min-h-24 items-center gap-3 px-4 py-4 lg:px-5"><div className={`flex size-9 shrink-0 items-center justify-center rounded-md ${k.iconStyle}`}><Icon className="size-4" /></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-muted-foreground">{k.label}</p><p className={`font-report-heading text-2xl font-bold ${k.cor}`}>{k.valor}</p></div></div>; })}
      </section>

      <section aria-label="Lista de atendimentos">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-7">
          <div><h2 className="font-report-heading text-base font-bold text-report-navy">Atendimentos</h2><p className="text-xs text-muted-foreground">{rows.length} registros encontrados no período</p></div>
          <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="bg-report-background pl-9" placeholder="Buscar cliente, solicitação ou responsável" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        </div>
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[1060px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-report-background text-[11px] font-semibold uppercase text-muted-foreground shadow-sm">
              <tr><th className="w-[132px] px-5 py-3">Última interação</th><th className="w-[190px] px-4 py-3">Cliente</th><th className="w-[230px] px-4 py-3">Solicitação</th><th className="w-[260px] px-4 py-3">Andamento / solução</th><th className="w-[136px] px-4 py-3">Situação</th><th className="w-[170px] px-4 py-3">Responsável atual</th><th className="w-[140px] px-4 py-3">Setor</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && !rows.length && Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-5"><div className="h-3 animate-pulse rounded bg-muted" /></td>)}</tr>)}
              {rows.map((r) => <tr key={r.numero} className="h-[76px] transition-colors hover:bg-report-background/80">
                <td className="px-5 py-3 align-middle text-xs text-muted-foreground">{r.ultima_em ? <><span className="block font-medium text-foreground">{new Date(r.ultima_em).toLocaleDateString("pt-BR")}</span><span>{new Date(r.ultima_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></> : "—"}</td>
                <td className="px-4 py-3 align-middle"><p className="line-clamp-2 font-semibold text-report-navy" title={r.cliente}>{r.cliente}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{r.numero}</p></td>
                <td className="px-4 py-3 align-middle"><p className="line-clamp-2 text-foreground" title={r.solicitacao}>{r.solicitacao || <span className="italic text-muted-foreground">Sem análise ainda</span>}</p></td>
                <td className="px-4 py-3 align-middle"><p className="line-clamp-2 text-muted-foreground" title={r.andamento}>{r.andamento || "—"}</p></td>
                <td className="px-4 py-3 align-middle"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${COR[r.situacao] ?? "bg-muted text-muted-foreground"}`}>{LABEL[r.situacao] ?? r.situacao}</span></td>
                <td className="px-4 py-3 align-middle"><div className="flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-report-accent-soft text-report-accent"><UsersRound className="size-3.5" /></span><span className="line-clamp-2 text-xs font-medium">{r.responsavel_nome || "Sem responsável"}</span></div></td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground"><span className="line-clamp-2">{r.setor_nome || "—"}</span></td>
              </tr>)}
              {!loading && !rows.length && <tr><td colSpan={7} className="px-6 py-16 text-center"><Headphones className="mx-auto mb-3 size-8 text-muted-foreground/50" /><p className="font-semibold text-report-navy">Nenhum atendimento encontrado</p><p className="mt-1 text-sm text-muted-foreground">Altere os filtros para consultar outro período.</p></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <Dialog open={sendOpen} onOpenChange={(open) => { if (!sending) setSendOpen(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enviar relatório pelo WhatsApp</DialogTitle><DialogDescription>Selecione quem receberá o PDF do período de {de} a {ate}.</DialogDescription></DialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-sm font-semibold text-foreground">Contato</label>
          {contactsLoading ? <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando contatos…</div> : <ContactPicker leads={contacts} cardId={recipient?.id ?? ""} nome={recipient?.nome ?? ""} numero={recipient?.numero ?? ""} onSelect={setRecipient} />}
          <p className="text-xs text-muted-foreground">O documento será enviado pela conexão de WhatsApp da empresa.</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>Cancelar</Button><Button onClick={() => void sendPdf()} disabled={sending || !recipient}>{sending ? <Loader2 className="animate-spin" /> : <Send />}Enviar PDF</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
