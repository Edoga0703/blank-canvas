import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ArrowUpDown, CalendarDays, Download, MoreVertical, Search, X, CalendarX2, FileText, FileSpreadsheet, Check,
} from "lucide-react";

import { exportarCompromissosPdf } from "./export-pdf";
import {
  STATUS_COMPROMISSO, StatusBadge, fmtData, fmtHora, iniciais,
  type Item, type Profissional, type Servico,
} from "./shared";

export type Filtros = {
  busca: string;
  responsavel: string;
  servico: string;
  status: string;
  canal: string;
  periodo: string;
  de?: string;
  ate?: string;
};

export const filtrosVazios: Filtros = {
  busca: "", responsavel: "todos", servico: "todos", status: "todos", canal: "todos", periodo: "todos",
  de: "", ate: "",
};

type Props = {
  itens: Item[];
  profissionais: Profissional[];
  servicos: Servico[];
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
  podeEditar: boolean;
  onAbrir: (i: Item) => void;
  onEditar: (i: Item) => void;
  onStatus: (i: Item, status: string) => void;
  onMassa: (ids: string[], acao: "cancelar" | "excluir" | "responsavel" | "reagendar", extra?: any) => void;
  onCriar: () => void;
};

const POR_PAGINA = 20;

const ROTULOS_PERIODO: Record<string, string> = {
  todos: "Todo período", hoje: "Hoje", semana: "Próximos 7 dias", mes: "Este mês", passado: "Passados",
};

