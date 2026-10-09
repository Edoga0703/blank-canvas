import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { Forward, Lock, Search, Users } from "lucide-react";
import { toast } from "sonner";
import {
  listarDestinosEncaminhamento,
  encaminharMensagem,
  type DestinoEncaminhar,
} from "@/lib/forward.functions";

export function ForwardMessageDialog({
  open, onOpenChange, messageId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  messageId: string | null;
}) {
  const listarFn = useServerFn(listarDestinosEncaminhamento);
  const encaminharFn = useServerFn(encaminharMensagem);

  const [destinos, setDestinos] = useState<DestinoEncaminhar[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) { setSelecionados([]); setBusca(""); return; }
    setLoading(true);
    listarFn({ data: {} })
      .then((r: any) => setDestinos(r ?? []))
      .catch((e: any) => toast.error(e?.message ?? "Não foi possível carregar os contatos."))
      .finally(() => setLoading(false));
  }, [open]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return destinos;
    const digits = q.replace(/\D/g, "");
    return destinos.filter((d) =>
      (d.nome ?? "").toLowerCase().includes(q) || (!!digits && d.numero.includes(digits)),
    );
  }, [destinos, busca]);

  function toggle(d: DestinoEncaminhar) {
    if (!d.permitido) {
      toast.error(d.motivo ?? "Você não tem permissão para enviar mensagem para este contato.");
      return;
    }
    setSelecionados((s) => s.includes(d.numero) ? s.filter((n) => n !== d.numero) : [...s, d.numero]);
  }

  async function enviar() {
    if (!messageId || !selecionados.length) return;
    setEnviando(true);
    try {
      const r: any = await encaminharFn({ data: { messageId, destinos: selecionados } });
      const falhas = (r?.resultados ?? []).filter((x: any) => !x.ok);
      if (r?.enviados) toast.success(`Mensagem encaminhada para ${r.enviados} conversa(s).`);
      if (falhas.length) toast.error(`${falhas.length} não recebeu: ${falhas[0]?.erro ?? "falha no envio"}`);
      if (r?.enviados) onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível encaminhar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Forward className="size-4" /> Encaminhar mensagem
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar contato ou grupo…"
            className="pl-9 h-9"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto -mx-2 px-2 space-y-0.5">
          {loading && <div className="py-8 text-center text-[13px] text-muted-foreground">Carregando…</div>}
          {!loading && !filtrados.length && (
            <div className="py-8 text-center text-[13px] text-muted-foreground">Nenhuma conversa encontrada.</div>
          )}
          {filtrados.map((d) => {
            const marcado = selecionados.includes(d.numero);
            return (
              <button
                key={d.numero}
                type="button"
                onClick={() => toggle(d)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition ${
                  marcado ? "bg-[color:var(--brand-soft)]" : "hover:bg-[color:var(--panel-2)]"
                } ${d.permitido ? "" : "opacity-55"}`}
              >
                {d.foto_url ? (
                  <img src={d.foto_url} alt="" className="size-9 rounded-full object-cover shrink-0" />
                ) : (
                  <InitialsAvatar name={d.nome || d.numero} size={36} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium truncate flex items-center gap-1.5">
                    {d.grupo && <Users className="size-3.5 opacity-70 shrink-0" />}
                    {d.nome || d.numero}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">
                    {d.permitido ? (d.grupo ? "Grupo" : d.numero) : d.motivo}
                  </div>
                </div>
                {d.permitido ? (
                  <span className={`size-4 rounded-full border shrink-0 ${marcado ? "bg-[color:var(--brand)] border-[color:var(--brand)]" : "border-[color:var(--hairline)]"}`} />
                ) : (
                  <Lock className="size-4 text-muted-foreground shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[12px] text-muted-foreground">
            {selecionados.length ? `${selecionados.length} selecionada(s)` : "Selecione as conversas"}
          </span>
          <Button size="sm" disabled={!selecionados.length || enviando} onClick={() => void enviar()}>
            <Forward className="size-4 mr-1" /> {enviando ? "Enviando…" : "Encaminhar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
