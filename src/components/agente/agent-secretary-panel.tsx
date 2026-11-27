import React, { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Phone,
  Plus,
  X,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  BellRing,
  Clock,
  Lock,
  RefreshCcw,
} from "lucide-react";
import {
  saveSecretaryConfig,
  listPendingApprovals,
  resolveApprovalFromPanel,
} from "@/lib/agent-secretary.functions";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface AgentSecretaryPanelProps {
  agentId?: string | null;
  cfg: any;
  allowed: boolean;
  onConfigUpdated?: (updatedFields: any) => void;
}

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Caracas",
  "America/Bogota",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Lima",
  "Europe/Madrid",
  "UTC",
];

export function AgentSecretaryPanel({
  agentId,
  cfg,
  allowed,
  onConfigUpdated,
}: AgentSecretaryPanelProps) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const persistSecretary = useServerFn(saveSecretaryConfig);
  const fetchApprovals = useServerFn(listPendingApprovals);
  const decideApproval = useServerFn(resolveApprovalFromPanel);

  const [enabled, setEnabled] = useState(Boolean(cfg?.secretary_enabled));
  const [phones, setPhones] = useState<string[]>(
    Array.isArray(cfg?.secretary_phones) ? cfg.secretary_phones.map(String) : [],
  );
  const [phoneDraft, setPhoneDraft] = useState("");
  const [briefingHour, setBriefingHour] = useState(cfg?.secretary_briefing_hour || "08:00");
  const [timezone, setTimezone] = useState(cfg?.secretary_timezone || "America/Sao_Paulo");
  const [saving, setSaving] = useState(false);

  const [approvals, setApprovals] = useState<any[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(Boolean(cfg?.secretary_enabled));
    setPhones(Array.isArray(cfg?.secretary_phones) ? cfg.secretary_phones.map(String) : []);
    setBriefingHour(cfg?.secretary_briefing_hour || "08:00");
    setTimezone(cfg?.secretary_timezone || "America/Sao_Paulo");
  }, [cfg?.id, cfg?.secretary_enabled, cfg?.secretary_phones, cfg?.secretary_briefing_hour, cfg?.secretary_timezone]);

  const loadApprovals = useCallback(async () => {
    if (!allowed) return;
    setLoadingApprovals(true);
    try {
      const res: any = await fetchApprovals({ data: { agentId: agentId || null } });
      setApprovals(res?.approvals ?? []);
    } catch (err: any) {
      toast.error(err?.message || (isEs ? "Error cargando aprobaciones" : "Erro ao carregar aprovações"));
    } finally {
      setLoadingApprovals(false);
    }
  }, [allowed, agentId, fetchApprovals, isEs]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
        <div className="size-10 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto">
          <Lock className="size-5" />
        </div>
        <h3 className="text-sm font-bold">
          {isEs ? "Secretario Ejecutivo & Aprobaciones HITL" : "Secretário Executivo & Aprovações HITL"}
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {isEs
            ? "Recibe resúmenes diarios por WhatsApp, da órdenes por voz/texto y aprueba pagos o acciones críticas en 1 clic. Disponible desde el plan Pro."
            : "Receba resumos diários no WhatsApp, dê comandos e aprove pagamentos em 1 clique. Disponível a partir do plano Pro."}
        </p>
      </div>
    );
  }

  const handleAddPhone = () => {
    const digits = phoneDraft.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error(isEs ? "Ingresa al menos 10 dígitos con código de país." : "Digite ao menos 10 dígitos com DDI.");
      return;
    }
    if (phones.includes(digits)) {
      setPhoneDraft("");
      return;
    }
    if (phones.length >= 5) {
      toast.error(isEs ? "Máximo 5 teléfonos autorizados." : "Máximo de 5 telefones autorizados.");
      return;
    }
    setPhones((prev) => [...prev, digits]);
    setPhoneDraft("");
  };

  const handleSaveConfig = async () => {
    if (!agentId) return;
    setSaving(true);
    try {
      const res: any = await persistSecretary({
        data: {
          agentId,
          enabled,
          phones,
          briefingHour,
          timezone,
        },
      });
      toast.success(isEs ? "Secretario Ejecutivo guardado" : "Secretário Executivo salvo");
      if (res?.config && onConfigUpdated) {
        onConfigUpdated(res.config);
      }
    } catch (err: any) {
      toast.error(err?.message || "Error guardando configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (approvalId: string, decision: "approved" | "rejected") => {
    setResolvingId(approvalId);
    try {
      const res: any = await decideApproval({ data: { approvalId, decision } });
      toast.success(res?.summaryText || (decision === "approved" ? "Aprobado" : "Rechazado"));
      await loadApprovals();
    } catch (err: any) {
      toast.error(err?.message || "Error al resolver aprobación");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuración del Secretario */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Phone className="size-4 text-primary" />
              {isEs ? "Modo Secretario Ejecutivo por WhatsApp" : "Modo Secretário Executivo no WhatsApp"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEs
                ? "Los mensajes de estos números nunca crean leads y se atienden como comandos ejecutivos privados del dueño."
                : "Mensagens desses números não criam leads e funcionam como comandos executivos privados do dono."}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">
            {isEs ? "Teléfonos autorizados (owners/admins, máx. 5)" : "Telefones autorizados (máx. 5)"}
          </Label>
          <div className="flex gap-2">
            <Input
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddPhone();
                }
              }}
              placeholder={isEs ? "Ej: 584121234567 o 5511999999999" : "Ex: 5511999999999"}
              className="text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={handleAddPhone} className="gap-1 shrink-0">
              <Plus className="size-3.5" />
              {isEs ? "Agregar" : "Adicionar"}
            </Button>
          </div>

          {phones.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {phones.map((p) => (
                <Badge key={p} variant="secondary" className="font-mono text-xs gap-1.5 py-1 px-2.5">
                  +{p}
                  <button
                    type="button"
                    onClick={() => setPhones((prev) => prev.filter((item) => item !== p))}
                    className="hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              {isEs ? "Hora del Briefing diario" : "Horário do Briefing diário"}
            </Label>
            <Input
              type="time"
              value={briefingHour}
              onChange={(e) => setBriefingHour(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{isEs ? "Zona horaria" : "Fuso horário"}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz} className="text-xs">
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void handleSaveConfig()} disabled={saving || !agentId} size="sm" className="gap-2 text-xs">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {isEs ? "Guardar Configuración de Secretario" : "Salvar Configuração do Secretário"}
          </Button>
        </div>
      </div>

      {/* Bandeja en vivo de Aprobaciones HITL */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <BellRing className="size-4 text-amber-500" />
              {isEs ? "Aprobaciones Pendientes (Human-in-the-Loop)" : "Aprovações Pendentes (Human-in-the-Loop)"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEs
                ? "Puedes aprobar/rechazar aquí o respondiendo 'APROBAR AP-XXXX' por WhatsApp."
                : "Você pode aprovar/rejeitar aqui ou respondendo 'APROBAR AP-XXXX' no WhatsApp."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadApprovals()} disabled={loadingApprovals} className="h-8 text-xs gap-1">
            <RefreshCcw className={cn("size-3.5", loadingApprovals && "animate-spin")} />
          </Button>
        </div>

        {loadingApprovals && approvals.length === 0 ? (
          <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {isEs ? "Cargando bandeja..." : "Carregando fila..."}
          </div>
        ) : approvals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {isEs ? "No hay solicitudes de aprobación registradas aún." : "Nenhuma solicitação de aprovação registrada."}
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((item) => {
              const isPending = item.status === "pending";
              const kindLabel =
                item.kind === "payment_receipt"
                  ? isEs ? "Comprobante de pago" : "Comprovante"
                  : item.kind === "tool_write"
                    ? isEs ? "Herramienta externa" : "Ferramenta externa"
                    : "Handoff";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border p-4 space-y-2.5",
                    isPending ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-background/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono text-xs font-bold">
                        {item.short_code}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {kindLabel}
                      </Badge>
                      <Badge
                        className={cn(
                          "text-[10px]",
                          item.status === "pending"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                            : item.status === "approved"
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                              : "bg-destructive/20 text-destructive hover:bg-destructive/20",
                        )}
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-xs">
                    <span className="font-semibold">{item.lead_nome || item.lead_numero}</span>{" "}
                    <span className="text-muted-foreground font-mono">({item.lead_numero})</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.summary}</p>

                  {isPending && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={resolvingId === item.id}
                        onClick={() => void handleDecision(item.id, "approved")}
                        className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {resolvingId === item.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3" />
                        )}
                        {isEs ? "Aprobar" : "Aprovar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolvingId === item.id}
                        onClick={() => void handleDecision(item.id, "rejected")}
                        className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                      >
                        <XCircle className="size-3" />
                        {isEs ? "Rechazar" : "Rejeitar"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
