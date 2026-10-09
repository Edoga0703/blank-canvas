import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { getSectorRouting, encaminharCard, type RoutingData } from "@/lib/sectors.functions";

const MANTER = "__manter__";
const NENHUM = "__nenhum__";
const AUTOMATICO = "__automatico__";

export function EncaminharDialog({
  open,
  onOpenChange,
  numero,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  numero: string | null;
  onDone?: (r: { department_id: string | null; stage_id: string | null; owner_id: string | null }) => void;
}) {
  const loadRouting = useServerFn(getSectorRouting);
  const encaminhar = useServerFn(encaminharCard);

  const [routing, setRouting] = useState<RoutingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [setorId, setSetorId] = useState<string>("");
  const [pipelineId, setPipelineId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");
  const [ownerId, setOwnerId] = useState<string>(MANTER);
  const [requerAceite, setRequerAceite] = useState(true);
  const ownerEhPessoa = ownerId !== MANTER && ownerId !== NENHUM && ownerId !== AUTOMATICO;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadRouting()
      .then((r: any) => {
        setRouting(r);
        // Sempre começa no primeiro funil disponível.
        const first = r?.pipelines?.[0];
        if (first) {
          setPipelineId(first.id);
          setStageId(first.stages?.[0]?.id ?? "");
        }
      })
      .catch((e: any) => toast.error(e?.message ?? "Erro ao carregar setores"))
      .finally(() => setLoading(false));
  }, [open, loadRouting]);

  const setor = useMemo(
    () => routing?.sectors.find((s) => s.id === setorId) ?? null,
    [routing, setorId],
  );
  /** Usuários do setor; se o setor não tiver ninguém vinculado, mostra toda a equipe. */
  const responsaveis = useMemo(() => {
    const doSetor = setor?.membros ?? [];
    return doSetor.length > 0 ? doSetor : routing?.members ?? [];
  }, [setor, routing]);

  const pipeline = useMemo(
    () => routing?.pipelines.find((p) => p.id === pipelineId) ?? null,
    [routing, pipelineId],
  );

  // Ao escolher o setor, sugere o funil vinculado (quando ele ainda existir).
  useEffect(() => {
    if (!setor || !routing) return;
    const vinculado = routing.pipelines.find((p) => p.id === setor.pipeline_id);
    const alvo = vinculado ?? routing.pipelines[0];
    if (alvo) {
      setPipelineId(alvo.id);
      setStageId(alvo.stages[0]?.id ?? "");
    }
    setOwnerId(MANTER);
  }, [setorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pipeline) return;
    if (!pipeline.stages.some((s) => s.id === stageId)) {
      setStageId(pipeline.stages[0]?.id ?? "");
    }
  }, [pipelineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    if (!numero) return;
    setSaving(true);
    try {
      const automatico = ownerId === AUTOMATICO;
      const payload = {
        numero,
        department_id: setorId || undefined,
        stage_id: stageId || null,
        owner_id: ownerId === MANTER ? undefined : automatico || ownerId === NENHUM ? null : ownerId,
        assignment_mode: automatico ? "automatic" as const : "manual" as const,
        requer_aceite: ownerEhPessoa && requerAceite,
      };
      const result = await encaminhar({ data: payload });
      toast.success(
        (result as any)?.pendente
          ? "Convite enviado. O atendente precisa aceitar para assumir."
          : "Atendimento encaminhado",
      );
      onDone?.({
        department_id: payload.department_id ?? null,
        stage_id: payload.stage_id,
        owner_id: result.owner_id,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao encaminhar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Encaminhar atendimento</DialogTitle>
          <DialogDescription>Escolha o setor, a etapa do funil e o responsável.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <Select value={setorId} onValueChange={setSetorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {(routing?.sectors ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={`space-y-1.5 ${(routing?.pipelines?.length ?? 0) > 1 ? "" : "hidden"}`}>
              <Label>Funil</Label>
              <Select value={pipelineId} onValueChange={setPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funil" />
                </SelectTrigger>
                <SelectContent>
                  {(routing?.pipelines ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={stageId} onValueChange={setStageId} disabled={!pipeline}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {(pipeline?.stages ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o atendente" />
                </SelectTrigger>
                <SelectContent>
                  {!routing?.manualDistribution && setorId && (
                    <SelectItem value={AUTOMATICO}>Distribuir automaticamente</SelectItem>
                  )}
                  <SelectItem value={MANTER}>Manter responsável atual</SelectItem>
                  <SelectItem value={NENHUM}>Sem responsável</SelectItem>
                  {responsaveis.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {setor && setor.membros.length === 0 && (
                <p className="text-[11.5px] text-muted-foreground">
                  Nenhum usuário vinculado a este setor — mostrando toda a equipe.
                </p>
              )}
            </div>

            {ownerEhPessoa && (
              <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[color:var(--brand-text)]"
                  checked={requerAceite}
                  onChange={(e) => setRequerAceite(e.target.checked)}
                />
                <span className="text-sm">
                  <span className="font-medium">Pedir aceite do atendente</span>
                  <span className="block text-xs text-muted-foreground">
                    A conversa aparece como convite em "Minhas" e só passa a ser dele depois de aceitar.
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={saving || (!setorId && !stageId && ownerId === MANTER)}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Encaminhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
