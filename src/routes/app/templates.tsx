import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listHsmTemplates, listHsmInstances, deleteHsmTemplate, syncHsmTemplatesFromMeta,
  type HsmListItem,
} from "@/lib/hsm-templates.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Search, Plus, Download, MoreVertical, Loader2, FileText, RefreshCw,
} from "lucide-react";
import { brand } from "@/config/brand";
import { HelpTip } from "@/components/help-tip";
import { TemplateFormDialog } from "@/components/templates/template-form-dialog";
import { TemplateDetailDialog } from "@/components/templates/template-detail-dialog";

export const Route = createFileRoute("/app/templates")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Templates` },
      { name: "description", content: "Templates HSM da Meta para uso em campanhas." },
      { property: "og:title", content: `${brand.name} — Templates` },
      { property: "og:description", content: "Gerencie templates aprovados pela Meta para envio em massa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

const STATUS_BADGE: Record<string, string> = {
  aprovado: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  pendente: "bg-amber-50 text-amber-700 border border-amber-200",
  reprovado: "bg-red-50 text-red-700 border border-red-200",
  rascunho: "bg-muted text-muted-foreground border border-border",
};
const STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovado", pendente: "Pendente", reprovado: "Reprovado", rascunho: "Rascunho",
};
const CAT_LABEL: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };

function TemplatesPage() {
  const listFn = useServerFn(listHsmTemplates);
  const instancesFn = useServerFn(listHsmInstances);
  const deleteFn = useServerFn(deleteHsmTemplate);
  const syncFn = useServerFn(syncHsmTemplatesFromMeta);

  const [rows, setRows] = useState<HsmListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [aprovados, setAprovados] = useState(0);
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [instanceId, setInstanceId] = useState("all");
  const [categoria, setCategoria] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<HsmListItem> | null>(null);
  const [detail, setDetail] = useState<HsmListItem | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res: any = await listFn({ data: { search, status, instanceId, categoria, page, pageSize } });
      setRows(res.items); setTotal(res.total); setAprovados(res.aprovados);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao carregar"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [search, status, instanceId, categoria, page, pageSize]);
  useEffect(() => { void instancesFn().then(setInstances).catch(() => {}); }, []);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este template?")) return;
    try { await deleteFn({ data: { id } }); toast.success("Excluído"); setDetail(null); void reload(); }
    catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function handleSync() {
    try {
      const r: any = await syncFn({ data: { instanceId: instanceId === "all" ? undefined : instanceId } });
      if (r.ok) toast.success(`${r.imported} templates sincronizados`);
      else toast.info(r.reason ?? "Sincronização indisponível");
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const hasOfficial = instances.length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-[20px] sm:text-[26px] font-extrabold tracking-tight flex items-center gap-2">
            Templates <HelpTip text="Mensagens HSM pré-aprovadas pela Meta. Necessárias para iniciar conversas em campanhas via API Oficial do WhatsApp." />
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Mensagens pré-aprovadas pela Meta para campanhas.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="h-9 flex-1 sm:flex-none" onClick={() => void handleSync()}>
            <Download className="size-4 mr-1.5" /> <span className="sm:hidden">Sincronizar</span><span className="hidden sm:inline">Sincronizar com a Meta</span>
          </Button>
          <Button size="sm" className="h-9 flex-1 sm:flex-none" onClick={() => { setEditing({}); setFormOpen(true); }} disabled={!hasOfficial}>
            <Plus className="size-4 mr-1.5" /> Novo template
          </Button>
        </div>
      </div>


      {!hasOfficial && (
        <Card className="p-3 sm:p-4 bg-amber-50 border-amber-200 text-amber-900 text-[13px] sm:text-sm">
          Nenhuma conexão <b>API Oficial</b> encontrada. Templates HSM só funcionam com a WhatsApp Cloud API da Meta.
          Cadastre uma conexão em <a className="underline font-medium" href="/app/conexao">Conexões</a>.
        </Card>
      )}

      <div className="flex flex-wrap md:flex-nowrap gap-2 items-center">
        <div className="relative w-full md:flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Buscar template..." className="pl-9 h-9 md:h-10 bg-background" />
        </div>
        <Select value={instanceId} onValueChange={(v) => { setPage(1); setInstanceId(v); }}>
          <SelectTrigger className="h-9 md:h-10 flex-1 min-w-0 md:flex-none md:w-48"><SelectValue placeholder="Conexões" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as conexões</SelectItem>
            {instances.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.display_name || c.instance_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setPage(1); setStatus(v); }}>
          <SelectTrigger className="h-9 md:h-10 flex-1 min-w-0 md:flex-none md:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={(v) => { setPage(1); setCategoria(v); }}>
          <SelectTrigger className="h-9 md:h-10 flex-1 min-w-0 md:flex-none md:w-40"><SelectValue placeholder="Categorias" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {Object.entries(CAT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="size-9 md:size-10 shrink-0" aria-label="Atualizar" onClick={() => void reload()}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {/* Desktop table */}
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Nome</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Conexão</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Categoria</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Corpo</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Criado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">
                <Loader2 className="size-5 animate-spin inline text-muted-foreground" />
              </TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground text-sm">
                <FileText className="size-8 mx-auto mb-2 opacity-40" />
                Nenhum template ainda. Clique em <b>Novo template</b> para criar.
              </TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetail(r)}>
                <TableCell className="font-medium py-3.5">{r.nome}</TableCell>
                <TableCell className="text-sm">{r.instance_display_name || r.instance_name || "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{CAT_LABEL[r.categoria]}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[320px] truncate">{r.corpo}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Ações"><MoreVertical className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetail(r)}>Ver detalhes</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditing(r); setFormOpen(true); }}>Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void handleDelete(r.id)} className="text-red-600">Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="size-5 animate-spin inline text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm px-4">
              <FileText className="size-8 mx-auto mb-2 opacity-40" />
              Nenhum template ainda. Toque em <b>Novo template</b> para criar.
            </div>
          ) : rows.map((r) => (
            <div key={r.id} className="flex items-start gap-2 px-3 py-3" onClick={() => setDetail(r)}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-[14px] truncate">{r.nome}</span>
                  <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5">{r.corpo}</div>
                <div className="text-[11px] text-muted-foreground mt-1 truncate">
                  {CAT_LABEL[r.categoria]} · {r.instance_display_name || r.instance_name || "—"} · {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Ações"><MoreVertical className="size-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDetail(r)}>Ver detalhes</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setEditing(r); setFormOpen(true); }}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleDelete(r.id)} className="text-red-600">Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border-t text-xs text-muted-foreground">
          <div>{aprovados} aprovado{aprovados !== 1 ? "s" : ""} · {total} no total</div>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => { setPage(1); setPageSize(Number(v)); }}>
              <SelectTrigger className="h-8 w-[92px] sm:w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / página</SelectItem>
                <SelectItem value="25">25 / página</SelectItem>
                <SelectItem value="50">50 / página</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="px-2" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>Anterior</Button>
            <span className="whitespace-nowrap">{page}/{pages}</span>
            <Button size="sm" variant="outline" className="px-2" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}>Próxima</Button>
          </div>
        </div>
      </Card>



      {formOpen && (
        <TemplateFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          initial={editing}
          instances={instances}
          onSaved={() => void reload()}
        />
      )}

      <TemplateDetailDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        template={detail}
        onEdit={() => { setEditing(detail); setDetail(null); setFormOpen(true); }}
        onDelete={() => detail && void handleDelete(detail.id)}
      />
    </div>
  );
}
