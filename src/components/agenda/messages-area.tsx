import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarClock, Send, AlertTriangle, Ban, MoreVertical, Search, X, MessageSquare, ExternalLink,
} from "lucide-react";
import {
  StatusBadge, fmtData, fmtDataHora, fmtHora, iniciais, mesmoDia,
  type Item, type Profissional,
} from "./shared";

type Props = {
  mensagens: Item[];
  compromissos: Item[];
  profissionais: Profissional[];
  podeEditar: boolean;
  onNova: () => void;
  onEditar: (m: Item) => void;
  onAcao: (m: Item, acao: "cancelar" | "reenviar" | "enviar_agora" | "duplicar") => void;
  onExcluir: (m: Item) => void;
};

export function MessagesArea({
  mensagens, compromissos, profissionais, podeEditar, onNova, onEditar, onAcao, onExcluir,
}: Props) {
  const [aba, setAba] = useState<"fila" | "calendario" | "historico">("fila");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [resp, setResp] = useState("todos");
  const [selecionada, setSelecionada] = useState<Item | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<Item | null>(null);

  const hoje = new Date();
  const metricas = useMemo(() => ({
    programadas: mensagens.filter((m) => m.status === "pendente").length,
    enviadasHoje: mensagens.filter((m) => m.enviado_em && mesmoDia(new Date(m.enviado_em), hoje)).length,
    falhas: mensagens.filter((m) => m.status === "erro").length,
    canceladas: mensagens.filter((m) => m.status === "cancelado").length,
  }), [mensagens]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return mensagens.filter((m) => {
      if (aba === "fila" && !["pendente", "processando", "rascunho"].includes(m.status)) return false;
      if (aba === "historico" && ["pendente", "rascunho"].includes(m.status)) return false;
      if (status !== "todos" && m.status !== status) return false;
      if (resp !== "todos" && m.profissional_id !== resp) return false;
      if (q && !(`${m.nome_lead || ""} ${m.numero} ${m.mensagem}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [mensagens, aba, busca, status, resp]);

  const porDia = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const m of filtradas) {
      const k = fmtData(m.agendado_para);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return Array.from(map.entries());
  }, [filtradas]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric icon={CalendarClock} label="Programadas" valor={metricas.programadas} cor="text-violet-600" />
        <Metric icon={Send} label="Enviadas hoje" valor={metricas.enviadasHoje} cor="text-emerald-600" />
        <Metric icon={AlertTriangle} label="Falhas" valor={metricas.falhas} cor="text-red-600" />
        <Metric icon={Ban} label="Canceladas" valor={metricas.canceladas} cor="text-muted-foreground" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={aba} onValueChange={(v: any) => setAba(v)}>
          <TabsList className="h-8">
            <TabsTrigger value="fila" className="text-xs">Fila</TabsTrigger>
            <TabsTrigger value="calendario" className="text-xs">Calendário</TabsTrigger>
            <TabsTrigger value="historico" className="text-xs">Histórico</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" onClick={onNova}>
          <MessageSquare className="w-4 h-4 mr-1" /> Programar mensagem
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-8 h-8 text-xs" aria-label="Buscar mensagens"
            placeholder="Buscar por nome, telefone ou conteúdo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Programada</SelectItem>
            <SelectItem value="enviado">Enviada</SelectItem>
            <SelectItem value="erro">Falhou</SelectItem>
            <SelectItem value="cancelado">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={resp} onValueChange={setResp}>
          <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Responsável"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos responsáveis</SelectItem>
            {profissionais.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border bg-card divide-y max-h-[55vh] overflow-auto">
          {filtradas.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma mensagem nesta visualização.
            </div>
          )}
          {aba === "calendario"
            ? porDia.map(([dia, linhas]) => (
                <div key={dia}>
                  <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold">{dia}</div>
                  {linhas.map((m) => <LinhaMensagem key={m.id} m={m} onSelect={setSelecionada} selecionada={selecionada?.id === m.id} />)}
                </div>
              ))
            : filtradas.map((m) => <LinhaMensagem key={m.id} m={m} onSelect={setSelecionada} selecionada={selecionada?.id === m.id} />)}
        </div>

        <aside className="rounded-lg border bg-card p-3">
          {!selecionada ? (
            <p className="text-sm text-muted-foreground">Selecione uma mensagem para ver os detalhes.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{selecionada.nome_lead || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{selecionada.numero}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Fechar" onClick={() => setSelecionada(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <StatusBadge item={selecionada} />
              <div className="rounded-md bg-muted/50 p-2 text-[13px] whitespace-pre-wrap">{selecionada.mensagem}</div>
              <dl className="space-y-1 text-xs">
                <Info termo="Data e hora" valor={fmtDataHora(selecionada.agendado_para)} />
                {selecionada.enviado_em && <Info termo="Enviada em" valor={fmtDataHora(selecionada.enviado_em)} />}
                <Info termo="Canal" valor={selecionada.canal || "WhatsApp"} />
                <Info
                  termo="Compromisso"
                  valor={compromissos.find((c) => c.id === (selecionada.appointment_id || ""))?.titulo || "—"}
                />
                <Info
                  termo="Responsável"
                  valor={profissionais.find((p) => p.user_id === selecionada.profissional_id)?.nome || "—"}
                />
                {(selecionada.erro || selecionada.motivo_falha) && (
                  <Info termo="Motivo da falha" valor={selecionada.erro || selecionada.motivo_falha || ""} />
                )}
              </dl>
              {podeEditar && (
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => onAcao(selecionada, "enviar_agora")}>
                    <Send className="w-4 h-4 mr-1" /> Enviar agora
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onEditar(selecionada)}>Editar</Button>
                  <Button size="sm" variant="outline" onClick={() => onAcao(selecionada, "duplicar")}>Duplicar</Button>
                  <Button size="sm" variant="outline" onClick={() => onAcao(selecionada, "cancelar")}>Cancelar</Button>
                  {selecionada.numero && (
                    <Button size="sm" variant="outline" asChild className="col-span-2">
                      <a href={`/app/conversas?numero=${selecionada.numero}`}>
                        <ExternalLink className="w-4 h-4 mr-1" /> Abrir conversa
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" className="col-span-2" onClick={() => setConfirmarExcluir(selecionada)}>
                    Excluir
                  </Button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <AlertDialog open={!!confirmarExcluir} onOpenChange={(v) => !v && setConfirmarExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>A mensagem programada será removida definitivamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const m = confirmarExcluir;
              setConfirmarExcluir(null);
              setSelecionada(null);
              if (m) onExcluir(m);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  function LinhaMensagem({ m, onSelect, selecionada: sel }: { m: Item; onSelect: (i: Item) => void; selecionada: boolean }) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(m)}
        onKeyDown={(e) => e.key === "Enter" && onSelect(m)}
        className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer ${sel ? "bg-primary/5" : ""}`}
      >
        <span className="w-7 h-7 shrink-0 rounded-full bg-muted grid place-items-center text-[10px] font-semibold">
          {iniciais(m.nome_lead)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{m.nome_lead || "Sem nome"}</span>
            <span className="text-[11px] text-muted-foreground">{fmtData(m.agendado_para)} {fmtHora(m.agendado_para)}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{m.mensagem}</p>
        </div>
        <StatusBadge item={m} className="hidden sm:inline-flex" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações da mensagem" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onSelect(m)}>Ver detalhes</DropdownMenuItem>
            {podeEditar && <DropdownMenuItem onClick={() => onEditar(m)}>Editar</DropdownMenuItem>}
            {podeEditar && <DropdownMenuItem onClick={() => onAcao(m, "enviar_agora")}>Enviar agora</DropdownMenuItem>}
            {podeEditar && <DropdownMenuItem onClick={() => onAcao(m, "duplicar")}>Duplicar</DropdownMenuItem>}
            {podeEditar && m.status === "erro" && <DropdownMenuItem onClick={() => onAcao(m, "reenviar")}>Tentar novamente</DropdownMenuItem>}
            {podeEditar && <DropdownMenuItem onClick={() => onAcao(m, "cancelar")}>Cancelar</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
}

function Metric({ icon: Icon, label, valor, cor }: { icon: any; label: string; valor: number; cor: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <span className={`w-9 h-9 rounded-lg bg-muted grid place-items-center ${cor}`}>
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-none">{valor}</p>
      </div>
    </div>
  );
}

function Info({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{termo}</dt>
      <dd className="text-right">{valor}</dd>
    </div>
  );
}