export function ListView({
  itens, profissionais, servicos, filtros, setFiltros, podeEditar,
  onAbrir, onEditar, onStatus, onMassa, onCriar,
}: Props) {
  const [ordem, setOrdem] = useState<{ campo: "data" | "contato" | "status"; asc: boolean }>({ campo: "data", asc: true });
  const [pagina, setPagina] = useState(1);
  const [selecao, setSelecao] = useState<string[]>([]);
  const [popPeriodo, setPopPeriodo] = useState(false);
  const [mostrarDatas, setMostrarDatas] = useState(false);
  const [tempDe, setTempDe] = useState("");
  const [tempAte, setTempAte] = useState("");

  const brlData = (s?: string) => (s ? s.split("-").reverse().join("/") : "");
  const labelPeriodo =
    filtros.periodo === "personalizado"
      ? filtros.de && filtros.ate ? `${brlData(filtros.de)} – ${brlData(filtros.ate)}` : "Personalizado…"
      : ROTULOS_PERIODO[filtros.periodo] || "Período";
  const escolherPeriodo = (v: string) => {
    setFiltros({ ...filtros, periodo: v, ...(v === "personalizado" ? {} : { de: "", ate: "" }) });
    setPagina(1);
    setPopPeriodo(false);
  };
  const aplicarPersonalizado = () => {
    if (!tempDe || !tempAte) return;
    setFiltros({ ...filtros, periodo: "personalizado", de: tempDe, ate: tempAte });
    setPagina(1);
    setPopPeriodo(false);
  };

  const ordenados = useMemo(() => {
    const arr = itens.slice();
    arr.sort((a, b) => {
      let r = 0;
      if (ordem.campo === "data") r = a.agendado_para.localeCompare(b.agendado_para);
      else if (ordem.campo === "contato") r = (a.nome_lead || "").localeCompare(b.nome_lead || "");
      else r = a.status.localeCompare(b.status);
      return ordem.asc ? r : -r;
    });
    return arr;
  }, [itens, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = ordenados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const grupos = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of visiveis) {
      const k = fmtData(i.agendado_para);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    }
    return Array.from(map.entries());
  }, [visiveis]);

  const chips: { label: string; limpar: () => void }[] = [];
  if (filtros.busca) chips.push({ label: `Busca: ${filtros.busca}`, limpar: () => setFiltros({ ...filtros, busca: "" }) });
  if (filtros.responsavel !== "todos") {
    const p = profissionais.find((x) => x.user_id === filtros.responsavel);
    chips.push({ label: p?.nome || "Responsável", limpar: () => setFiltros({ ...filtros, responsavel: "todos" }) });
  }
  if (filtros.servico !== "todos") {
    const s = servicos.find((x) => x.id === filtros.servico);
    chips.push({ label: s?.nome || "Serviço", limpar: () => setFiltros({ ...filtros, servico: "todos" }) });
  }
  if (filtros.status !== "todos") {
    chips.push({ label: STATUS_COMPROMISSO[filtros.status]?.label || filtros.status, limpar: () => setFiltros({ ...filtros, status: "todos" }) });
  }
  if (filtros.periodo !== "todos") {
    const brl = (s?: string) => (s ? s.split("-").reverse().join("/") : "");
    const rotulos: Record<string, string> = {
      hoje: "Hoje", semana: "Próximos 7 dias", mes: "Este mês", passado: "Passados",
      personalizado: `Período: ${brl(filtros.de) || "início"} até ${brl(filtros.ate) || "fim"}`,
    };
    chips.push({
      label: rotulos[filtros.periodo] || filtros.periodo,
      limpar: () => setFiltros({ ...filtros, periodo: "todos", de: "", ate: "" }),
    });
  }

  function exportarPdf() {
    exportarCompromissosPdf({
      itens: ordenados,
      servicos,
      profissionais,
      filtrosResumo: chips.map((c) => c.label),
    });
  }

  function exportar() {
    const linhas = [
      ["Data", "Hora", "Contato", "Telefone", "Serviço", "Responsável", "Status"].join(";"),
      ...ordenados.map((i) => [
        fmtData(i.agendado_para), fmtHora(i.agendado_para), i.nome_lead || "", i.numero || "",
        servicos.find((s) => s.id === i.servico_id)?.nome || "",
        profissionais.find((p) => p.user_id === i.profissional_id)?.nome || "",
        STATUS_COMPROMISSO[i.status]?.label || i.status,
      ].join(";")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${linhas}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "agendamentos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const todosVisiveis = visiveis.length > 0 && visiveis.every((i) => selecao.includes(i.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Buscar agendamentos"
            className="pl-8 h-8 text-xs"
            placeholder="Buscar por nome, telefone ou empresa"
            value={filtros.busca}
            onChange={(e) => { setFiltros({ ...filtros, busca: e.target.value }); setPagina(1); }}
          />
        </div>
        <Select value={filtros.responsavel} onValueChange={(v) => setFiltros({ ...filtros, responsavel: v })}>
          <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Responsável"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos responsáveis</SelectItem>
            {profissionais.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtros.status} onValueChange={(v) => setFiltros({ ...filtros, status: v })}>
          <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_COMPROMISSO).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Popover open={popPeriodo} onOpenChange={(o) => { setPopPeriodo(o); if (o) { setMostrarDatas(filtros.periodo === "personalizado"); setTempDe(filtros.de || ""); setTempAte(filtros.ate || ""); } }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-[160px] justify-start text-xs font-normal" aria-label="Período">
              <CalendarDays className="w-3.5 h-3.5 mr-1 shrink-0 text-muted-foreground" />
              <span className="truncate">{labelPeriodo}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1.5">
            {!mostrarDatas ? (
              <div className="flex flex-col">
                {Object.entries(ROTULOS_PERIODO).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent",
                      filtros.periodo === k && "bg-accent font-medium",
                    )}
                    onClick={() => escolherPeriodo(k)}
                  >
                    {label}
                  </button>
                ))}
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent",
                    filtros.periodo === "personalizado" && "bg-accent font-medium",
                  )}
                  onClick={() => setMostrarDatas(true)}
                >
                  Personalizado…
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-1.5">
                <p className="text-xs font-medium">Selecionar período</p>
                <div className="flex flex-col gap-1.5">
                  <Input
                    type="date"
                    aria-label="Data inicial"
                    className="h-8 text-xs"
                    value={tempDe}
                    onChange={(e) => setTempDe(e.target.value)}
                  />
                  <Input
                    type="date"
                    aria-label="Data final"
                    className="h-8 text-xs"
                    value={tempAte}
                    min={tempDe || undefined}
                    onChange={(e) => setTempAte(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMostrarDatas(false)}>
                    Voltar
                  </Button>
                  <Button size="sm" className="h-7 px-3 text-xs" disabled={!tempDe || !tempAte} onClick={aplicarPersonalizado}>
                    Aplicar
                  </Button>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Download className="w-4 h-4 mr-1" /> Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportarPdf}>
              <FileText className="w-4 h-4 mr-2" /> Relatório em PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportar}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Planilha CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {c.label}
              <button type="button" aria-label={`Remover filtro ${c.label}`} onClick={c.limpar}><X className="w-3 h-3" /></button>
            </Badge>
          ))}
          <Button variant="link" size="sm" className="h-6 px-1 text-xs" onClick={() => setFiltros({ ...filtrosVazios })}>
            Limpar filtros
          </Button>
        </div>
      )}

      {selecao.length > 0 && podeEditar && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 p-2 text-xs">
          <span className="font-medium">{selecao.length} selecionado(s)</span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => { onMassa(selecao, "reagendar", { minutos: 1440 }); setSelecao([]); }}>
            Adiar 1 dia
          </Button>
          <Select onValueChange={(v) => { onMassa(selecao, "responsavel", { profissional_id: v === "none" ? null : v }); setSelecao([]); }}>
            <SelectTrigger className="h-7 w-[170px]" aria-label="Alterar responsável"><SelectValue placeholder="Alterar responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem responsável</SelectItem>
              {profissionais.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-7" onClick={() => { onMassa(selecao, "cancelar"); setSelecao([]); }}>
            Cancelar
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelecao([])}>Limpar seleção</Button>
        </div>
      )}

      {ordenados.length === 0 ? (
        <EmptyAgenda onCriar={onCriar} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <Checkbox
              aria-label="Selecionar todos"
              checked={todosVisiveis}
              onCheckedChange={(v) =>
                setSelecao(v ? Array.from(new Set([...selecao, ...visiveis.map((i) => i.id)])) : [])
              }
            />
            <span>Selecionar todos desta página</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => setOrdem({ campo: "data", asc: ordem.campo === "data" ? !ordem.asc : true })}
              >
                Data <ArrowUpDown className="w-3 h-3" />
              </button>
              <span>·</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => setOrdem({ campo: "contato", asc: ordem.campo === "contato" ? !ordem.asc : true })}
              >
                Contato <ArrowUpDown className="w-3 h-3" />
              </button>
              <span>·</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => setOrdem({ campo: "status", asc: ordem.campo === "status" ? !ordem.asc : true })}
              >
                Status <ArrowUpDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {grupos.map(([dia, linhas]) => (
            <section key={`g-${dia}`} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{dia}</h3>
                <span className="text-[11px] text-muted-foreground">· {linhas.length} agendamento(s)</span>
              </div>

              {linhas.map((i) => {
                const selecionado = selecao.includes(i.id);
                const concluido = i.status === "concluido" || i.status === "cancelado";
                return (
                  <div
                    key={i.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onAbrir(i)}
                    onKeyDown={(e) => { if (e.key === "Enter") onAbrir(i); }}
                    className={`group flex cursor-pointer items-center rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-md hover:border-primary/30 ${
                      selecionado ? "border-primary/50 ring-1 ring-primary/20" : ""
                    } ${concluido ? "opacity-70" : ""}`}
                  >
                    <div className="flex-none border-r pr-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`Selecionar ${i.nome_lead || "compromisso"}`}
                        title="Selecionar para ações em lote"
                        checked={selecionado}
                        onCheckedChange={(v) => setSelecao(v ? [...selecao, i.id] : selecao.filter((x) => x !== i.id))}
                      />
                    </div>

                    <div className="w-24 flex-none px-3">
                      <p className="text-sm font-semibold tabular-nums">{fmtHora(i.agendado_para)}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtData(i.agendado_para)}</p>
                    </div>

                    <div className="flex min-w-0 flex-1 items-center gap-3 px-1">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-primary">
                        {iniciais(i.nome_lead)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{i.nome_lead || "Sem nome"}</p>
                        <p className="truncate text-xs text-muted-foreground">{i.numero}</p>
                      </div>
                    </div>

                    <div className="hidden w-52 flex-none px-3 md:block">
                      <span className="inline-flex max-w-full items-center truncate rounded-md bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
                        {servicos.find((s) => s.id === i.servico_id)?.nome || i.titulo || (i.tipo === "mensagem" ? "Mensagem" : "Compromisso")}
                      </span>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {profissionais.find((p) => p.user_id === i.profissional_id)?.nome || "Sem responsável"}
                      </p>
                    </div>

                    <div className="flex flex-none items-center gap-3 px-3">
                      <StatusBadge item={i} />
                      <span className="hidden text-xs text-muted-foreground xl:inline">{i.canal || "WhatsApp"}</span>
                    </div>

                    <div className="flex flex-none items-center gap-1 pl-1" onClick={(e) => e.stopPropagation()}>
                      {podeEditar && i.tipo === "compromisso" && !concluido && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => onStatus(i, "concluido")}
                        >
                          <Check className="mr-1 w-3.5 h-3.5" /> Concluir
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onAbrir(i)}>Ver detalhes</DropdownMenuItem>
                          {podeEditar && <DropdownMenuItem onClick={() => onEditar(i)}>Editar</DropdownMenuItem>}
                          {podeEditar && <DropdownMenuItem onClick={() => onStatus(i, "confirmado")}>Confirmar presença</DropdownMenuItem>}
                          {podeEditar && <DropdownMenuItem onClick={() => onStatus(i, "concluido")}>Marcar como concluído</DropdownMenuItem>}
                          {podeEditar && <DropdownMenuItem onClick={() => onStatus(i, "falta")}>Marcar falta</DropdownMenuItem>}
                          {podeEditar && <DropdownMenuItem onClick={() => onStatus(i, "cancelado")}>Cancelar</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}

          <div className="flex items-center justify-between rounded-xl border bg-card p-2 text-xs text-muted-foreground">
            <span>Mostrando {visiveis.length} de {ordenados.length} agendamentos</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>Anterior</Button>
              <span>{paginaAtual}/{totalPaginas}</span>
              <Button variant="outline" size="sm" className="h-7" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>Próxima</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export function EmptyAgenda({ onCriar, onMensagem }: { onCriar: () => void; onMensagem?: () => void }) {
  return (
    <div className="rounded-lg border bg-card p-10 text-center">
      <CalendarX2 className="w-8 h-8 mx-auto text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-2 font-semibold">Sua agenda está livre neste período</h3>
      <p className="text-sm text-muted-foreground">
        Crie um compromisso, programe uma mensagem ou configure os horários da sua equipe.
      </p>
      <div className="mt-3 flex justify-center gap-2">
        <Button size="sm" onClick={onCriar}>Criar compromisso</Button>
        {onMensagem && <Button size="sm" variant="outline" onClick={onMensagem}>Programar mensagem</Button>}
      </div>
    </div>
  );
}
