import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  QrCode,
  Loader2,
  ShieldCheck,
  Radio,
  Info,
  CheckCircle2,
} from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"business" | "mtproto">("business");
  const [token, setToken] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function salvarBusiness() {
    setBusy(true);
    try {
      const r: any = await connect({
        data: { botToken: token.trim(), displayName: nome.trim() || null },
      });
      toast.success(
        r?.username
          ? `Bot @${r.username} conectado com sucesso para Telegram Business!`
          : "Bot do Telegram Business conectado!",
      );
      setToken("");
      setNome("");
      onOpenChange(false);
      onConnected?.();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao conectar o bot do Telegram");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
              <Bot className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Conectar Telegram</DialogTitle>
              <DialogDescription className="text-xs">
                Escolha a modalidade de integração de acordo com a necessidade da sua empresa.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="w-full pt-1"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="business" className="flex items-center gap-1.5 text-xs">
              <Bot className="size-3.5" />
              <span>Telegram Business</span>
            </TabsTrigger>
            <TabsTrigger value="mtproto" className="flex items-center gap-1.5 text-xs">
              <QrCode className="size-3.5" />
              <span>Canais por QR</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-1 ml-1 bg-amber-500/10 text-amber-700">
                Fase 2
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: TELEGRAM BUSINESS */}
          <TabsContent value="business" className="space-y-4 pt-2">
            <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 text-xs text-sky-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-sky-950">
                <ShieldCheck className="size-4 text-sky-600 shrink-0" />
                <span>Atendimento 1 a 1 de Mensagens da Empresa</span>
              </div>
              <p className="text-sky-800/90 leading-relaxed text-[11px]">
                Conecte o bot técnico gerado no <strong>@BotFather</strong> e vincule-o no aplicativo do Telegram em:{" "}
                <em>Configurações &gt; Telegram Business &gt; Chatbots</em>. Suas conversas privadas entrarão no CRM com IA e roteamento humano.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Token do Bot (BotFather)</Label>
                <Input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="123456789:AAE..."
                  autoComplete="off"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nome da Conexão (opcional)</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Atendimento Comercial Telegram"
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 sm:justify-between">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                <span>Segurança de webhooks com hash SHA-256</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={salvarBusiness}
                  disabled={busy || token.trim().length < 20}
                  className="bg-sky-600 hover:bg-sky-700 text-white"
                >
                  {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                  Conectar Business
                </Button>
              </div>
            </DialogFooter>
          </TabsContent>

          {/* ABA 2: CONTA POR QR (CANAIS E ÁLBUMES MTPROTO) */}
          <TabsContent value="mtproto" className="space-y-4 pt-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-950 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <Radio className="size-4 text-amber-600 shrink-0" />
                <span>Canais de Difusão, Álbuns e Hilos de Discussão</span>
              </div>
              <p className="text-amber-900/90 leading-relaxed text-[11px]">
                Esta modalidade permite conectar uma conta Telegram oficial por QR Code para publicar carrosséis/álbuns, agendar posts no módulo de Conteúdo, sincronizar histórico retroativo e moderar comentários de canais vinculados.
              </p>
              <div className="flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-100/60 p-2 rounded-md">
                <Info className="size-3.5 shrink-0" />
                <span>A pasarela persistente MTProto está sendo preparada na Fase 2 para isolamento multi-tenant seguro.</span>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-muted p-6 text-center space-y-2">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                <QrCode className="size-6" />
              </div>
              <h4 className="text-xs font-semibold text-foreground">Leitor de QR Code MTProto</h4>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                Na ativação da Fase 2, você escaneará o código direto do app do Telegram com suporte a 2FA para gerenciar todos os seus canais.
              </p>
            </div>

            <DialogFooter className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Entendido
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
