import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Clock, CheckCircle2, XCircle, FileText } from "lucide-react";
import type { HsmListItem } from "@/lib/hsm-templates.functions";

const STATUS_UI = {
  aprovado: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Aprovado", desc: "Template aprovado e pronto para uso em campanhas." },
  pendente: { icon: Clock, cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Aguardando aprovação", desc: "A Meta normalmente aprova templates em até 24h. Você será notificado automaticamente quando o status mudar." },
  reprovado: { icon: XCircle, cls: "bg-red-50 text-red-700 border-red-200", label: "Reprovado", desc: "A Meta rejeitou este template. Revise e envie novamente." },
  rascunho: { icon: FileText, cls: "bg-muted text-muted-foreground border-border", label: "Rascunho", desc: "Ainda não foi enviado para aprovação da Meta." },
} as const;

const CAT_LABEL: Record<string, string> = { MARKETING: "MARKETING", UTILITY: "UTILITY", AUTHENTICATION: "AUTHENTICATION" };

export function TemplateDetailDialog({
  open, onOpenChange, template, onEdit, onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: HsmListItem | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!template) return null;
  const ui = STATUS_UI[template.status] ?? STATUS_UI.rascunho;
  const Icon = ui.icon;
  const connName = template.instance_display_name || template.instance_name || "—";
  const vars = template.variaveis ?? {};
  const varKeys = Object.keys(vars);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{template.nome}</DialogTitle>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {CAT_LABEL[template.categoria]} · {template.idioma} · {connName}
          </p>
        </DialogHeader>

        <div className={`rounded-lg border p-3 flex items-start gap-2 ${ui.cls}`}>
          <Icon className="size-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">{ui.label}</p>
            <p className="text-xs opacity-90 mt-0.5">{ui.desc}</p>
            {template.status === "reprovado" && template.meta_ultimo_erro && (
              <p className="text-xs mt-1"><b>Motivo:</b> {template.meta_ultimo_erro}</p>
            )}
          </div>
        </div>

        <div className="mt-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Preview como aparece no WhatsApp</p>
          <div className="rounded-lg p-3" style={{ background: "#e5ddd5" }}>
            <div className="bg-white rounded-lg p-2.5 max-w-full shadow-sm relative">
              {template.header_tipo === "TEXT" && template.header_conteudo && (
                <p className="font-semibold text-sm mb-1">{template.header_conteudo}</p>
              )}
              {template.header_tipo === "MEDIA" && (
                <div className="rounded bg-muted h-24 grid place-items-center text-[11px] text-muted-foreground mb-2">📎 Mídia</div>
              )}
              <p className="text-sm whitespace-pre-wrap text-slate-800">{template.corpo}</p>
              {template.rodape && <p className="text-[11px] text-slate-500 mt-1">{template.rodape}</p>}
              <p className="text-[10px] text-slate-400 text-right mt-1">12:34</p>
              {(template.botoes ?? []).length > 0 && (
                <div className="mt-2 border-t pt-1 space-y-1">
                  {(template.botoes ?? []).map((b: any, i: number) => (
                    <div key={i} className="text-center py-1.5 text-sm text-[color:var(--brand)] border-t first:border-t-0">
                      {b.texto || "Botão"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {varKeys.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Variáveis</p>
            <div className="text-sm space-y-0.5">
              {varKeys.map((k) => (
                <div key={k}><code className="text-xs bg-muted px-1 rounded">{`{{${k}}}`}</code> = {vars[k]}</div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onDelete} className="text-red-600 mr-auto">
            <Trash2 className="size-4 mr-1.5" /> Excluir
          </Button>
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="size-4 mr-1.5" /> Editar
          </Button>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
