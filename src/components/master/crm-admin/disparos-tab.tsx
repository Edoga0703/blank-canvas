import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { previewAdminBroadcast, sendAdminBroadcastNow } from "@/lib/admin-crm.functions";

const SEGMENTOS = [
  { id: "todos", label: "Toda a base" },
  { id: "trial", label: "Em teste" },
  { id: "ativos", label: "Ativos" },
  { id: "inadimplentes", label: "Inadimplentes" },
  { id: "inativos", label: "Inativos (15+ dias)" },
];

export function DisparosTab({ temConexao, onDone }: { temConexao: boolean; onDone: () => void }) {
  const preview = useServerFn(previewAdminBroadcast);
  const enviar = useServerFn(sendAdminBroadcastNow);

  const [seg, setSeg] = useState("todos");
  const [texto, setTexto] = useState("");
  const [alvos, setAlvos] = useState<{ total: number; exemplos: string[] } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setAlvos(null);
    void preview({ data: { segmento: seg } })
      .then(setAlvos)
      .catch(() => setAlvos(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 font-medium">
        <Send className="h-4 w-4" /> Disparo para a base
      </div>

      <div className="flex flex-wrap gap-2">
        {SEGMENTOS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSeg(s.id)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              seg === s.id ? "text-white" : "text-muted-foreground border-[color:var(--hairline)]"
            }`}
            style={seg === s.id ? { background: "var(--brand)", borderColor: "var(--brand)" } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Textarea
        rows={5}
        placeholder="Olá {{nome}}, novidade na Metrix CRM…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      {!temConexao && (
        <p className="text-xs text-amber-600">
          Conecte um número no espaço interno para liberar o envio.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {alvos ? `${alvos.total} destinatário(s)` : "calculando…"}
          {alvos?.exemplos.length ? ` · ex.: ${alvos.exemplos.join(", ")}` : ""}
        </p>
        <Button
          disabled={sending || !texto.trim() || !temConexao}
          onClick={async () => {
            setSending(true);
            try {
              const r = await enviar({ data: { segmento: seg, texto } });
              toast.success(`Disparo concluído: ${r.enviados} enviado(s), ${r.erros} erro(s)`);
              setTexto("");
              onDone();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSending(false);
            }
          }}
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar
        </Button>
      </div>
    </Card>
  );
}
