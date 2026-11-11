import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  HardDrive,
  Cloud,
  Layers,
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  KeyRound,
  ExternalLink,
  Loader2,
  Sparkles,
  Server,
  FolderArchive,
  ArrowRightLeft,
  Save,
} from "lucide-react";
import {
  getStoragePoolSummary,
  listStorageAccounts,
  saveR2StorageAccount,
  saveGoogleDriveAccount,
  updatePoolSettings,
  deleteStorageAccount,
  type StoragePoolSummary,
  type StorageAccountView,
} from "@/lib/storage/storage-admin.functions";

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function StorageVaultsTab() {
  const fetchSummary = useServerFn(getStoragePoolSummary);
  const fetchAccounts = useServerFn(listStorageAccounts);
  const saveR2 = useServerFn(saveR2StorageAccount);
  const saveDrive = useServerFn(saveGoogleDriveAccount);
  const saveSettings = useServerFn(updatePoolSettings);
  const deleteAccount = useServerFn(deleteStorageAccount);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StoragePoolSummary | null>(null);
  const [accounts, setAccounts] = useState<StorageAccountView[]>([]);

  // Estados de formulários
  const [r2DialogOpen, setR2DialogOpen] = useState(false);
  const [driveDialogOpen, setDriveDialogOpen] = useState(false);
  const [savingR2, setSavingR2] = useState(false);
  const [savingDrive, setSavingDrive] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Form R2
  const [r2Form, setR2Form] = useState({
    id: null as string | null,
    label: "",
    accountId: "",
    accessKeyId: "",
    secretAccessKey: "",
    bucketName: "",
    publicDomain: "",
    priority: 1,
    maxCapacityGb: 8,
  });

  // Form Drive
  const [driveForm, setDriveForm] = useState({
    id: null as string | null,
    label: "Bóveda Google Drive (5 TB)",
    credentialsJson: "",
    rootFolderId: "",
    maxCapacityTb: 5,
  });

  // Config do Pool
  const [poolSettingsForm, setPoolSettingsForm] = useState({
    rotationStrategy: "smart_failover" as "smart_failover" | "round_robin" | "least_used",
    hotRetentionDays: 30,
    autoArchiveEnabled: true,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, accRes] = await Promise.all([fetchSummary(), fetchAccounts()]);
      setSummary(sumRes);
      setAccounts(accRes);
      if (sumRes?.settings) {
        setPoolSettingsForm({
          rotationStrategy: sumRes.settings.rotationStrategy,
          hotRetentionDays: sumRes.settings.hotRetentionDays,
          autoArchiveEnabled: sumRes.settings.autoArchiveEnabled,
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar dados de armazenamento");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSaveR2Account = async () => {
    if (!r2Form.label || !r2Form.accountId || !r2Form.accessKeyId || !r2Form.secretAccessKey || !r2Form.bucketName) {
      toast.error("Preencha todos os campos obrigatórios da conta R2");
      return;
    }
    setSavingR2(true);
    try {
      const res = await saveR2({
        data: {
          id: r2Form.id,
          label: r2Form.label,
          accountId: r2Form.accountId,
          accessKeyId: r2Form.accessKeyId,
          secretAccessKey: r2Form.secretAccessKey,
          bucketName: r2Form.bucketName,
          publicDomain: r2Form.publicDomain || null,
          priority: Number(r2Form.priority),
          maxCapacityGb: Number(r2Form.maxCapacityGb),
        },
      });
      toast.success(res.message);
      setR2DialogOpen(false);
      setR2Form({
        id: null,
        label: "",
        accountId: "",
        accessKeyId: "",
        secretAccessKey: "",
        bucketName: "",
        publicDomain: "",
        priority: 1,
        maxCapacityGb: 8,
      });
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar conta Cloudflare R2");
    } finally {
      setSavingR2(false);
    }
  };

  const handleSaveDriveAccount = async () => {
    if (!driveForm.label || !driveForm.credentialsJson) {
      toast.error("Preencha o nome da bóveda e cole o JSON da Service Account");
      return;
    }
    setSavingDrive(true);
    try {
      const res = await saveDrive({
        data: {
          id: driveForm.id,
          label: driveForm.label,
          credentialsJson: driveForm.credentialsJson,
          rootFolderId: driveForm.rootFolderId || null,
          maxCapacityTb: Number(driveForm.maxCapacityTb),
        },
      });
      toast.success(res.message);
      setDriveDialogOpen(false);
      setDriveForm({
        id: null,
        label: "Bóveda Google Drive (5 TB)",
        credentialsJson: "",
        rootFolderId: "",
        maxCapacityTb: 5,
      });
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao conectar Google Drive");
    } finally {
      setSavingDrive(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await saveSettings({
        data: poolSettingsForm,
      });
      toast.success(res.message);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar configurações do pool");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteAccount = async (id: string, label: string) => {
    if (!confirm(`Tem certeza que deseja remover a conta "${label}" do pool?`)) return;
    try {
      const res = await deleteAccount({ data: { id } });
      toast.success(res.message);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao remover conta");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <HardDrive className="size-6 text-primary" />
            Armazenamento Híbrido & Bóvedas Cloud
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Arquitetura Tiered Hot / Cold: Cloudflare R2 para velocidade instantânea e Google Drive (5 TB) para conservação histórica a custo $0.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`size-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar Status
          </Button>
        </div>
      </div>

      {/* Grid de Resumo Executivo (Hot Tier vs Cold Tier) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Card Hot Tier: Cloudflare R2 */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <Cloud className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold">Pool Quente: Cloudflare R2</CardTitle>
                  <CardDescription className="text-xs">Para posts ativos e chats recentes (&lt; 30 dias)</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                ⚡ Velocidade CDN ($0 Egress)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Uso Atual do Pool:</span>
              <span className="font-semibold">
                {formatBytes(summary?.hotPool.totalUsageBytes || 0)} / {formatBytes(summary?.hotPool.totalCapacityBytes || 10737418240)}
              </span>
            </div>
            <Progress value={summary?.hotPool.usagePercent || 0} className="h-2" />
            <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Contas no Pool</p>
                <p className="text-base font-bold text-foreground mt-0.5">{summary?.hotPool.activeAccounts || 1}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Estratégia</p>
                <p className="text-xs font-semibold text-primary mt-1 capitalize">
                  {summary?.settings.rotationStrategy.replace("_", " ") || "Smart Failover"}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Capacidade Livre</p>
                <p className="text-base font-bold text-emerald-600 mt-0.5">
                  {formatBytes(Math.max(0, (summary?.hotPool.totalCapacityBytes || 0) - (summary?.hotPool.totalUsageBytes || 0)))}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => {
                setR2Form({
                  id: null,
                  label: `R2 Cluster #${(accounts.filter((a) => a.provider === "cloudflare_r2").length || 1) + 1}`,
                  accountId: "",
                  accessKeyId: "",
                  secretAccessKey: "",
                  bucketName: "",
                  publicDomain: "",
                  priority: accounts.length + 1,
                  maxCapacityGb: 8,
                });
                setR2DialogOpen(true);
              }}
            >
              <Plus className="size-4 mr-1.5" /> Adicionar Mais Uma Conta R2 ao Pool
            </Button>
          </CardContent>
        </Card>

        {/* Card Cold Tier: Google Drive 5 TB */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                  <Database className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold">Bóveda Fria: Google Drive</CardTitle>
                  <CardDescription className="text-xs">Armazenamento permanente e master (5 TB)</CardDescription>
                </div>
              </div>
              {summary?.coldVault.connected ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">
                  <CheckCircle2 className="size-3 mr-1" /> Conectado (5 TB)
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                  Pronto para Conectar
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Ocupação da Bóveda:</span>
              <span className="font-semibold">
                {formatBytes(summary?.coldVault.totalUsageBytes || 0)} / {formatBytes(summary?.coldVault.totalCapacityBytes || 5497558138880)}
              </span>
            </div>
            <Progress value={Math.max(1, summary?.coldVault.usagePercent || 0)} className="h-2 bg-muted [&>div]:bg-blue-600" />
            <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Estrutura</p>
                <p className="text-[11px] font-semibold text-foreground mt-1 truncate" title="Empresa / Clientes">
                  Empresa ➔ Clientes
                </p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Arquivos Resguardados</p>
                <p className="text-base font-bold text-foreground mt-0.5">{summary?.coldVault.filesCount || 0}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40">
                <p className="text-muted-foreground">Espaço Livre</p>
                <p className="text-base font-bold text-blue-600 mt-0.5">
                  {formatBytes(Math.max(0, (summary?.coldVault.totalCapacityBytes || 5497558138880) - (summary?.coldVault.totalUsageBytes || 0)))}
                </p>
              </div>
            </div>
            <Button
              variant={summary?.coldVault.connected ? "outline" : "default"}
              size="sm"
              className="w-full mt-2"
              onClick={() => setDriveDialogOpen(true)}
            >
              {summary?.coldVault.connected ? (
                <>
                  <ShieldCheck className="size-4 mr-1.5 text-emerald-500" /> Gerenciar Conexão Google Drive
                </>
              ) : (
                <>
                  <Plus className="size-4 mr-1.5" /> Conectar Conta Google Drive (5 TB)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Card de Regras do Pool e Automação de Arquivamento */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowRightLeft className="size-4 text-primary" />
            Regras de Rotação do Pool & Arquivamento Automático
          </CardTitle>
          <CardDescription className="text-xs">
            Configure como as contas Cloudflare R2 rotacionam e quando os arquivos migram para o Google Drive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Estratégia de Rotação R2</Label>
              <Select
                value={poolSettingsForm.rotationStrategy}
                onValueChange={(val: any) => setPoolSettingsForm((prev) => ({ ...prev, rotationStrategy: val }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smart_failover">Cascata Inteligente (Até 8 GB / Conta)</SelectItem>
                  <SelectItem value="round_robin">Balanceamento Circular (1 a 1)</SelectItem>
                  <SelectItem value="least_used">Menor Uso Primeiro (Mais espaço livre)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {poolSettingsForm.rotationStrategy === "smart_failover" &&
                  "Usa a conta prioritária até atingir o limite seguro de 8 GB e transborda para a seguinte automaticamente."}
                {poolSettingsForm.rotationStrategy === "round_robin" &&
                  "Distribui os novos uploads de maneira uniforme entre todas as contas ativas do pool."}
                {poolSettingsForm.rotationStrategy === "least_used" &&
                  "Envia cada novo arquivo para a conta que tiver menor volume de dados gravados."}
              </p>
            </div>

            <div>
              <Label className="text-xs">Janela de Retenção no Nível Quente</Label>
              <Select
                value={String(poolSettingsForm.hotRetentionDays)}
                onValueChange={(val) => setPoolSettingsForm((prev) => ({ ...prev, hotRetentionDays: Number(val) }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 Dias (Liberação Rápida de R2)</SelectItem>
                  <SelectItem value="30">30 Dias (Padrão Recomendado)</SelectItem>
                  <SelectItem value="60">60 Dias (Conservador)</SelectItem>
                  <SelectItem value="90">90 Dias (Trimestral)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Arquivos e fotos mais velhos que esse período são movidos automaticamente para o Google Drive e deletados do R2.
              </p>
            </div>

            <div className="flex flex-col justify-between p-3 rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Arquivamento Automático</Label>
                  <p className="text-[11px] text-muted-foreground">Execução periódica de transferência</p>
                </div>
                <Switch
                  checked={poolSettingsForm.autoArchiveEnabled}
                  onCheckedChange={(checked) => setPoolSettingsForm((prev) => ({ ...prev, autoArchiveEnabled: checked }))}
                />
              </div>
              <Button size="sm" onClick={handleSaveSettings} disabled={savingSettings} className="mt-3 w-full">
                {savingSettings ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Save className="size-4 mr-1.5" />}
                Salvar Regras
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Contas Cloudflare R2 Conectadas */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                Contas do Pool Cloudflare R2 ({accounts.filter((a) => a.provider === "cloudflare_r2").length})
              </CardTitle>
              <CardDescription className="text-xs">
                Contas ativas que absorvem subidas de alta resolução e tráfego instantâneo.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setR2Form({
                  id: null,
                  label: `R2 Cluster #${(accounts.filter((a) => a.provider === "cloudflare_r2").length || 1) + 1}`,
                  accountId: "",
                  accessKeyId: "",
                  secretAccessKey: "",
                  bucketName: "",
                  publicDomain: "",
                  priority: accounts.length + 1,
                  maxCapacityGb: 8,
                });
                setR2DialogOpen(true);
              }}
            >
              <Plus className="size-3.5 mr-1" /> Nova Conta R2
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {accounts
              .filter((a) => a.provider === "cloudflare_r2")
              .map((acc, idx) => {
                const percent = acc.max_capacity_bytes > 0 ? Math.round((acc.current_usage_bytes / acc.max_capacity_bytes) * 100) : 0;
                const isSystem = acc.is_system_fallback;
                return (
                  <div
                    key={acc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/10 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground">{acc.label}</span>
                        {isSystem && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            Primária do Sistema
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={
                            acc.status === "full"
                              ? "bg-destructive/10 text-destructive text-[10px]"
                              : acc.status === "warning"
                              ? "bg-amber-500/10 text-amber-600 text-[10px]"
                              : "bg-emerald-500/10 text-emerald-600 text-[10px]"
                          }
                        >
                          {acc.status === "full" ? "Cheia" : acc.status === "warning" ? "Aviso (>80%)" : "Ativa & Saudável"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Prioridade #{acc.priority}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Bucket: <strong className="text-foreground">{acc.bucket_name || "capiversa-media"}</strong></span>
                        {acc.public_domain && (
                          <span className="truncate max-w-[200px]">CDN: {acc.public_domain}</span>
                        )}
                        <span>Arquivos: <strong>{acc.file_count}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right w-36">
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(acc.current_usage_bytes)} / {formatBytes(acc.max_capacity_bytes)} ({percent}%)
                        </div>
                        <Progress
                          value={percent}
                          className={`h-1.5 mt-1 ${percent > 85 ? "[&>div]:bg-destructive" : percent > 65 ? "[&>div]:bg-amber-500" : ""}`}
                        />
                      </div>

                      {!isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteAccount(acc.id, acc.label)}
                          title="Remover conta do pool"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Modal / Dialog: Adicionar Nova Conta Cloudflare R2 */}
      <Dialog open={r2DialogOpen} onOpenChange={setR2DialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="size-5 text-primary" />
              Adicionar Conta Cloudflare R2 ao Pool
            </DialogTitle>
            <DialogDescription className="text-xs">
              Conecte uma nova conta R2 (compatível S3). O sistema testará a conectividade automaticamente antes de ativar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label className="text-xs">Identificador / Rótulo</Label>
              <Input
                placeholder="Ex: R2 Produção Secundária"
                value={r2Form.label}
                onChange={(e) => setR2Form({ ...r2Form, label: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Cloudflare Account ID</Label>
                <Input
                  placeholder="3bc2408cba1..."
                  value={r2Form.accountId}
                  onChange={(e) => setR2Form({ ...r2Form, accountId: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Nome do Bucket</Label>
                <Input
                  placeholder="meu-bucket-r2"
                  value={r2Form.bucketName}
                  onChange={(e) => setR2Form({ ...r2Form, bucketName: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">R2 Access Key ID</Label>
              <Input
                placeholder="a0048ab1cf70..."
                value={r2Form.accessKeyId}
                onChange={(e) => setR2Form({ ...r2Form, accessKeyId: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs">R2 Secret Access Key</Label>
              <Input
                type="password"
                placeholder="328e9326f2e6..."
                value={r2Form.secretAccessKey}
                onChange={(e) => setR2Form({ ...r2Form, secretAccessKey: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Limite Seguro (GB)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={r2Form.maxCapacityGb}
                  onChange={(e) => setR2Form({ ...r2Form, maxCapacityGb: Number(e.target.value) })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Padrão: 8 GB (dentro do free tier)</p>
              </div>
              <div>
                <Label className="text-xs">Prioridade no Pool</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={r2Form.priority}
                  onChange={(e) => setR2Form({ ...r2Form, priority: Number(e.target.value) })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">1 = Mais prioritária</p>
              </div>
            </div>

            <div>
              <Label className="text-xs">Domínio Público Personalizado / CDN (Opcional)</Label>
              <Input
                placeholder="https://pub-xxx.r2.dev ou https://cdn.minhaempresa.com"
                value={r2Form.publicDomain}
                onChange={(e) => setR2Form({ ...r2Form, publicDomain: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setR2DialogOpen(false)} disabled={savingR2}>
              Cancelar
            </Button>
            <Button onClick={handleSaveR2Account} disabled={savingR2}>
              {savingR2 ? (
                <>
                  <Loader2 className="size-4 mr-1.5 animate-spin" /> Testando & Salvando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 mr-1.5" /> Testar & Adicionar ao Pool
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal / Dialog: Conectar Google Drive (5 TB) */}
      <Dialog open={driveDialogOpen} onOpenChange={setDriveDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="size-5 text-blue-500" />
              Conectar Bóveda Google Drive (5 TB)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Permite o arquivamento automático organizado por <strong>Empresa ➔ Clientes ➔ [Telefone - Nome]</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label className="text-xs">Rótulo da Bóveda</Label>
              <Input
                value={driveForm.label}
                onChange={(e) => setDriveForm({ ...driveForm, label: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs">JSON da Service Account (Google Cloud Console)</Label>
              <textarea
                className="w-full h-32 px-3 py-2 text-xs font-mono rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
                value={driveForm.credentialsJson}
                onChange={(e) => setDriveForm({ ...driveForm, credentialsJson: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Gere uma chave JSON em <em>Google Cloud Console ➔ IAM & Admin ➔ Service Accounts</em> com a Google Drive API ativada.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">ID da Pasta Raiz no Drive (Opcional)</Label>
                <Input
                  placeholder="Ex: 1A2b3C4d5E6f..."
                  value={driveForm.rootFolderId}
                  onChange={(e) => setDriveForm({ ...driveForm, rootFolderId: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Pegue da URL da pasta no seu Drive</p>
              </div>
              <div>
                <Label className="text-xs">Capacidade Total da Conta (TB)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={driveForm.maxCapacityTb}
                  onChange={(e) => setDriveForm({ ...driveForm, maxCapacityTb: Number(e.target.value) })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Padrão: 5 TB</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDriveDialogOpen(false)} disabled={savingDrive}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDriveAccount} disabled={savingDrive} className="bg-blue-600 hover:bg-blue-700 text-white">
              {savingDrive ? (
                <>
                  <Loader2 className="size-4 mr-1.5 animate-spin" /> Conectando Bóveda...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 mr-1.5" /> Salvar & Conectar Bóveda
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
