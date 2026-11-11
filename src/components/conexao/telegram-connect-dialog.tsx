import { useState, useEffect, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Bot,
  QrCode,
  Loader2,
  ShieldCheck,
  Radio,
  CheckCircle2,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Trash2,
  Users,
  Layers,
  ArrowRight,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import { connectTelegram } from "@/lib/telegram.functions";
import {
  startTelegramQrSession,
  checkTelegramQrStatus,
  submitTelegram2faPassword,
  listTelegramAdminChannels,
  linkTelegramChannels,
  listConnectedTelegramAccounts,
  disconnectTelegramQrAccount,
} from "@/lib/telegram-mtproto.functions";
import type {
  TelegramChannelInfo,
  TelegramConnectedAccount,
} from "@/lib/telegram/contracts";

type MtprotoStep = "list" | "scanning" | "password_2fa" | "selecting_channels";

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
  const startQrFn = useServerFn(startTelegramQrSession);
  const checkQrFn = useServerFn(checkTelegramQrStatus);
  const submit2faFn = useServerFn(submitTelegram2faPassword);
  const listChannelsFn = useServerFn(listTelegramAdminChannels);
  const linkChannelsFn = useServerFn(linkTelegramChannels);
  const listAccountsFn = useServerFn(listConnectedTelegramAccounts);
  const disconnectQrFn = useServerFn(disconnectTelegramQrAccount);

  const [activeTab, setActiveTab] = useState<"business" | "mtproto">("business");

  // State Business Bot
  const [token, setToken] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  // State MTProto QR
  const [mtprotoStep, setMtprotoStep] = useState<MtprotoStep>("list");
  const [accounts, setAccounts] = useState<TelegramConnectedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [isQrExpired, setIsQrExpired] = useState(false);

  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [channels, setChannels] = useState<TelegramChannelInfo[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Carregar contas MTProto ao abrir o modal ou mudar para aba MTProto
  useEffect(() => {
    if (open && activeTab === "mtproto") {
      carregarContas();
    }
  }, [open, activeTab]);

  // Limpeza de intervalos ao desmontar
  useEffect(() => {
    return () => {
      limparIntervalos();
    };
  }, []);

  function limparIntervalos() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }

  async function carregarContas() {
    setLoadingAccounts(true);
    try {
      const res = await listAccountsFn();
      setAccounts(res?.accounts || []);
      if (!res?.accounts?.length && mtprotoStep === "list") {
        // Mantém list para que o usuário veja o botão de gerar QR
      }
    } catch {
      /* fallback */
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function iniciarFluxoQr() {
    limparIntervalos();
    setMtprotoStep("scanning");
    setBusy(true);
    setIsQrExpired(false);
    setQrDataUrl(null);
    setTwoFactorPassword("");

    try {
      const res = await startQrFn();
      setSessionId(res.sessionId);
      setConnectionId(res.connectionId);
      setQrDataUrl(res.qrDataUrl);
      setQrExpiresAt(res.expiresAt);

      const expiresTs = new Date(res.expiresAt).getTime();
      const initialDiff = Math.max(0, Math.floor((expiresTs - Date.now()) / 1000));
      setSecondsLeft(initialDiff || 60);

      // Iniciar contador regressivo
      countdownIntervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsQrExpired(true);
            limparIntervalos();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Iniciar polling de status a cada 2.5s
      iniciarPolling(res.sessionId, res.connectionId);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar QR Code MTProto");
      setMtprotoStep("list");
    } finally {
      setBusy(false);
    }
  }

  function iniciarPolling(sessId: string, connId: string) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const statusRes = await checkQrFn({
          data: { sessionId: sessId, connectionId: connId },
        });

        if (statusRes.status === "waiting_password") {
          limparIntervalos();
          setMtprotoStep("password_2fa");
        } else if (statusRes.status === "authorized") {
          limparIntervalos();
          toast.success(
            statusRes.displayName
              ? `Conta "${statusRes.displayName}" conectada via MTProto!`
              : "Conta conectada com sucesso!",
          );
          carregarCanais(connId);
        } else if (statusRes.status === "expired") {
          limparIntervalos();
          setIsQrExpired(true);
        }
      } catch {
        /* best-effort polling */
      }
    }, 2500);
  }

  async function enviarSenha2Fa() {
    if (!sessionId || !connectionId || !twoFactorPassword.trim()) return;
    setBusy(true);
    try {
      const res = await submit2faFn({
        data: {
          sessionId,
          connectionId,
          password: twoFactorPassword.trim(),
        },
      });

      if (res.status === "authorized") {
        toast.success("Autenticação 2FA concluída com sucesso!");
        carregarCanais(connectionId);
      } else {
        toast.error("Senha incorreta ou pendente no Telegram.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao validar senha 2FA");
    } finally {
      setBusy(false);
    }
  }

  async function carregarCanais(connId: string) {
    setMtprotoStep("selecting_channels");
    setLoadingChannels(true);
    try {
      const res = await listChannelsFn({ data: { connectionId: connId } });
      const found = res?.channels || [];
      setChannels(found);

      // Pré-selecionar canais já vinculados ou todos os novos com canPost
      const initialSelected = new Set<string>();
      for (const ch of found) {
        if (ch.canPost) {
          initialSelected.add(ch.telegramChannelId);
        }
      }
      setSelectedChannels(initialSelected);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao buscar canais administrados");
    } finally {
      setLoadingChannels(false);
    }
  }

  async function salvarCanaisSelecionados() {
    if (!connectionId) return;
    setSavingChannels(true);
    try {
      const channelsToLink = channels.filter((c) =>
        selectedChannels.has(c.telegramChannelId),
      );

      const res = await linkChannelsFn({
        data: {
          connectionId,
          channels: channelsToLink,
        },
      });

      toast.success(
        `${res.linkedCount} canais vinculados com sucesso ao Capiversa CRM!`,
      );
      await carregarContas();
      setMtprotoStep("list");
      onConnected?.();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao vincular canais");
    } finally {
      setSavingChannels(false);
    }
  }

  async function desconectarConta(connId: string) {
    setBusy(true);
    try {
      await disconnectQrFn({ data: { connectionId: connId } });
      toast.success("Conta MTProto desconectada com sucesso");
      await carregarContas();
      onConnected?.();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao desconectar conta");
    } finally {
      setBusy(false);
    }
  }

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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
              <Bot className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Conectar Telegram</DialogTitle>
              <DialogDescription className="text-xs">
                Integração oficial dual: Business 1 a 1 e Canais de Conteúdo por QR Code.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as any);
            limparIntervalos();
          }}
          className="w-full pt-1"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="business" className="flex items-center gap-1.5 text-xs">
              <Bot className="size-3.5 text-sky-600" />
              <span>Telegram Business</span>
            </TabsTrigger>
            <TabsTrigger value="mtproto" className="flex items-center gap-1.5 text-xs">
              <QrCode className="size-3.5 text-amber-600" />
              <span>Canais por QR</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-1 ml-1 bg-emerald-500/10 text-emerald-700 font-semibold">
                MTProto
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* ========================================================================= */}
          {/* ABA 1: TELEGRAM BUSINESS (ATENDIMENTO 1 A 1) */}
          {/* ========================================================================= */}
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

          {/* ========================================================================= */}
          {/* ABA 2: CANAIS POR QR CODE (MTPROTO PERSISTENTE) */}
          {/* ========================================================================= */}
          <TabsContent value="mtproto" className="space-y-4 pt-2">
            {/* ETAPA 1: LISTAGEM DE CONTAS / DASHBOARD */}
            {mtprotoStep === "list" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3.5 text-xs text-sky-950 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-sky-900">
                    <Radio className="size-4 text-sky-600 shrink-0" />
                    <span>Canais de Difusão, Álbuns e Conteúdo Multicanal</span>
                  </div>
                  <p className="text-sky-800/90 leading-relaxed text-[11px]">
                    Conecte sua conta do Telegram via QR Code para publicar carrosséis, álbuns de fotos, vídeos e textos diretamente em seus canais pelo módulo de Conteúdo, além de sincronizar comentários em tempo real.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Contas Conectadas ({accounts.length})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={carregarContas}
                      disabled={loadingAccounts}
                      className="h-7 text-xs text-muted-foreground"
                    >
                      <RefreshCw className={`size-3 mr-1 ${loadingAccounts ? "animate-spin" : ""}`} />
                      Atualizar
                    </Button>
                  </div>

                  {loadingAccounts ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      <span>Carregando conexões MTProto...</span>
                    </div>
                  ) : accounts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-muted p-5 text-center space-y-2 bg-muted/20">
                      <QrCode className="size-8 mx-auto text-muted-foreground/60" />
                      <p className="text-xs text-muted-foreground">
                        Nenhuma conta MTProto conectada para gestão de canais.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {accounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card/60 hover:bg-card transition-colors text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="font-medium flex items-center gap-1.5 text-foreground">
                              <span>{acc.displayName || "Conta Telegram"}</span>
                              {acc.username && (
                                <span className="text-muted-foreground text-[11px]">
                                  @{acc.username}
                                </span>
                              )}
                              <Badge
                                variant={acc.status === "active" ? "default" : "secondary"}
                                className="text-[10px] py-0 px-1.5"
                              >
                                {acc.status === "active" ? "Ativa" : acc.status}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                              <span>ID: {acc.telegramActorId || "Pendente"}</span>
                              <span>•</span>
                              <span>{acc.channelCount || 0} canais vinculados</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setConnectionId(acc.id);
                                carregarCanais(acc.id);
                              }}
                            >
                              <Layers className="size-3 mr-1" />
                              Canais
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => desconectarConta(acc.id)}
                              disabled={busy}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter className="pt-2 sm:justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                  >
                    Fechar
                  </Button>
                  <Button
                    size="sm"
                    onClick={iniciarFluxoQr}
                    disabled={busy}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <QrCode className="size-3.5" />}
                    <span>Conectar Conta por QR Code</span>
                  </Button>
                </DialogFooter>
              </div>
            )}

            {/* ETAPA 2: ESCANEAMENTO DE QR CODE */}
            {mtprotoStep === "scanning" && (
              <div className="space-y-4 text-center">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">
                    Escanear QR Code no Telegram
                  </h4>
                  <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                    Abra o app no celular &gt; <strong>Configurações</strong> &gt;{" "}
                    <strong>Dispositivos</strong> &gt; <strong>Conectar Computador</strong>.
                  </p>
                </div>

                <div className="relative mx-auto flex size-64 items-center justify-center rounded-2xl border bg-white p-3 shadow-sm">
                  {busy || !qrDataUrl ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                      <Loader2 className="size-6 animate-spin text-primary" />
                      <span>Gerando QR Code MTProto...</span>
                    </div>
                  ) : isQrExpired ? (
                    <div className="flex flex-col items-center gap-3 p-4">
                      <RefreshCw className="size-8 text-amber-600" />
                      <p className="text-xs font-medium text-foreground">
                        Código QR expirado
                      </p>
                      <Button size="sm" onClick={iniciarFluxoQr} className="text-xs">
                        Renovar Código
                      </Button>
                    </div>
                  ) : (
                    <img
                      src={qrDataUrl}
                      alt="Telegram QR Code"
                      className="size-full object-contain rounded-lg"
                    />
                  )}
                </div>

                {!isQrExpired && qrDataUrl && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Loader2 className="size-3 animate-spin text-primary" />
                    <span>Aguardando leitura... Expira em {secondsLeft}s</span>
                  </div>
                )}

                <DialogFooter className="pt-1 sm:justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      limparIntervalos();
                      setMtprotoStep("list");
                    }}
                  >
                    <ChevronLeft className="size-3.5 mr-1" />
                    Voltar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={iniciarFluxoQr}
                    disabled={busy}
                  >
                    <RefreshCw className="size-3 mr-1" />
                    Novo Código
                  </Button>
                </DialogFooter>
              </div>
            )}

            {/* ETAPA 3: SENHA 2FA (SE NECESSÁRIA) */}
            {mtprotoStep === "password_2fa" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Lock className="size-4 text-amber-600 shrink-0" />
                    <span>Verificação em Duas Etapas (2FA)</span>
                  </div>
                  <p className="text-amber-900/90 leading-relaxed text-[11px]">
                    Sua conta do Telegram possui uma senha adicional de proteção. Digite-a abaixo para liberar a autorização de publicação.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Senha do Telegram (2FA)</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={twoFactorPassword}
                      onChange={(e) => setTwoFactorPassword(e.target.value)}
                      placeholder="Digite sua senha de duas etapas..."
                      className="pr-9 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") enviarSenha2Fa();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <DialogFooter className="pt-2 sm:justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      limparIntervalos();
                      setMtprotoStep("list");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={enviarSenha2Fa}
                    disabled={busy || !twoFactorPassword.trim()}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                  >
                    {busy && <Loader2 className="size-3.5 animate-spin" />}
                    Confirmar Senha 2FA
                  </Button>
                </DialogFooter>
              </div>
            )}

            {/* ETAPA 4: SELEÇÃO DE CANAIS PARA VINCULAR */}
            {mtprotoStep === "selecting_channels" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="size-4 text-primary" />
                    <span>Selecione os Canais para Gerenciar</span>
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Marque os canais que você deseja disponibilizar no módulo de Conteúdo e Publicação:
                  </p>
                </div>

                {loadingChannels ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span>Buscando seus canais administrados no Telegram...</span>
                  </div>
                ) : channels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-muted p-5 text-center text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Nenhum canal com permissão de administrador encontrado</p>
                    <p className="text-[11px]">
                      Certifique-se de que a conta conectada é administradora com direitos de postar mensagens em ao menos um canal de difusão.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {channels.map((ch) => {
                      const isSelected = selectedChannels.has(ch.telegramChannelId);
                      return (
                        <div
                          key={ch.telegramChannelId}
                          onClick={() => {
                            const next = new Set(selectedChannels);
                            if (next.has(ch.telegramChannelId)) {
                              next.delete(ch.telegramChannelId);
                            } else {
                              next.add(ch.telegramChannelId);
                            }
                            setSelectedChannels(next);
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? "border-primary/50 bg-primary/5"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {
                                const next = new Set(selectedChannels);
                                if (next.has(ch.telegramChannelId)) {
                                  next.delete(ch.telegramChannelId);
                                } else {
                                  next.add(ch.telegramChannelId);
                                }
                                setSelectedChannels(next);
                              }}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">
                                {ch.title}
                              </p>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                                <span>{ch.username ? `@${ch.username}` : "Canal Privado"}</span>
                                <span>•</span>
                                <span className="flex items-center gap-0.5">
                                  <Users className="size-3 inline" />
                                  {ch.memberCount.toLocaleString()} inscritos
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {ch.isLinked && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700">
                                Já vinculado
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                              {ch.visibility === "public" ? "Público" : "Privado"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <DialogFooter className="pt-2 sm:justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMtprotoStep("list");
                      carregarContas();
                    }}
                  >
                    Pular
                  </Button>
                  <Button
                    size="sm"
                    onClick={salvarCanaisSelecionados}
                    disabled={savingChannels || selectedChannels.size === 0}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                  >
                    {savingChannels ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    <span>Vincular ({selectedChannels.size}) Canais</span>
                  </Button>
                </DialogFooter>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
