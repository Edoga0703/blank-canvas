import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getMetaCapiConfigFn,
  saveMetaCapiConfigFn,
  testMetaCapiConnectionFn,
  listMetaCapiLogsFn,
} from "@/lib/meta-capi.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Send, ShieldCheck, RefreshCw } from "lucide-react";

export function MetaCapiCard() {
  const getConfig = useServerFn(getMetaCapiConfigFn);
  const saveConfig = useServerFn(saveMetaCapiConfigFn);
  const testConnection = useServerFn(testMetaCapiConnectionFn);
  const listLogs = useServerFn(listMetaCapiLogsFn);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [config, setConfig] = useState({
    ativo: false,
    modo_conexao: "hibrido",
    dataset_id: "",
    access_token: "",
    waba_id: "",
    test_event_code: "",
    moeda_padrao: "BRL",
    enviar_somente_com_clique: false,
    has_access_token: false,
    access_token_masked: "",
  });

  async function loadData() {
    setLoading(true);
    try {
      const [cfg, logList] = await Promise.all([
        getConfig(),
        listLogs().catch(() => []),
      ]);
      if (cfg) {
        setConfig({
          ativo: !!cfg.ativo,
          modo_conexao: cfg.modo_conexao || "hibrido",
          dataset_id: cfg.dataset_id || "",
          access_token: "",
          waba_id: cfg.waba_id || "",
          test_event_code: cfg.test_event_code || "",
          moeda_padrao: cfg.currency || (cfg as any).moeda_padrao || "BRL",
          enviar_somente_com_clique: !!cfg.enviar_somente_com_clique,
          has_access_token: Boolean((cfg as any).has_access_token),
          access_token_masked: (cfg as any).access_token_masked || "",
        });
      }
      setLogs(logList || []);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar configurações da Meta.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveConfig({ data: { ...config, currency: config.moeda_padrao } as any });
      if (saved) {
        setConfig((prev) => ({
          ...prev,
          access_token: "",
          has_access_token: Boolean((saved as any).has_access_token),
          access_token_masked: (saved as any).access_token_masked || "",
        }));
      }
      toast.success("Configurações do Meta CAPI salvas com sucesso!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar configuração.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if ((!config.access_token.trim() && !config.has_access_token) || (!config.dataset_id && !config.waba_id)) {
      toast.error("Preencha o Access Token e o Pixel/Dataset ID (ou WABA ID) antes de testar.");
      return;
    }
    setTesting(true);
    try {
      const res = await testConnection({
        data: {
          testEventCode: config.test_event_code,
          accessToken: config.access_token,
          datasetId: config.dataset_id,
          wabaId: config.waba_id,
          modoConexao: config.modo_conexao as any,
          currency: config.moeda_padrao,
        },
      });
      toast.success(`Evento de teste recebido pela Meta! Trace ID: ${res.fbtraceId || "OK"}`);
      const refreshedLogs = await listLogs().catch(() => []);
      setLogs(refreshedLogs);
    } catch (e: any) {
      toast.error(e?.message || "Falha no envio do teste para a Meta.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-8 text-center border-border">
        <Loader2 className="size-6 animate-spin mx-auto text-primary mb-2" />
        <p className="text-xs text-muted-foreground">Carregando integração Meta CAPI...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="size-2 rounded-full bg-blue-600 animate-pulse" />
                Meta Conversions API (CAPI) & Pixel
              </CardTitle>
              <CardDescription className="text-xs">
                Otimize seus anúncios do Meta Ads enviando eventos de conversão (Leads, Qualificados, Vendas) via servidor com rastreamento avançado de WhatsApp e Web.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Integração Ativa</span>
              <Switch
                checked={config.ativo}
                onCheckedChange={(val) => setConfig((prev) => ({ ...prev, ativo: val }))}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                ID do Conjunto de Dados / Pixel (Dataset ID) <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Ex: 123456789012345"
                value={config.dataset_id}
                onChange={(e) => setConfig((prev) => ({ ...prev, dataset_id: e.target.value.trim() }))}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Encontre em Meta Events Manager → Seu Conjunto de Dados → Configurações.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Modo de Transmissão CAPI
              </Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                value={config.modo_conexao}
                onChange={(e) => setConfig((prev) => ({ ...prev, modo_conexao: e.target.value }))}
              >
                <option value="hibrido">Híbrido Inteligente (Recomendado: WABA Official + Pixel Web)</option>
                <option value="waba_official">WhatsApp Business Messaging (Apenas D-API Official / WABA)</option>
                <option value="pixel_tradicional">Pixel / Conversões Tradicionais (Website & Hash SHA-256)</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                O modo inteligente escolhe a melhor rota de atribuição para cada lead.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">
                Token de Acesso do Sistema da Meta (Access Token) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="password"
                placeholder={
                  config.access_token_masked
                    ? `Token salvo (${config.access_token_masked}) — digite apenas para substituir`
                    : "EAAB..."
                }
                value={config.access_token}
                onChange={(e) => setConfig((prev) => ({ ...prev, access_token: e.target.value.trim() }))}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Gere um token permanente em Meta Events Manager (Configurações → Conversions API → Gerar token de acesso) ou crie um usuário do sistema no Gerenciador de Negócios.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                WABA ID (Opcional - WhatsApp Business Account)
              </Label>
              <Input
                placeholder="Ex: 109876543210987"
                value={config.waba_id}
                onChange={(e) => setConfig((prev) => ({ ...prev, waba_id: e.target.value.trim() }))}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Necessário caso utilize a API Oficial de Cloud do WhatsApp para envio Business Messaging.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Código de Evento de Teste (Test Event Code)
              </Label>
              <Input
                placeholder="Ex: TEST12345 (deixe vazio em produção)"
                value={config.test_event_code}
                onChange={(e) => setConfig((prev) => ({ ...prev, test_event_code: e.target.value.trim() }))}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Pegue na aba "Testar Eventos" do Meta Events Manager para inspecionar em tempo real.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Moeda Padrão de Vendas</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                value={config.moeda_padrao}
                onChange={(e) => setConfig((prev) => ({ ...prev, moeda_padrao: e.target.value }))}
              >
                <option value="BRL">BRL (R$ - Real Brasileiro)</option>
                <option value="USD">USD ($ - Dólar Americano)</option>
                <option value="EUR">EUR (€ - Euro)</option>
                <option value="COP">COP ($ - Peso Colombiano)</option>
                <option value="MXN">MXN ($ - Peso Mexicano)</option>
              </select>
            </div>

            <div className="space-y-1.5 flex flex-col justify-center">
              <div className="flex items-center justify-between rounded-md border border-border p-2.5 bg-muted/20">
                <div className="space-y-0.5 pr-2">
                  <Label className="text-xs font-medium">Apenas Leads com Clique (CTWA/UTM)</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Se ativado, não envia conversões de leads orgânicos manuais para evitar ruído.
                  </p>
                </div>
                <Switch
                  checked={config.enviar_somente_com_clique}
                  onCheckedChange={(val) => setConfig((prev) => ({ ...prev, enviar_somente_com_clique: val }))}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 text-xs text-muted-foreground flex gap-3">
            <ShieldCheck className="size-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <strong className="text-foreground">Privacidade e Proteção de Dados (LGPD / GDPR):</strong>
              <p>
                Todos os dados de contato (telefone, e-mail, nome, estado brasileiro derivado do DDD) são convertidos em hash SHA-256 irreversível no servidor antes do envio à Meta. O token nunca é exposto ao navegador do visitante.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testing || !config.access_token}
                className="gap-1.5 text-xs"
              >
                {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Disparar Evento de Teste
              </Button>
              <a
                href="https://adsmanager.facebook.com/events_manager2"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-primary hover:underline flex items-center gap-1 ml-2"
              >
                Abrir Meta Events Manager <ExternalLink className="size-3" />
              </a>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 text-xs"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Salvar Configurações CAPI
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico Recente de Disparos */}
      <Card className="border-border">
        <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs font-semibold">Registro Recente de Disparos CAPI</CardTitle>
            <CardDescription className="text-[11px]">Últimos eventos enviados aos servidores da Meta</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const res = await listLogs().catch(() => []);
              setLogs(res);
              toast.success("Logs atualizados");
            }}
            className="h-7 px-2 text-xs gap-1"
          >
            <RefreshCw className="size-3" /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhum evento registrado ainda. Mova um lead para uma etapa com conversão Meta ou clique em "Disparar Evento de Teste".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground text-[11px] text-left">
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Evento</th>
                    <th className="py-2 px-3">Origem</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Trace ID / Erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        <span className="text-[10px] block opacity-70">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-semibold text-foreground">
                        {log.event_name}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {log.action_source === "business_messaging" ? "WhatsApp (WABA)" : "Website / Pixel"}
                      </td>
                      <td className="py-2 px-3">
                        {log.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-medium">
                            <CheckCircle2 className="size-2.5" /> Enviado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 text-[10px] font-medium">
                            <AlertCircle className="size-2.5" /> Falha
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground max-w-[200px] truncate" title={log.fbtrace_id || log.error_message || ""}>
                        {log.fbtrace_id || log.error_message || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
