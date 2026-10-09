import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDetalhesCompromisso, setStatusCompromisso, excluirItem } from "@/lib/agenda.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Calendar, Clock, Phone, Building2, User, MapPin, Video, MessageSquare,
  Check, CheckCheck, UserX, Ban, Pencil, Trash2, History, ExternalLink,
} from "lucide-react";
import {
  MODALIDADES, StatusBadge, fmtDataHora, fmtHora, fimItem, duracaoItem,
  type Item, type Profissional,
} from "./shared";

type Props = {
  itemId: string | null;
  onOpenChange: (v: boolean) => void;
  profissionais: Profissional[];
  podeEditar: boolean;
  onEditar: (item: Item) => void;
  onAlterado: () => void;
};

export function DetailPanel({ itemId, onOpenChange, profissionais, podeEditar, onEditar, onAlterado }: Props) {
  const _det = useServerFn(getDetalhesCompromisso);
  const _status = useServerFn(setStatusCompromisso);
  const _del = useServerFn(excluirItem);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmar, setConfirmar] = useState<null | "cancelar" | "excluir">(null);

  useEffect(() => {
    if (!itemId) { setDados(null); return; }
    let vivo = true;
    setCarregando(true);
    _det({ data: { id: itemId } } as any)
      .then((r: any) => { if (vivo) setDados(r); })
      .catch((e: any) => toast.error(e?.message || "Não foi possível abrir os detalhes"))
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [itemId]);

  const item: Item | null = dados?.item ?? null;

  async function mudarStatus(status: string) {
    if (!itemId) return;
    try {
      await _status({ data: { id: itemId, status } } as any);
      toast.success("Status atualizado");
      const r: any = await _det({ data: { id: itemId } } as any);
      setDados(r);
      onAlterado();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível atualizar");
    }
  }

  async function excluir() {
    if (!itemId) return;
    try {
      await _del({ data: { id: itemId } } as any);
      toast.success("Compromisso excluído");
      onOpenChange(false);
      onAlterado();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível excluir");
    }
  }

  const resp = profissionais.find((p) => p.user_id === item?.profissional_id);

  return (
    <>
      <Sheet open={!!itemId} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              {item?.nome_lead || item?.titulo || "Compromisso"}
              {item && <StatusBadge item={item} />}
            </SheetTitle>
          </SheetHeader>

          {carregando && (
            <div className="space-y-2 py-4">
              <Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-24 w-full" />
            </div>
          )}

          {!carregando && item && (
            <div className="space-y-4 py-4 text-sm">
              {item.titulo && <p className="text-muted-foreground">{item.titulo}</p>}

              <div className="space-y-2">
                <Linha icon={Calendar} texto={new Date(item.agendado_para).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })} />
                <Linha icon={Clock} texto={`${fmtHora(item.agendado_para)} – ${fmtHora(fimItem(item))} (${duracaoItem(item)} min)`} />
                {item.numero && <Linha icon={Phone} texto={item.numero} />}
                {item.empresa_nome && <Linha icon={Building2} texto={item.empresa_nome} />}
                <Linha icon={User} texto={`Responsável: ${resp?.nome || "Agenda da empresa"}`} />
                {item.modalidade && (
                  <Linha icon={Video} texto={MODALIDADES.find((m) => m.value === item.modalidade)?.label || item.modalidade} />
                )}
                {item.local && <Linha icon={MapPin} texto={item.local} />}
                {item.link_reuniao && (
                  <a href={item.link_reuniao} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                    <ExternalLink className="w-4 h-4" /> Abrir link da reunião
                  </a>
                )}
              </div>

              {item.mensagem && (
                <div className="rounded-md border bg-muted/40 p-2 text-[13px] whitespace-pre-wrap">{item.mensagem}</div>
              )}
              {item.observacoes_internas && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Observações internas</p>
                  <p className="text-[13px] whitespace-pre-wrap">{item.observacoes_internas}</p>
                </div>
              )}
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              )}

              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" /> Mensagens relacionadas
                </p>
                {dados.mensagens.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma mensagem vinculada.</p>}
                <div className="space-y-1.5">
                  {dados.mensagens.map((m: any) => (
                    <div key={m.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">{m.titulo || "Mensagem"}</span>
                        <StatusBadge item={{ tipo: "mensagem", status: m.status }} className="text-[10px]" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">{fmtDataHora(m.agendado_para)}</p>
                      {m.erro && <p className="text-[11px] text-red-600">{m.erro}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <History className="w-3.5 h-3.5" /> Histórico
                </p>
                {dados.historico.length === 0 && <p className="text-xs text-muted-foreground">Sem alterações registradas.</p>}
                <ul className="space-y-1">
                  {dados.historico.map((h: any) => (
                    <li key={h.id} className="text-[11px] text-muted-foreground">
                      {fmtDataHora(h.created_at)} — {h.acao}
                    </li>
                  ))}
                </ul>
              </div>

              {podeEditar && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-2">
                    {item.card_id && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/app/crm?card=${item.card_id}`}>Abrir contato</a>
                      </Button>
                    )}
                    {item.numero && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/app/conversas?numero=${item.numero}`}>Abrir conversa</a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => mudarStatus("confirmado")}>
                      <Check className="w-4 h-4 mr-1" /> Confirmar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onEditar(item)}>
                      <Pencil className="w-4 h-4 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => mudarStatus("concluido")}>
                      <CheckCheck className="w-4 h-4 mr-1" /> Concluir
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => mudarStatus("falta")}>
                      <UserX className="w-4 h-4 mr-1" /> Marcar falta
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmar("cancelar")}>
                      <Ban className="w-4 h-4 mr-1" /> Cancelar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setConfirmar("excluir")}>
                      <Trash2 className="w-4 h-4 mr-1" /> Excluir
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === "excluir" ? "Excluir compromisso?" : "Cancelar compromisso?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "excluir"
                ? "O compromisso será removido da agenda e do Google Agenda. Esta ação não pode ser desfeita."
                : "O compromisso ficará marcado como cancelado e sai da agenda ativa."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const acao = confirmar;
                setConfirmar(null);
                if (acao === "excluir") excluir();
                else mudarStatus("cancelado");
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Linha({ icon: Icon, texto }: { icon: any; texto: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}
