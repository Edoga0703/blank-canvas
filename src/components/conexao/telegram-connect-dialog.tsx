import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { connectTelegram } from "@/lib/telegram.functions";

export function TelegramConnectDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConnected?: () => void;
}) {
  const connect = useServerFn(connectTelegram);
  const [token, setToken] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function salvar() {
    setBusy(true);
    try {
      const r: any = await connect({ data: { botToken: token.trim(), displayName: nome.trim() || null } });
      toast.success(r?.username ? `Bot @${r.username} conectado!` : "Bot do Telegram conectado!");
      setToken("");
      setNome("");
      onOpenChange(false);
      onConnected?.();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao conectar o bot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar Telegram</DialogTitle>
          <DialogDescription>
            Abra o <strong>@BotFather</strong> no Telegram, envie <code>/newbot</code>, siga os passos e cole
            aqui o token gerado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Token do bot</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAE..."
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nome da conexão (opcional)</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Atendimento Telegram" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={busy || token.trim().length < 20}>
            {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
