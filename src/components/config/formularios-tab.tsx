import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, ExternalLink, Files, Loader2, Pencil, Plus, Trash2, FileText } from "lucide-react";
import { listLeadForms, deleteLeadForm, duplicateLeadForm } from "@/lib/lead-forms.functions";
import type { LeadFormRow } from "@/lib/lead-forms-types";
import { FormBuilderDialog } from "@/components/config/form-builder-dialog";

export function FormulariosTab() {
  const list = useServerFn(listLeadForms);
  const del = useServerFn(deleteLeadForm);
  const dup = useServerFn(duplicateLeadForm);
  const [rows, setRows] = useState<LeadFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeadFormRow | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setRows(((await list()) as LeadFormRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  const origin = "https://metrixcrm.com.br";

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${origin}/f/${slug}`).then(() => toast.success("Link copiado"));
  }

  async function remove(id: string) {
    if (!confirm("Excluir este formulário? O link deixa de funcionar.")) return;
    try {
      await del({ data: { id } });
      toast.success("Formulário excluído");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <FileText className="size-4" /> Formulários de captura
          </h2>
          <p className="text-xs text-muted-foreground">
            Crie páginas de captura com link próprio. Quem preencher entra direto no seu CRM.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4 mr-1.5" /> Novo formulário
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando...
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum formulário ainda. Crie o primeiro e use o link nas suas campanhas.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((f) => {
            const conv = f.views ? Math.round((f.submits / f.views) * 100) : null;
            return (
              <Card key={f.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        {f.nome}
                        {!f.ativo && <Badge variant="secondary">Inativo</Badge>}
                      </div>
                      <a
                        href={`/f/${f.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:underline truncate block"
                      >
                        {origin}/f/{f.slug}
                      </a>
                    </div>
                    <div
                      className="size-9 rounded-lg shrink-0 border"
                      style={{ background: (f.theme as any)?.corPrimaria ?? "#0B22FE" }}
                    />
                  </div>

                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span><b className="text-foreground">{f.submits}</b> leads</span>
                    {conv != null && <span><b className="text-foreground">{conv}%</b> conversão</span>}
                    <span>{(f.campos as any[])?.length ?? 0} campos</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(f); setOpen(true); }}>
                      <Pencil className="size-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copyLink(f.slug)}>
                      <Copy className="size-3.5 mr-1" /> Copiar link
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /></a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try { await dup({ data: { id: f.id } }); toast.success("Formulário duplicado"); refresh(); }
                        catch (e: any) { toast.error(e?.message ?? "Falha"); }
                      }}
                    >
                      <Files className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
                      <Trash2 className="size-3.5 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <FormBuilderDialog open={open} onOpenChange={setOpen} initial={editing} onSaved={refresh} />
    </div>
  );
}
