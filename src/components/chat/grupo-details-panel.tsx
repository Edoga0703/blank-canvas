import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Users, RefreshCw, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarViewer } from "@/components/ui/avatar-viewer";
import { ConversationMediaTab } from "@/components/chat/conversation-media-panel";
import { detalhesGrupo, type GrupoDetalhe } from "@/lib/grupos.functions";

function numeroParticipante(numero: string | null, jid: string) {
  return numero || (!jid.includes("@lid") ? jid.split("@")[0]?.replace(/\D/g, "") : "") || "";
}

export function GrupoDetailsPanel({
  jid,
  nomeFallback,
  onOpenPrivate,
}: {
  jid: string;
  nomeFallback?: string | null;
  onOpenPrivate: (numero: string, nome: string | null) => void;
}) {
  const fetchDetalhes = useServerFn(detalhesGrupo);
  const [info, setInfo] = useState<GrupoDetalhe | null>(null);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");

  async function carregar() {
    setLoading(true);
    try {
      const d = await fetchDetalhes({ data: { jid } });
      setInfo(d ?? null);
    } catch {
      /* mantém o que já existe */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setInfo(null);
    setBusca("");
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jid]);

  const nome = info?.nome || nomeFallback || "Grupo";
  const lista = (info?.lista ?? []).filter((p) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return (p.nome ?? "").toLowerCase().includes(q) || numeroParticipante(p.numero, p.jid).includes(q.replace(/\D/g, ""));
  });

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-w-0 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 min-w-0">
        <AvatarViewer name={nome} size={44} src={info?.foto_url ?? undefined} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{nome}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Users className="size-3" />
            {info?.participantes ?? lista.length} participantes
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void carregar()} disabled={loading} title="Atualizar">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {info?.descricao && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Descrição</p>
          <p className="text-xs whitespace-pre-wrap break-words">{info.descricao}</p>
        </div>
      )}

      {/* Participantes */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Participantes</p>
        {lista.length > 5 && (
          <Input
            placeholder="Buscar participante"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-7 text-xs"
          />
        )}
        {lista.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {loading ? "Carregando participantes…" : "Lista de participantes indisponível nesta conexão."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border)] divide-y divide-[var(--border)] max-h-72 overflow-y-auto">
            {lista.map((p) => {
              const numero = numeroParticipante(p.numero, p.jid);
              const identificacao = p.nome || numero || "Participante";
              return (
              <div key={p.jid} className="flex items-center gap-2 px-2.5 py-2">
                <AvatarViewer name={identificacao} size={30} src={p.foto_url ?? undefined} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{identificacao}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">{numero || "Número não disponibilizado"}</div>
                </div>
                {p.admin && (
                  <span className="text-[9px] uppercase rounded px-1.5 py-0.5 bg-muted text-muted-foreground shrink-0">admin</span>
                )}
                {numero && (
                  <>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0" title="Conversar no privado" onClick={() => onOpenPrivate(numero, p.nome)}>
                      <MessageCircle className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0" title="Copiar número" onClick={() => { navigator.clipboard.writeText(numero); toast.success("Copiado"); }}>
                      <Copy className="size-3" />
                    </Button>
                  </>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mídias do grupo */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mídias</p>
        <ConversationMediaTab numero={jid} contatoNome={nome} />
      </div>
    </div>
  );
}
