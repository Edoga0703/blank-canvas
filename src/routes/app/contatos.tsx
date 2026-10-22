import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { brand } from "@/config/brand";
import { toast } from "sonner";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { LeadDrawer, type LeadCard, type Stage, type Member } from "@/components/crm/lead-drawer";
import { Plus, Upload, Search, Filter, MoreVertical, ShieldOff, Shield, Users, UserCheck, UserX, ChevronsUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import Papa from "papaparse";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createContact, importContacts } from "@/lib/plan.functions";
import { addBlock, removeBlock, listBlocklist } from "@/lib/campaigns.functions";
import { backfillLeadPhotos } from "@/lib/lead-photos.functions";
import { PlanUsageBadge } from "@/components/plan-usage-badge";
import { Download, RefreshCw } from "lucide-react";

import { usePlanFeatures } from "@/hooks/use-plan-features";

export const Route = createFileRoute("/app/contatos")({
  head: () => ({ meta: [{ title: `${brand.name} — Contatos` }] }),
  component: ContatosPage,
});

type SortKey = "nome" | "ultima_em" | "valor";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

function ContatosPage() {
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id;
  const navigate = useNavigate();
  const plan = usePlanFeatures();
  const [exportBusy, setExportBusy] = useState(false);

  const createContactFn = useServerFn(createContact);
  const importContactsFn = useServerFn(importContacts);
  const addBlockFn = useServerFn(addBlock);
  const removeBlockFn = useServerFn(removeBlock);
  const listBlocklistFn = useServerFn(listBlocklist);
  const backfillPhotosFn = useServerFn(backfillLeadPhotos);
  const [photosBusy, setPhotosBusy] = useState(false);

  const [cards, setCards] = useState<LeadCard[]>([]);
  const [total, setTotal] = useState(0);
  const [totalActive, setTotalActive] = useState(0);
  const [stages, setStages] = useState<Stage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [blockMap, setBlockMap] = useState<Map<string, { id: string; tipo: "optout" | "blocklist" }>>(new Map());
  const [blockedCount, setBlockedCount] = useState(0);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [stageId, setStageId] = useState<string>("todos");
  const [ownerId, setOwnerId] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativos" | "bloqueados" | "internos">("todos");
  const [sortKey, setSortKey] = useState<SortKey>("ultima_em");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const [active, setActive] = useState<LeadCard | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoNumero, setNovoNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [debounced, stageId, ownerId, statusFilter, sortKey, sortDir]);

  const loadMeta = useCallback(async () => {
    if (!companyId) return;
    const [{ data: st }, { data: cu }, bl] = await Promise.all([
      supabase.from("crm_stage").select("id,nome,cor,ordem,tipo").eq("company_id", companyId).order("ordem", { ascending: true }),
      supabase.from("company_user").select("user_id").eq("company_id", companyId).eq("ativo", true),
      listBlocklistFn(),
    ]);
    const memberRows = (cu ?? []) as { user_id: string }[];
    const memberIds = memberRows.map((m) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase.from("profiles").select("user_id,nome,email").in("user_id", memberIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    setStages((st ?? []) as any);
    setMembers(memberRows.map((m) => ({
      user_id: m.user_id,
      email: profileById.get(m.user_id)?.email ?? null,
      nome: profileById.get(m.user_id)?.nome ?? null,
    })));
    const m = new Map<string, { id: string; tipo: "optout" | "blocklist" }>();
    for (const b of (bl.blocklist ?? []) as any[]) m.set(b.numero, { id: b.id, tipo: "blocklist" });
    for (const o of (bl.optouts ?? []) as any[]) if (!m.has(o.numero)) m.set(o.numero, { id: o.id, tipo: "optout" });
    setBlockMap(m);
    setBlockedCount(m.size);
  }, [companyId, listBlocklistFn]);

  const loadPage = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      let q = supabase.from("crm_cards").select("*", { count: "exact" }).eq("company_id", companyId);

      if (statusFilter === "internos") {
        q = q.eq("tipo_contato", "interno");
      } else if (statusFilter === "ativos" || statusFilter === "bloqueados") {
        // Ativos e bloqueados continuam focados nos leads; "Todos" inclui a base inteira.
        q = q.or(`tipo_contato.is.null,tipo_contato.neq.interno`);
      }



      if (stageId !== "todos") q = q.eq("stage_id", stageId);
      if (ownerId !== "todos") q = ownerId === "sem" ? q.is("owner_id", null) : q.eq("owner_id", ownerId);
      if (debounced) q = q.or(`nome.ilike.%${debounced}%,numero.ilike.%${debounced}%`);
      q = q.order(sortKey, { ascending: sortDir === "asc", nullsFirst: false });
      const from = page * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);
      const { data, count } = await q;
      setCards((data ?? []) as any);
      setTotal(count ?? 0);

      // KPI: active = updated in last 30d
      const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
      let activeQuery = supabase.from("crm_cards").select("id", { count: "exact", head: true })
        .eq("company_id", companyId).gte("ultima_em", cutoff);

      const { count: act } = await activeQuery;
      setTotalActive(act ?? 0);
    } finally {
      setLoading(false);
    }
  }, [companyId, stageId, ownerId, debounced, statusFilter, sortKey, sortDir, page]);

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { void loadPage(); }, [loadPage]);

  // Atualização automática das fotos (1x por sessão, em segundo plano).
  useEffect(() => {
    if (!companyId || photosBusy) return;
    const key = `photos-sync:${companyId}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
    sessionStorage?.setItem(key, "1");
    setPhotosBusy(true);
    (async () => {
      try {
        const r: any = await backfillPhotosFn({ data: { companyId } });
        if (r?.ok && (r.updated ?? 0) > 0) void loadPage();
      } catch { /* silencioso */ }
      finally { setPhotosBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);


  const filteredCards = useMemo(() => {
    if (statusFilter === "todos") return cards;
    if (statusFilter === "bloqueados") return cards.filter((c) => blockMap.has(c.numero));
    return cards.filter((c) => !blockMap.has(c.numero));
  }, [cards, statusFilter, blockMap]);

  function stageOf(card: LeadCard) { return stages.find((s) => s.id === card.stage_id) ?? null; }
  function memberOf(id: string | null) { return members.find((m) => m.user_id === id) ?? null; }

  function abrirConversa(numero: string) {
    navigate({ to: "/app/conversas", search: { n: numero } });
  }

  async function criarNovo(abrirChat = false) {
    const numero = novoNumero.replace(/\D/g, "");
    if (!numero) return;
    try {
      await createContactFn({ data: { numero, nome: novoNome.trim() || null } });
      toast.success("Contato criado");
      setNovoNome(""); setNovoNumero(""); setNewOpen(false);
      await Promise.all([loadPage(), plan.refresh()]);
      if (abrirChat) abrirConversa(numero);
    } catch (e: any) { toast.error(e?.message || "Falha ao criar"); }
  }

  /** Baixa todos os contatos que atendem aos filtros atuais (sem paginação). */
  async function fetchAllForExport(): Promise<any[]> {
    if (!companyId) return [];
    const out: any[] = [];
    const CHUNK = 1000;
    for (let i = 0; i < 50; i++) {
      let q = supabase.from("crm_cards").select("nome,numero,email,valor,ultima_em,stage_id,owner_id,tipo_contato,campos_extras,tags").eq("company_id", companyId);
      if (statusFilter === "internos") q = q.eq("tipo_contato", "interno");
      else if (statusFilter === "ativos" || statusFilter === "bloqueados") q = q.or(`tipo_contato.is.null,tipo_contato.neq.interno`);
      if (stageId !== "todos") q = q.eq("stage_id", stageId);
      if (ownerId !== "todos") q = ownerId === "sem" ? q.is("owner_id", null) : q.eq("owner_id", ownerId);
      if (debounced) q = q.or(`nome.ilike.%${debounced}%,numero.ilike.%${debounced}%`);
      const { data, error } = await q.order("ultima_em", { ascending: false, nullsFirst: false }).range(i * CHUNK, i * CHUNK + CHUNK - 1);
      if (error) throw error;
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < CHUNK) break;
    }
    if (statusFilter === "bloqueados") return out.filter((c) => blockMap.has(c.numero));
    if (statusFilter === "ativos") return out.filter((c) => !blockMap.has(c.numero));
    return out;
  }

  /** Modelo de planilha para o cliente preencher e importar. */
  function baixarModelo() {
    const exemplo = [
      { nome: "Maria Silva", telefone: "5511999998888", email: "maria@email.com" },
      { nome: "João Souza", telefone: "5511988887777", email: "" },
    ];
    baixarCSV("modelo-importacao-contatos.csv", Papa.unparse(exemplo, { delimiter: ";", columns: ["nome", "telefone", "email"] }));
    toast.success("Modelo baixado. Preencha e importe a planilha.");
  }

  function baixarCSV(nomeArquivo: string, csv: string) {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nomeArquivo; a.click();
    URL.revokeObjectURL(url);
  }

  /** Telefone em E.164 (padrão exigido pelo Meta). Assume Brasil quando sem DDI. */
  function toE164(numero: string) {
    let d = String(numero || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.length <= 11) d = `55${d}`;
    return `+${d}`;
  }

  async function exportar(formato: "meta" | "completo") {
    if (exportBusy) return;
    setExportBusy(true);
    const t = toast.loading("Preparando exportação…");
    try {
      const rows = await fetchAllForExport();
      if (!rows.length) { toast.error("Nenhum contato para exportar", { id: t }); return; }
      const stamp = new Date().toISOString().slice(0, 10);

      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Capi Conversa";
      const fmtBR = (n: string) => {
        const d = String(n || "").replace(/\D/g, "");
        if (!d) return "";
        const full = d.length <= 11 ? `55${d}` : d;
        if (!full.startsWith("55")) return `+${full}`;
        const l = full.slice(2);
        if (l.length === 11) return `+55 (${l.slice(0, 2)}) ${l.slice(2, 7)}-${l.slice(7)}`;
        if (l.length === 10) return `+55 (${l.slice(0, 2)}) ${l.slice(2, 6)}-${l.slice(6)}`;
        return `+${full}`;
      };
      const montar = (nome: string, cols: { header: string; key: string; width: number; numFmt?: string }[], data: any[], zebra: boolean) => {
        const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }] });
        ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
        data.forEach((r) => ws.addRow(r));
        const head = ws.getRow(1);
        head.height = 24;
        head.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 11 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B22FE" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });
        ws.eachRow((row, i) => {
          if (i === 1) return;
          row.height = 20;
          row.eachCell({ includeEmpty: true }, (cell, ci) => {
            cell.font = { name: "Arial", size: 10 };
            cell.alignment = { vertical: "middle", wrapText: false };
            cell.border = { bottom: { style: "thin", color: { argb: "FFE3E6EF" } } };
            if (zebra && i % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F5F9" } };
            const f = cols[ci - 1]?.numFmt; if (f) cell.numFmt = f;
          });
        });
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      };
      const baixar = async (arq: string) => {
        const buf = await wb.xlsx.writeBuffer();
        const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        const a = document.createElement("a"); a.href = url; a.download = arq; a.click(); URL.revokeObjectURL(url);
      };

      if (formato === "meta") {
        const data = rows.map((c) => {
          const partes = String(c.nome ?? "").trim().split(/\s+/).filter(Boolean);
          return {
            phone: toE164(c.numero).replace("+", ""),
            email: (c.email ?? "").toString().trim().toLowerCase(),
            fn: (partes[0] ?? "").toLowerCase(),
            ln: (partes.length > 1 ? partes.slice(1).join(" ") : "").toLowerCase(),
            // Country dinámico o universal\n            country: (c.numero || "").startsWith("58") ? "ve" : (c.numero || "").startsWith("57") ? "co" : (c.numero || "").startsWith("1") ? "us" : (c.numero || "").startsWith("55") ? "br" : "intl",
          };
        }).filter((r) => r.phone || r.email);
        montar("Público Meta", [
          { header: "phone", key: "phone", width: 20, numFmt: "@" },
          { header: "email", key: "email", width: 34 },
          { header: "fn", key: "fn", width: 18 },
          { header: "ln", key: "ln", width: 24 },
          { header: "country", key: "country", width: 10 },
        ], data, false);
        await baixar(`meta-publico-personalizado-${stamp}.xlsx`);
        toast.success(`${data.length} contato(s) exportados no formato Meta Ads`, { id: t });
      } else {
        const data = rows.map((c: any) => ({
          nome: c.nome ?? "",
          telefone: fmtBR(c.numero),
          email: c.email ?? "",
          tags: (c.tags ?? []).join(", "),
          etapa: stages.find((s) => s.id === c.stage_id)?.nome ?? "",
          responsavel: members.find((m) => m.user_id === c.owner_id)?.nome ?? members.find((m) => m.user_id === c.owner_id)?.email ?? "",
          valor: c.valor != null && c.valor !== "" ? Number(c.valor) : null,
          ultima: c.ultima_em ? new Date(c.ultima_em).toLocaleString("pt-BR") : "",
          bloqueado: blockMap.has(c.numero) ? "Sim" : "Não",
          extras: (c.campos_extras?.respostas ?? []).map((r: any) => `${r.label}: ${r.valor}`).join(" | "),
        }));
        montar("Contatos", [
          { header: "Nome", key: "nome", width: 30 },
          { header: "Telefone", key: "telefone", width: 22 },
          { header: "E-mail", key: "email", width: 32 },
          { header: "Tags", key: "tags", width: 28 },
          { header: "Etapa", key: "etapa", width: 20 },
          { header: "Responsável", key: "responsavel", width: 24 },
          { header: "Valor", key: "valor", width: 15, numFmt: '"$" #,##0.00' },
          { header: "Última interação", key: "ultima", width: 22 },
          { header: "Bloqueado", key: "bloqueado", width: 12 },
          { header: "Informações extras", key: "extras", width: 50 },
        ], data, true);
        await baixar(`contatos-${stamp}.xlsx`);
        toast.success(`${data.length} contato(s) exportados`, { id: t });
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao exportar", { id: t });
    } finally { setExportBusy(false); }
  }

  function importCSV(file: File) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const rows = (res.data as any[]).map((r) => {
          const nome = (r.nome ?? r.name ?? r.Nome ?? "").toString().trim() || null;
          const numero = (r.telefone ?? r.phone ?? r.Telefone ?? r.numero ?? "").toString().replace(/\D/g, "");
          return { nome, numero };
        }).filter((r) => r.numero.length >= 8);
        if (rows.length === 0) return toast.error("Nenhuma linha válida (precisa de coluna nome/telefone).");
        try {
          const r = await importContactsFn({ data: { contatos: rows } });
          toast.success(`${r.inseridos ?? rows.length} contato(s) importado(s)`);
          await Promise.all([loadPage(), plan.refresh()]);
        } catch (e: any) { toast.error(e?.message || "Falha ao importar"); }
      },
      error: (e) => toast.error(e.message),
    });
  }

  async function toggleBlock(c: LeadCard) {
    const entry = blockMap.get(c.numero);
    try {
      if (entry) {
        await removeBlockFn({ data: { id: entry.id, tipo: entry.tipo } });
        toast.success("Contato desbloqueado");
      } else {
        await addBlockFn({ data: { numero: c.numero, motivo: "Bloqueado manualmente" } });
        toast.success("Contato bloqueado");
      }
      await loadMeta();
    } catch (e: any) { toast.error(e?.message || "Falha"); }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  const sortIcon = (k: SortKey) => sortKey !== k
    ? <ChevronsUpDown className="size-3 opacity-40" />
    : sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters = (stageId !== "todos" ? 1 : 0) + (ownerId !== "todos" ? 1 : 0) + (statusFilter !== "todos" ? 1 : 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Title */}
      <div>
        <h1 className="font-display text-[20px] sm:text-[26px] font-extrabold tracking-tight flex items-center gap-2">
          Contatos <HelpTip text="Sua base de clientes. Cada contato representa um número de WhatsApp e guarda todo o histórico de conversa e dados do CRM." />
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Todos os leads gerados pelo WhatsApp.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <KpiCard icon={<Users className="size-4" />} label="Total" value={total} tone="brand" />
        <KpiCard icon={<UserCheck className="size-4" />} label="Ativos (30d)" value={totalActive} tone="ok" />
        <KpiCard icon={<UserX className="size-4" />} label="Bloqueados" value={blockedCount} tone="warn" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-full sm:max-w-lg order-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar nome ou número…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 sm:h-10" />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-9 sm:h-10 order-2 shrink-0">
              <Filter className="size-4" /> <span className="hidden xs:inline sm:inline">Filtros</span>
              {activeFilters > 0 && <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 leading-none">{activeFilters}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[calc(100vw-2rem)] sm:w-72 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Etapa</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as etapas</SelectItem>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="sem">Sem responsável</SelectItem>
                  {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome || m.email || "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                   <SelectItem value="ativos">Ativos</SelectItem>
                  <SelectItem value="bloqueados">Bloqueados</SelectItem>
                  <SelectItem value="internos">Internos / Parceiros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="w-full"
                onClick={() => { setStageId("todos"); setOwnerId("todos"); setStatusFilter("todos"); }}>
                Limpar filtros
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <div className="order-4 sm:order-3 w-full sm:w-auto sm:ml-auto flex items-center gap-2">


          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.currentTarget.value = ""; }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 sm:h-10 flex-1 sm:flex-none" disabled={exportBusy}>
                <Download className="size-4 sm:mr-2" /> <span className="ml-2 sm:ml-0">Exportar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={() => exportar("meta")}>
                <div>
                  <div className="font-medium">Meta Ads (remarketing)</div>
                  <div className="text-[11px] text-muted-foreground">CSV pronto para Público Personalizado</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportar("completo")}>
                <div>
                  <div className="font-medium">Planilha completa</div>
                  <div className="text-[11px] text-muted-foreground">Nome, telefone, etapa, responsável, valor</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 sm:h-10 flex-1 sm:flex-none">
                <Upload className="size-4 sm:mr-2" /> <span className="ml-2 sm:ml-0">Importar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={baixarModelo}>
                <div>
                  <div className="font-medium">Baixar modelo de planilha</div>
                  <div className="text-[11px] text-muted-foreground">Colunas nome, telefone e email — preencha e importe</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                <div>
                  <div className="font-medium">Enviar planilha preenchida</div>
                  <div className="text-[11px] text-muted-foreground">Arquivo CSV com os contatos</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="h-9 sm:h-10 flex-1 sm:flex-none" onClick={() => setNewOpen(true)}>
            <Plus className="size-4 sm:mr-2" /> <span className="ml-2 sm:ml-0">Novo contato</span>
          </Button>
        </div>
      </div>


      {/* Table */}
      <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] overflow-hidden">
        <div className="hidden lg:grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2.5fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,2fr)_80px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-[color:var(--panel-2)] px-5 py-3 border-b border-[color:var(--hairline)]">
          <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("nome")}>Contato {sortIcon("nome")}</button>
          <div>Número</div>
          <div>Tags</div>
          <div>Etapa</div>
          <div>Responsável</div>
          <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("valor")}>Valor {sortIcon("valor")}</button>
          <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("ultima_em")}>Última atividade {sortIcon("ultima_em")}</button>
          <div />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : filteredCards.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</div>
        ) : (
          <ul className="divide-y divide-[color:var(--hairline)]">
            {filteredCards.map((c) => {
              const st = stageOf(c);
              const owner = memberOf(c.owner_id);
              const blocked = blockMap.has(c.numero);
              const valor = (c.valor ?? 0) > 0 ? `R$ ${Number(c.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
              const data = new Date(c.ultima_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
              return (
                <li key={c.id} className="group">
                  {/* Desktop */}
                  <div className="hidden lg:grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2.5fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,2fr)_80px] px-5 py-3 items-center text-[14px] hover:bg-[color:var(--panel-2)] transition-colors">
                    <button onClick={() => setActive(c)} className="flex items-center gap-3 min-w-0 text-left">
                      <InitialsAvatar name={c.nome || c.numero} size={36} src={c.foto_url ?? undefined} />
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-2">
                          {c.nome || "—"}
                          {blocked && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">
                              <ShieldOff className="size-2.5" /> Bloqueado
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{c.origem || "—"}</div>
                      </div>
                    </button>
                    <button onClick={() => setActive(c)} className="text-muted-foreground font-mono text-[12.5px] truncate text-left">{c.numero}</button>
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {(c.tags ?? []).length ? (
                        <>
                          {(c.tags as string[]).slice(0, 3).map((t) => (
                            <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground truncate max-w-[120px]" title={t}>{t}</span>
                          ))}
                          {(c.tags as string[]).length > 3 && <span className="text-[11px] text-muted-foreground" title={(c.tags as string[]).slice(3).join(", ")}>+{(c.tags as string[]).length - 3}</span>}
                        </>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                    <div>
                      {st ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ring-1"
                          style={{ background: `color-mix(in oklab, ${st.cor} 18%, transparent)`, color: st.cor, borderColor: `color-mix(in oklab, ${st.cor} 35%, transparent)` } as any}>
                          <span className="size-1.5 rounded-full" style={{ background: st.cor }} />
                          {st.nome}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      {owner ? (
                        <>
                          <InitialsAvatar name={owner.nome || owner.email || "?"} size={24} />
                          <span className="text-[13px] truncate">{owner.nome || owner.email}</span>
                        </>
                      ) : <span className="text-xs text-muted-foreground">Sem responsável</span>}
                    </div>
                    <div className="font-semibold">{valor ?? <span className="text-muted-foreground font-normal">—</span>}</div>
                    <div className="text-muted-foreground text-[12.5px] truncate">{data}</div>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="size-8 shrink-0" title="Abrir conversa"
                        onClick={(e) => { e.stopPropagation(); abrirConversa(c.numero); }}>
                        <MessageSquare className="size-4" />
                      </Button>
                      <RowMenu blocked={blocked} onOpen={() => setActive(c)} onChat={() => abrirConversa(c.numero)} onToggleBlock={() => toggleBlock(c)} />
                    </div>
                  </div>

                  {/* Mobile */}
                  <div className="lg:hidden flex items-start gap-3 px-4 py-3">
                    <button onClick={() => setActive(c)} className="flex-1 flex items-start gap-3 text-left min-w-0">
                      <InitialsAvatar name={c.nome || c.numero} size={40} src={c.foto_url ?? undefined} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold truncate text-[14px] flex items-center gap-1.5">
                            {c.nome || "—"}
                            {blocked && <ShieldOff className="size-3 text-red-600" />}
                          </div>
                          <div className="text-[11px] text-muted-foreground shrink-0">{data}</div>
                        </div>
                        <div className="text-[12px] text-muted-foreground font-mono truncate mt-0.5">{c.numero}</div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {st && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1"
                              style={{ background: `color-mix(in oklab, ${st.cor} 18%, transparent)`, color: st.cor, borderColor: `color-mix(in oklab, ${st.cor} 35%, transparent)` } as any}>
                              <span className="size-1.5 rounded-full" style={{ background: st.cor }} />
                              {st.nome}
                            </span>
                          )}
                          {valor && <span className="text-[12px] font-semibold">{valor}</span>}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="size-8 shrink-0" title="Abrir conversa"
                        onClick={(e) => { e.stopPropagation(); abrirConversa(c.numero); }}>
                        <MessageSquare className="size-4" />
                      </Button>
                      <RowMenu blocked={blocked} onOpen={() => setActive(c)} onChat={() => abrirConversa(c.numero)} onToggleBlock={() => toggleBlock(c)} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-t border-[color:var(--hairline)] text-xs sm:text-sm">
            <div className="text-muted-foreground truncate">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
            </div>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="px-1 sm:px-2 text-muted-foreground whitespace-nowrap"><span className="hidden sm:inline">Página </span>{page + 1}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {companyId && (
        <LeadDrawer
          card={active} stages={stages} members={members} companyId={companyId}
          onClose={() => setActive(null)}
          onChanged={() => { void loadPage(); }}
        />
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do contato" /></div>
            <div className="space-y-1.5"><Label>Telefone (com DDI)</Label><Input value={novoNumero} onChange={(e) => setNovoNumero(e.target.value)} placeholder="5511999998888" inputMode="numeric" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button variant="outline" onClick={() => criarNovo(false)} disabled={!novoNumero.trim()}>Criar</Button>
            <Button onClick={() => criarNovo(true)} disabled={!novoNumero.trim()}>
              <MessageSquare className="size-4 mr-2" /> Criar e conversar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "brand" | "ok" | "warn" }) {
  const styles = {
    brand: "bg-primary/10 text-primary",
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-red-50 text-red-700",
  }[tone];
  return (
    <div className="rounded-xl sm:rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel)] p-2.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3">
      <div className={`size-7 sm:size-10 rounded-lg sm:rounded-xl grid place-items-center shrink-0 ${styles}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg sm:text-2xl font-extrabold tabular-nums leading-tight">{value.toLocaleString("pt-BR")}</div>
      </div>

    </div>
  );
}

function RowMenu({ blocked, onOpen, onChat, onToggleBlock }: { blocked: boolean; onOpen: () => void; onChat: () => void; onToggleBlock: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={(e) => e.stopPropagation()}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onChat}><MessageSquare className="size-4 mr-2" /> Abrir conversa</DropdownMenuItem>
        <DropdownMenuItem onClick={onOpen}>Abrir detalhes</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleBlock} className={blocked ? "" : "text-red-600 focus:text-red-600"}>
          {blocked ? (<><Shield className="size-4 mr-2" /> Desbloquear</>) : (<><ShieldOff className="size-4 mr-2" /> Bloquear</>)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
