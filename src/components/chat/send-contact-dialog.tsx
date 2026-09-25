import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, UserRound } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listarContatosParaEnvio, enviarCartaoContato, type ContatoEnviavel } from "@/lib/contact-card.functions";

function formatarNumero(numero: string) {
  const d = numero.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const meio = rest.length > 8 ? rest.slice(0, rest.length - 4) : rest.slice(0, 4);
    const fim = rest.slice(-4);
    return `+55 (${ddd}) ${meio}-${fim}`;
  }
  return `+${d}`;
}

export function SendContactDialog({
  open, onOpenChange, numero, contatoNome, onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  numero: string;
  contatoNome?: string | null;
  onSent?: () => void;
}) {
  const listar = useServerFn(listarContatosParaEnvio);
  const enviar = useServerFn(enviarCartaoContato);

  const [contatos, setContatos] = useState<ContatoEnviavel[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<ContatoEnviavel | null>(null);
  const [manualNome, setManualNome] = useState("");
  const [manualNumero, setManualNumero] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) {
      setBusca(""); setSelecionado(null); setManualNome(""); setManualNumero("");
      return;
    }
    setLoading(true);
    listar({ data: {} })
      .then((l) => setContatos(l as ContatoEnviavel[]))
      .catch((e: any) => toast.error(e?.message ?? "Falha ao carregar contatos"))
      .finally(() => setLoading(false));
  }, [open]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return contatos;
    const d = q.replace(/\D/g, "");
    return contatos.filter(
      (c) => (c.nome ?? "").toLowerCase().includes(q) || (d && c.numero.includes(d)),
    );
  }, [contatos, busca]);

  const podeEnviar = selecionado
    ? true
    : manualNome.trim().length > 1 && manualNumero.replace(/\D/g, "").length >= 8;

  async function handleEnviar() {
    if (!podeEnviar || enviando) return;
    setEnviando(true);
    try {
      const cartaoNome = selecionado ? (selecionado.nome ?? formatarNumero(selecionado.numero)) : manualNome.trim();
      const cartaoNumero = selecionado ? selecionado.numero : manualNumero;
      await enviar({ data: { numero, contatoNome: contatoNome ?? null, cartaoNome, cartaoNumero } });
      toast.success("Contato enviado");
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar o contato");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar contato</DialogTitle>
          <DialogDescription>
            Escolha um contato salvo ou digite um novo. Ele chega como cartão de contato no WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar contato..."
            className="pl-9"
          />
        </div>

        <div className="max-h-[280px] overflow-auto rounded-lg border border-border divide-y divide-border">
          {loading ? (
            <div className="p-6 grid place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filtrados.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum contato encontrado.</p>
          ) : (
            filtrados.map((c) => {
              const ativo = selecionado?.numero === c.numero;
              return (
                <button
                  key={c.numero}
                  type="button"
                  onClick={() => setSelecionado(ativo ? null : c)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${ativo ? "bg-primary/10" : "hover:bg-muted"}`}
                >
                  {c.foto_url ? (
                    <img src={c.foto_url} alt="" className="size-9 rounded-full object-cover" />
                  ) : (
                    <span className="size-9 rounded-full bg-muted grid place-items-center">
                      <UserRound className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.nome ?? formatarNumero(c.numero)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{formatarNumero(c.numero)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {!selecionado && (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">Ou informe um contato manualmente</p>
            <div className="grid grid-cols-2 gap-2">
              <Input value={manualNome} onChange={(e) => setManualNome(e.target.value)} placeholder="Nome" />
              <Input value={manualNumero} onChange={(e) => setManualNumero(e.target.value)} placeholder="55859..." />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
          <Button onClick={() => void handleEnviar()} disabled={!podeEnviar || enviando}>
            {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Enviar contato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
