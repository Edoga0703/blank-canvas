import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarDays, Clock, MessageSquare, AlertTriangle, MoreVertical, ExternalLink, PlugZap,
} from "lucide-react";
import {
  StatusBadge, fimItem, fmtData, fmtDataHora, fmtHora, iniciais, mesmoDia,
  type Item, type Profissional, type Servico,
} from "./shared";
import { EmptyAgenda } from "./list-view";

type Props = {
  compromissos: Item[];
  mensagens: Item[];
  profissionais: Profissional[];
  servicos: Servico[];
  integracoes: { whatsapp: boolean; google: boolean; outlook: boolean; meet: boolean; zoom: boolean };
  podeEditar: boolean;
  onIrPara: (area: "agenda" | "mensagens", filtro?: string) => void;
  onAbrir: (i: Item) => void;
  onEditar: (i: Item) => void;
  onStatus: (i: Item, status: string) => void;
  onCriar: () => void;
  onNovaMensagem: () => void;
};

export function Overview({
  compromissos, mensagens, profissionais, servicos, integracoes, podeEditar,
  onIrPara, onAbrir, onEditar, onStatus, onCriar, onNovaMensagem,
}: Props) {
  const agora = new Date();

  const doDia = useMemo(
    () => compromissos.filter((c) => mesmoDia(new Date(c.agendado_para), agora) && c.status !== "cancelado"),
    [compromissos],
  );
  const proximos = useMemo(
    () => compromissos
      .filter((c) => new Date(c.agendado_para) >= agora && c.status !== "cancelado")
      .slice(0, 8),
    [compromissos],
  );
  const programadas = mensagens.filter((m) => m.status === "pendente");

  const atencao = useMemo(() => {
    const out: { id: string; tipo: string; texto: string; acao?: () => void }[] = [];
    for (const c of compromissos) {
      if (c.status === "aguardando" && new Date(c.agendado_para) >= agora) {
        out.push({ id: `nc-${c.id}`, tipo: "Não confirmado", texto: `${c.nome_lead || c.titulo || "Compromisso"} · ${fmtDataHora(c.agendado_para)}`, acao: () => onAbrir(c) });
      }
      if (["agendado", "aguardando", "confirmado"].includes(c.status) && fimItem(c) < agora) {
        out.push({ id: `at-${c.id}`, tipo: "Atrasado", texto: `${c.nome_lead || c.titulo || "Compromisso"} · ${fmtDataHora(c.agendado_para)}`, acao: () => onAbrir(c) });
      }
      if (c.status === "falta") {
        out.push({ id: `fa-${c.id}`, tipo: "Falta", texto: `${c.nome_lead || c.titulo || "Compromisso"} · ${fmtData(c.agendado_para)}`, acao: () => onAbrir(c) });
      }
    }
    // Conflitos: sobreposição no mesmo profissional
    const ativos = compromissos.filter((c) => !["cancelado", "falta"].includes(c.status));
    for (let i = 0; i < ativos.length; i++) {
      for (let j = i + 1; j < ativos.length; j++) {
        const a = ativos[i]!, b = ativos[j]!;
        if ((a.profissional_id || null) !== (b.profissional_id || null)) continue;
        if (new Date(a.agendado_para) < fimItem(b) && fimItem(a) > new Date(b.agendado_para)) {
          out.push({ id: `cf-${a.id}-${b.id}`, tipo: "Conflito", texto: `${a.titulo || a.nome_lead || "Compromisso"} e ${b.titulo || b.nome_lead || "Compromisso"} em ${fmtDataHora(a.agendado_para)}`, acao: () => onAbrir(a) });
        }
      }
    }
    for (const m of mensagens.filter((x) => x.status === "erro")) {
      out.push({ id: `er-${m.id}`, tipo: "Falha de envio", texto: `${m.nome_lead || m.numero} · ${m.erro || m.motivo_falha || "Erro no envio"}` });
    }
    if (!integracoes.whatsapp) {
      out.push({ id: "int-wa", tipo: "Integração", texto: "WhatsApp não conectado — mensagens programadas não serão enviadas." });
    }
    return out.slice(0, 20);
  }, [compromissos, mensagens, integracoes]);

  const proximo = proximos[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          icon={CalendarDays} titulo="Hoje" cor="text-primary"
          valor={String(doDia.length)} sub="compromissos do dia"
          onClick={() => onIrPara("agenda", "hoje")}
        />
        <Card
          icon={Clock} titulo="Próximo" cor="text-sky-600"
          valor={proximo ? fmtHora(proximo.agendado_para) : "—"}
          sub={proximo ? (proximo.nome_lead || proximo.titulo || "Compromisso") : "nenhum agendado"}
          onClick={() => proximo && onAbrir(proximo)}
        />
        <Card
          icon={MessageSquare} titulo="Mensagens programadas" cor="text-violet-600"
          valor={String(programadas.length)} sub="aguardando envio"
          onClick={() => onIrPara("mensagens")}
        />
        <Card
          icon={AlertTriangle} titulo="Atenção" cor="text-amber-600"
          valor={String(atencao.length)} sub="ocorrências para revisar"
          onClick={() => onIrPara("agenda")}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-lg border bg-card">
          <header className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-sm font-semibold">Próximos compromissos</h2>
            <Button variant="link" size="sm" className="h-6 text-xs" onClick={() => onIrPara("agenda")}>Ver agenda</Button>
          </header>
          {proximos.length === 0 ? (
            <div className="p-4"><EmptyAgenda onCriar={onCriar} onMensagem={onNovaMensagem} /></div>
          ) : (
            <ul className="divide-y">
              {proximos.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-sm font-semibold">{fmtHora(c.agendado_para)}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtData(c.agendado_para).slice(0, 5)}</div>
                  </div>
                  <span className="w-8 h-8 shrink-0 rounded-full bg-muted grid place-items-center text-[11px] font-semibold">
                    {iniciais(c.nome_lead)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="text-sm font-medium truncate hover:underline" onClick={() => onAbrir(c)}>
                      {c.nome_lead || c.titulo || "Compromisso"}
                    </button>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[c.empresa_nome, servicos.find((s) => s.id === c.servico_id)?.nome || c.titulo,
                        profissionais.find((p) => p.user_id === c.profissional_id)?.nome].filter(Boolean).join(" · ") || "Sem detalhes"}
                    </p>
                  </div>
                  <StatusBadge item={c} className="hidden sm:inline-flex" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onAbrir(c)}>Ver detalhes</DropdownMenuItem>
                      {podeEditar && <DropdownMenuItem onClick={() => onEditar(c)}>Editar / reagendar</DropdownMenuItem>}
                      {podeEditar && <DropdownMenuItem onClick={() => onStatus(c, "confirmado")}>Confirmar</DropdownMenuItem>}
                      {podeEditar && <DropdownMenuItem onClick={() => onStatus(c, "concluido")}>Concluir</DropdownMenuItem>}
                      {podeEditar && <DropdownMenuItem onClick={() => onStatus(c, "cancelado")}>Cancelar</DropdownMenuItem>}
                      {c.numero && (
                        <DropdownMenuItem asChild>
                          <a href={`/app/conversas?numero=${c.numero}`}>Abrir conversa</a>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-3">
          <section className="rounded-lg border bg-card">
            <header className="border-b px-3 py-2">
              <h2 className="text-sm font-semibold">Central de atenção</h2>
            </header>
            {atencao.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Tudo em ordem por aqui.</p>
            ) : (
              <ul className="divide-y max-h-[220px] overflow-auto">
                {atencao.map((a) => (
                  <li key={a.id} className="px-3 py-2">
                    <button type="button" className="text-left w-full" onClick={a.acao} disabled={!a.acao}>
                      <Badge variant="outline" className="mb-0.5 text-[10px]">{a.tipo}</Badge>
                      <p className="text-xs text-muted-foreground">{a.texto}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-card">
            <header className="flex items-center justify-between border-b px-3 py-2">
              <h2 className="text-sm font-semibold">Mensagens programadas</h2>
              <Button variant="link" size="sm" className="h-6 text-xs" onClick={() => onIrPara("mensagens")}>Ver todas</Button>
            </header>
            {programadas.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Nenhuma mensagem aguardando envio.</p>
            ) : (
              <ul className="divide-y max-h-[200px] overflow-auto">
                {programadas.slice(0, 6).map((m) => (
                  <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{m.titulo || "Mensagem"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {m.nome_lead || m.numero} · {fmtDataHora(m.agendado_para)}
                      </p>
                    </div>
                    <StatusBadge item={m} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!integracoes.whatsapp && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <div className="flex items-center gap-2 font-medium text-amber-700">
                <PlugZap className="w-4 h-4" aria-hidden="true" /> WhatsApp não conectado
              </div>
              <p className="mt-1 text-muted-foreground">Conecte o WhatsApp para enviar lembretes e mensagens programadas.</p>
              <Button variant="outline" size="sm" className="mt-2 h-7" asChild>
                <a href="/app/conexao"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Conectar</a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  icon: Icon, titulo, valor, sub, cor, onClick,
}: { icon: any; titulo: string; valor: string; sub: string; cor: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border bg-card p-3 text-left transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-lg bg-muted grid place-items-center ${cor}`}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</span>
      </div>
      <p className="mt-2 text-2xl font-bold leading-none truncate">{valor}</p>
      <p className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</p>
    </button>
  );
}
