import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Instagram, Loader2, Facebook } from "lucide-react";
import { toast } from "sonner";
import { listMetaOAuthTargets, connectMetaOAuthTargets } from "@/lib/meta-oauth.functions";

type Target = {
  pageId: string;
  pageName: string | null;
  pagePicture?: string | null;
  igId: string | null;
  igUsername: string | null;
  igPicture?: string | null;
};

/**
 * Processa o retorno do login da Meta (?meta=selecionar&session=...) e abre a
 * seleção de Páginas/contas do Instagram. Sem UI própria — as contas conectadas
 * aparecem dentro dos cards de plugin em Conexões.
 */
export function MetaOAuthHandler({ onConnected }: { onConnected?: () => void }) {
  const loadTargets = useServerFn(listMetaOAuthTargets);
  const connectTargets = useServerFn(connectMetaOAuthTargets);

  const [session, setSession] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [withInstagram, setWithInstagram] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const meta = params.get("meta");
    if (!meta) return;
    if (meta === "erro") toast.error(params.get("msg") || "Falha ao conectar com a Meta.");
    if (meta === "selecionar" && params.get("session")) {
      const handle = params.get("session")!;
      setTimeout(() => void openSelection(handle), 100);
    }
    const clean = new URL(window.location.href);
    ["meta", "msg", "session", "code"].forEach((k) => clean.searchParams.delete(k));
    window.history.replaceState({}, "", clean.toString());
  }, []);

  async function openSelection(handle: string) {
    setSession(handle);
    setLoading(true);
    try {
      const r: any = await loadTargets({ data: { session: handle } } as any);
      if (!r?.ok) {
        toast.error(r?.error || "Sessão expirada.");
        setSession(null);
        return;
      }
      const found: Target[] = r.targets ?? [];
      if (!found.length) {
        toast.error("Nenhuma Página do Facebook foi encontrada nessa conta.");
        setSession(null);
        return;
      }
      setTargets(found);
      setSelected(found.map((t) => t.pageId));
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar as Páginas.");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!session) return;
    setSaving(true);
    try {
      const r: any = await connectTargets({ data: { session, pageIds: selected, withInstagram } } as any);
      if (!r?.ok) {
        toast.error(r?.error || "Não foi possível conectar.");
        return;
      }
      toast.success(`${r.connected?.length ?? 0} canal(is) conectado(s).`);
      if (r.skipped?.length) {
        toast.warning(`Limite do plano: ${r.skipped.length} conta(s) não conectada(s) — 1 por canal.`);
      }
      for (const w of (r.warnings ?? []) as string[]) {
        toast.warning(w, { duration: 12000 });
      }
      setSession(null);
      setTargets([]);
      onConnected?.();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível conectar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!session} onOpenChange={(o) => { if (!o) { setSession(null); setTargets([]); } }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Escolha o que conectar</DialogTitle>
          <DialogDescription>
            Selecione as Páginas do Facebook que devem receber mensagens no Capi Conversa.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="size-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="space-y-2 rounded-xl border bg-muted/20 p-2">
              {targets.map((t) => (
                <label
                  key={t.pageId}
                  className={`flex items-center gap-3 text-sm cursor-pointer p-3 rounded-xl border transition-colors ${
                    selected.includes(t.pageId)
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/30"
                  }`}
                >
                  <Checkbox
                    checked={selected.includes(t.pageId)}
                    onCheckedChange={(v) =>
                      setSelected((prev) => (v ? [...prev, t.pageId] : prev.filter((id) => id !== t.pageId)))
                    }
                    className="size-4 shrink-0"
                  />
                  <div className="flex -space-x-2 shrink-0">
                    <Avatar className="size-9 border-2 border-background">
                      <AvatarImage src={t.pagePicture || undefined} />
                      <AvatarFallback><Facebook className="size-4" /></AvatarFallback>
                    </Avatar>
                    {t.igId && (
                      <Avatar className="size-9 border-2 border-background">
                        <AvatarImage src={t.igPicture || undefined} />
                        <AvatarFallback><Instagram className="size-4" /></AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm leading-tight">{t.pageName || t.pageId}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground min-w-0">
                      {t.igUsername ? (
                        <>
                          <Instagram className="size-3 shrink-0" />
                          <span className="truncate">@{t.igUsername}</span>
                        </>
                      ) : (
                        <span className="truncate">Apenas Messenger</span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <label
              htmlFor="with-ig"
              className="flex items-center gap-3 p-3 rounded-xl border border-dashed text-sm cursor-pointer select-none"
            >
              <Checkbox
                id="with-ig"
                checked={withInstagram}
                onCheckedChange={(v) => setWithInstagram(!!v)}
                className="size-4 shrink-0"
              />
              <span className="flex-1 min-w-0">
                Conectar também o Instagram Direct vinculado (recomendado para atendimento multicanal)
              </span>
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setSession(null); setTargets([]); }}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving || !selected.length}>
            {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
