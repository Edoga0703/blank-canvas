import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  FileText,
  Database,
  Loader2,
  Trash2,
  RefreshCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Phone,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/context";

export interface AgentSimpleModeProps {
  cfg: any;
  setCfg: React.Dispatch<React.SetStateAction<any>>;
  livre: string;
  setLivre: (v: string) => void;
  agendamentoAtivo: boolean;
  setAgendamentoAtivo: (v: boolean) => void;
  responderEmPartes: boolean;
  setResponderEmPartes: (v: boolean) => void;
  tamanhoResposta: "curtas" | "medias" | "longas";
  setTamanhoResposta: (v: "curtas" | "medias" | "longas") => void;
  saving: boolean;
  onSave: () => Promise<any>;
  onOpenCopilotInterview: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onReindexKnowledge: () => Promise<void>;
  uploadingFile: boolean;
  indexingKnowledge: boolean;
  catalogEnabled: boolean;
  onToggleCatalog: (v: boolean) => void;
  hasSecretaryFeature: boolean;
  secretaryEnabled: boolean;
  secretaryPhones: string[];
  onQuickEnableSecretary: (enabled: boolean, phone?: string) => Promise<void>;
}

export function AgentSimpleMode({
  cfg,
  setCfg,
  livre,
  setLivre,
  agendamentoAtivo,
  setAgendamentoAtivo,
  responderEmPartes,
  setResponderEmPartes,
  tamanhoResposta,
  setTamanhoResposta,
  saving,
  onSave,
  onOpenCopilotInterview,
  onFileUpload,
  onDeleteFile,
  onReindexKnowledge,
  uploadingFile,
  indexingKnowledge,
  catalogEnabled,
  onToggleCatalog,
  hasSecretaryFeature,
  secretaryEnabled,
  secretaryPhones,
  onQuickEnableSecretary,
}: AgentSimpleModeProps) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [quickPhone, setQuickPhone] = useState(secretaryPhones[0] || "");
  const [savingSecretary, setSavingSecretary] = useState(false);

  const files = Array.isArray(cfg?.knowledge_files) ? cfg.knowledge_files : [];

  const currentTone = (() => {
    const style = String(cfg?.estilo_comunicacao || "").toLowerCase();
    if (/direct|objetiv|concis|curto|diret/i.test(style) || tamanhoResposta === "curtas") {
      if (/profissional|formal|ejecutiv|corporat/i.test(style)) return "profesional";
      if (/direct|objetiv|concis/i.test(style)) return "directo";
    }
    if (/profissional|formal|ejecutiv|corporat/i.test(style)) return "profesional";
    return "cercano";
  })();

  const applyTone = (tone: "cercano" | "profesional" | "directo") => {
    if (tone === "cercano") {
      setCfg((prev: any) => ({
        ...(prev || {}),
        estilo_comunicacao: isEs
          ? "Cercano, amable y natural estilo WhatsApp"
          : "Próximo, amigável e natural estilo WhatsApp",
      }));
      setTamanhoResposta("curtas");
    } else if (tone === "profesional") {
      setCfg((prev: any) => ({
        ...(prev || {}),
        estilo_comunicacao: isEs
          ? "Profesional, claro, consultivo y confiable"
          : "Profissional, claro, consultivo e confiável",
      }));
      setTamanhoResposta("medias");
    } else {
      setCfg((prev: any) => ({
        ...(prev || {}),
        estilo_comunicacao: isEs
          ? "Directo, ágil y al grano sin rodeos"
          : "Direto, ágil e objetivo sem rodeios",
      }));
      setTamanhoResposta("curtas");
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Copilot Entrevista */}
      <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-600/10 via-indigo-600/10 to-transparent p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-violet-600 dark:text-violet-400" />
            <h3 className="text-sm font-bold">
              {isEs ? "Configura tu Agente en 4 pasos simples" : "Configure seu Agente em 4 passos simples"}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {isEs
              ? "¿Prefieres no llenar formularios? Habla con el Copilot y él armará reglas, catálogo y estilo por ti."
              : "Prefere não preencher formulários? Converse com o Copilot e ele monta regras, catálogo e estilo."}
          </p>
        </div>
        <Button
          type="button"
          onClick={onOpenCopilotInterview}
          className="shrink-0 gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm text-xs"
        >
          <Sparkles className="size-3.5" />
          {isEs ? "Configurar con Copilot" : "Configurar com Copilot"}
        </Button>
      </div>

      {/* Paso 1: Qué hace y qué NO hace */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[11px] font-semibold">
            {isEs ? "Paso 1 · Qué hace y qué NO hace" : "Passo 1 · O que faz e o que NÃO faz"}
          </Badge>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{isEs ? "Nombre del agente" : "Nome do agente"}</Label>
            <Input
              value={cfg?.nome_agente || ""}
              onChange={(e) => setCfg((prev: any) => ({ ...(prev || {}), nome_agente: e.target.value }))}
              placeholder={isEs ? "Ej: Sofía / Asesor" : "Ex: Sofia / Atendente"}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{isEs ? "Idioma principal" : "Idioma principal"}</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { code: "es", label: "Español", flag: "🇪🇸" },
                { code: "pt", label: "Português", flag: "🇧🇷" },
                { code: "en", label: "English", flag: "🇺🇸" },
              ].map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setCfg((prev: any) => ({ ...(prev || {}), idioma: lang.code }))}
                  className={cn(
                    "py-2 px-2 rounded-lg border text-xs font-medium transition flex items-center justify-center gap-1",
                    (cfg?.idioma || "es") === lang.code
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-background hover:bg-muted/50 text-foreground",
                  )}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{isEs ? "Tono de atención" : "Tom do atendimento"}</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "cercano" as const, label: isEs ? "Cercano" : "Próximo", sub: isEs ? "Amable y humano" : "Amigável" },
              { id: "profesional" as const, label: isEs ? "Profesional" : "Profissional", sub: isEs ? "Claro y consultivo" : "Consultivo" },
              { id: "directo" as const, label: isEs ? "Directo" : "Direto", sub: isEs ? "Rápido y breve" : "Rápido e curto" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyTone(item.id)}
                className={cn(
                  "p-2.5 rounded-xl border text-left transition",
                  currentTone === item.id
                    ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                    : "border-border bg-background hover:bg-muted/40 text-muted-foreground",
                )}
              >
                <div className="text-xs font-semibold text-foreground">{item.label}</div>
                <div className="text-[10px] text-muted-foreground">{item.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{isEs ? "Objetivo breve del agente" : "Objetivo breve do agente"}</Label>
          <Textarea
            rows={2}
            value={cfg?.papel_objetivo || ""}
            onChange={(e) => setCfg((prev: any) => ({ ...(prev || {}), papel_objetivo: e.target.value }))}
            placeholder={
              isEs
                ? "Ej: Atender clientes, resolver dudas de precios, recomendar productos y agendar citas."
                : "Ex: Atender clientes, tirar dúvidas de preços, recomendar produtos e agendar horários."
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
            {isEs ? "Qué NO debe hacer nunca (Prohibiciones)" : "O que NUNCA deve fazer (Proibições)"}
          </Label>
          <Textarea
            rows={3}
            value={cfg?.nao_pode_fazer || ""}
            onChange={(e) => setCfg((prev: any) => ({ ...(prev || {}), nao_pode_fazer: e.target.value }))}
            placeholder={
              isEs
                ? "- No inventar precios ni promociones.\n- No confirmar pagos sin revisión humana."
                : "- Não inventar preços nem descontos.\n- Não confirmar pagamentos sem revisão."
            }
          />
        </div>
      </div>

      {/* Paso 2: Conocimiento y Archivos */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge variant="outline" className="text-[11px] font-semibold">
            {isEs ? "Paso 2 · Conocimiento y Archivos" : "Passo 2 · Conhecimento e Arquivos"}
          </Badge>
          {files.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={indexingKnowledge}
              onClick={() => void onReindexKnowledge()}
            >
              {indexingKnowledge ? <Loader2 className="size-3 animate-spin" /> : <RefreshCcw className="size-3" />}
              {isEs ? "Reindexar" : "Reindexar"}
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            {isEs ? "Información principal de tu negocio" : "Informações principais do seu negócio"}
          </Label>
          <Textarea
            rows={5}
            value={livre}
            onChange={(e) => setLivre(e.target.value)}
            placeholder={
              isEs
                ? "Describe horarios, ubicación, servicios, garantías y formas de pago..."
                : "Descreva horários, endereço, serviços, garantias e formas de pagamento..."
            }
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file: any) => {
              const isOk = file.textStatus === "ok";
              const isBad = file.textStatus === "ilegivel";
              return (
                <div
                  key={file.path}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-background/70 gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="size-4 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isOk ? (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15 gap-1">
                            <CheckCircle2 className="size-2.5" />
                            {isEs ? "Indexado" : "Indexado"} · {Number(file.textChars || 0).toLocaleString()} chars
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="size-2.5" />
                            {isBad ? (isEs ? "Ilegible" : "Ilegível") : isEs ? "Sin indexar" : "Pendente"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive shrink-0"
                    onClick={() => void onDeleteFile(file.path)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="relative rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-center hover:bg-primary/10 transition cursor-pointer">
          <input
            type="file"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => void onFileUpload(e)}
            disabled={uploadingFile}
            accept=".pdf,.txt,.doc,.docx"
          />
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-primary">
            {uploadingFile ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            <span>
              {uploadingFile
                ? isEs
                  ? "Subiendo e indexando..."
                  : "Enviando e indexando..."
                : isEs
                  ? "Subir PDF, DOCX o TXT de tu negocio"
                  : "Enviar PDF, DOCX ou TXT do seu negócio"}
            </span>
          </div>
        </div>
      </div>

      {/* Paso 3: Capacidades en 1 clic */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Badge variant="outline" className="text-[11px] font-semibold">
          {isEs ? "Paso 3 · Capacidades en 1 clic" : "Passo 3 · Capacidades em 1 clique"}
        </Badge>

        <div className="divide-y divide-border">
          <div className="py-3 first:pt-0 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold">
                {isEs ? "Consultar Catálogo en vivo" : "Consultar Catálogo ao vivo"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isEs ? "Usa precios, stock y productos reales registrados en el CRM." : "Usa preços e estoque reais cadastrados no CRM."}
              </p>
            </div>
            <Switch checked={catalogEnabled} onCheckedChange={onToggleCatalog} />
          </div>

          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold">
                {isEs ? "Agendar Citas automáticamente" : "Agendar Horários automaticamente"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isEs ? "Permite proponer horarios y registrar reservas en la agenda." : "Permite propor horários e registrar compromissos."}
              </p>
            </div>
            <Switch checked={agendamentoAtivo} onCheckedChange={setAgendamentoAtivo} />
          </div>

          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold">
                {isEs ? "Responder en partes (estilo humano)" : "Responder em partes (estilo humano)"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isEs ? "Divide respuestas en mensajes cortos tipo chat de WhatsApp." : "Divide respostas em mensagens curtas estilo WhatsApp."}
              </p>
            </div>
            <Switch checked={responderEmPartes} onCheckedChange={setResponderEmPartes} />
          </div>

          <div className="py-3 last:pb-0 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  {isEs ? "Secretario Ejecutivo por WhatsApp" : "Secretário Executivo via WhatsApp"}
                  {!hasSecretaryFeature && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Lock className="size-2.5" /> Pro
                    </Badge>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isEs
                    ? "Recibe aprobaciones de pagos y controla leads desde tu WhatsApp privado."
                    : "Receba aprovações de pagamentos e controle leads pelo seu WhatsApp."}
                </p>
              </div>
              <Switch
                disabled={!hasSecretaryFeature || savingSecretary}
                checked={secretaryEnabled}
                onCheckedChange={async (checked) => {
                  setSavingSecretary(true);
                  try {
                    await onQuickEnableSecretary(checked, quickPhone || undefined);
                  } finally {
                    setSavingSecretary(false);
                  }
                }}
              />
            </div>

            {hasSecretaryFeature && (
              <div className="flex items-center gap-2 pl-1">
                <Phone className="size-3.5 text-muted-foreground shrink-0" />
                <Input
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  placeholder={isEs ? "Teléfono dueño (ej: 584121234567)" : "Telefone do dono (ex: 5511999999999)"}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  disabled={savingSecretary || quickPhone.replace(/\D/g, "").length < 10}
                  onClick={async () => {
                    setSavingSecretary(true);
                    try {
                      await onQuickEnableSecretary(true, quickPhone);
                    } finally {
                      setSavingSecretary(false);
                    }
                  }}
                >
                  {savingSecretary ? <Loader2 className="size-3 animate-spin" /> : isEs ? "Vincular" : "Salvar"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Paso 4: Resumen listo */}
      <div className="rounded-2xl border border-border bg-muted/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sliders className="size-4 text-primary" />
            <h4 className="text-xs font-bold">
              {isEs ? "Paso 4 · Todo listo para probar" : "Passo 4 · Tudo pronto para testar"}
            </h4>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isEs
              ? "Guarda tus cambios y usa el simulador a la derecha. Si ves una respuesta mejorable, pulsa 'Corregir respuesta'."
              : "Salve as alterações e use o simulador à direita. Se quiser ajustar uma fala, clique em 'Corrigir resposta'."}
          </p>
        </div>

        <Button onClick={() => void onSave()} disabled={saving} className="shrink-0 gap-2 text-xs">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {isEs ? "Guardar cambios" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
