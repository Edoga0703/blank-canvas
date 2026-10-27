import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Save, CreditCard, Sparkles, AlertTriangle, Download, Shield, Wallet, Lock, User, Palette, Users, Clock, Star, ChevronDown, Search, MapPin, KeyRound, Upload, Webhook, Lightbulb, Send, Link2, ImageIcon, X, Tag, Building2, FileText, ListOrdered, Infinity } from "lucide-react";
import { submitFeedback } from "@/lib/admin-broadcast.functions";
import { brand } from "@/config/brand";
import { trialDaysLeft } from "@/lib/tenant";
import { HorariosTab } from "@/components/config/horarios-tab";
import { TagsTab } from "@/components/config/tags-tab";
import { CsatRespostasTab } from "@/components/config/csat-respostas-tab";
import { DepartamentosTab } from "@/components/config/departamentos-tab";

import { DistribuicaoTab } from "@/components/config/distribuicao-tab";



import { AvatarUploadDialog } from "@/components/config/avatar-upload-dialog";
import { CompanyLogoDialog } from "@/components/config/company-logo-dialog";

import { IntegracoesTab } from "@/components/config/integracoes-tab";
import { MetaCapiCard } from "@/components/config/meta-capi-card";
import { FormulariosTab } from "@/components/config/formularios-tab";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/lib/i18n/context";
import { Globe } from "lucide-react";
import { MeuPlanoPanel } from "@/components/billing/meu-plano-panel";
import { cancelMySubscription, reactivateMySubscription } from "@/lib/subscription.functions";
import { listMyInvoices, getReceiptData, type InvoiceRow } from "@/lib/invoices.functions";
import { getChargeReceipt } from "@/lib/billing-checkout.functions";
import { resetCompanyData } from "@/lib/company-reset.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/configuracoes")({
  head: () => ({ meta: [{ title: `${brand.name} — Configurações` }] }),
  component: ConfigPage,
});


function formatCpfCnpj(value: string): string {
  const d = (value || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}




function ConfigPage() {
  const ctx = Route.useRouteContext();
  const { language, setLanguage, t } = useLanguage();
  const [selectedIdioma, setSelectedIdioma] = useState<string>(language);
  useEffect(() => { setSelectedIdioma(language); }, [language]);
  const companyId = ctx.company?.id;
  const userId = ctx.user.id;
  const company = ctx.company;

  const [empresa, setEmpresa] = useState({
    nome: "",
    telefone: "",
    tipo_pessoa: "pj" as "pf" | "pj",
    cnpj_cpf: "",
    razao_social: "",
    nome_fantasia: "",
    email_corporativo: "",
    site: "",
    segmento: "",
    porte: "",
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
  });
  const [identidade, setIdentidade] = useState({ primary_color: "#0B22FE", logo_url: "" });
  const [perfil, setPerfil] = useState({ nome: "", email: ctx.user.email ?? "", avatar_url: "", assinatura_ativa: true, csat_auto_finalizar: true });
  const [senha, setSenha] = useState({ nova: "", confirma: "" });
  const [savingE, setSavingE] = useState(false);
  const [savingI, setSavingI] = useState(false);
  const [savingP, setSavingP] = useState(false);
  const [savingS, setSavingS] = useState(false);
  const [sub, setSub] = useState<any>(null);

  useEffect(() => {
    if (ctx.company) {
      const c: any = ctx.company;
      setEmpresa({
        nome: c.nome ?? "",
        telefone: c.telefone ?? "",
        tipo_pessoa: ((c.tipo_pessoa ?? "pj") as string).toLowerCase() as "pf" | "pj",
        cnpj_cpf: c.cnpj_cpf ?? "",
        // Fallback: se ainda não há razão social, mostra o nome fantasia
        // (que é o preenchido no onboarding) ou o nome da empresa.
        razao_social: c.razao_social ?? c.nome_fantasia ?? c.nome ?? "",
        nome_fantasia: c.nome_fantasia ?? "",
        email_corporativo: c.email_corporativo ?? "",
        site: c.site ?? "",
        segmento: c.segmento ?? "",
        porte: c.porte ?? "",
        cep: c.cep ?? "",
        rua: c.rua ?? "",
        numero: c.numero ?? "",
        complemento: c.complemento ?? "",
        bairro: c.bairro ?? "",
        cidade: c.cidade ?? "",
        estado: c.estado ?? "",
      });
      setIdentidade({ primary_color: c.primary_color, logo_url: c.logo_url ?? "" });
    }
    void (async () => {
      const { data } = await supabase.from("profiles").select("nome, avatar_url, assinatura_ativa, csat_auto_finalizar").eq("user_id", userId).maybeSingle();
      if (data) setPerfil((p) => ({
        ...p,
        nome: data.nome ?? "",
        avatar_url: (data as any).avatar_url ?? "",
        assinatura_ativa: (data as any).assinatura_ativa !== false,
        csat_auto_finalizar: (data as any).csat_auto_finalizar !== false,
      }));
    })();
    if (companyId) {
      void (async () => {
        const { data } = await supabase
          .from("subscription")
          .select("*, plan:plan(id,slug,nome,descricao,preco_cents,moeda,intervalo,trial_days,limite_mensagens,limite_instancias,limite_usuarios,creditos_mensais,creditos_trial,features)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setSub(data);
      })();
    }
  }, [companyId, userId]);

  async function saveEmpresa() {
    if (!companyId) return;
    setSavingE(true);
    const displayName = empresa.razao_social || empresa.nome_fantasia || empresa.nome || "";
    const payload: any = {
      nome: displayName || null,
      telefone: empresa.telefone || null,
      tipo_pessoa: (empresa.cnpj_cpf || "").replace(/\D/g, "").length === 11 ? "PF" : "PJ",
      cnpj_cpf: empresa.cnpj_cpf || null,
      razao_social: empresa.razao_social || null,
      nome_fantasia: empresa.nome_fantasia || null,
      email_corporativo: empresa.email_corporativo || null,
      site: empresa.site || null,
      segmento: empresa.segmento || null,
      porte: empresa.porte || null,
      cep: empresa.cep || null,
      rua: empresa.rua || null,
      numero: empresa.numero || null,
      complemento: empresa.complemento || null,
      bairro: empresa.bairro || null,
      cidade: empresa.cidade || null,
      estado: empresa.estado || null,
    };
    const { error } = await supabase.from("company").update(payload).eq("id", companyId);
    setSavingE(false);
    if (error) return toast.error(error.message);
    setEmpresa((p) => ({ ...p, nome: displayName }));
    window.dispatchEvent(new CustomEvent("company:updated", { detail: { nome: displayName } }));
    toast.success("Empresa atualizada");
  }

  async function saveIdentidade() {
    if (!companyId) return;
    setSavingI(true);
    const { error } = await supabase.from("company").update({
      primary_color: identidade.primary_color, logo_url: identidade.logo_url || null,
    }).eq("id", companyId);
    setSavingI(false);
    if (error) return toast.error(error.message);
    window.dispatchEvent(new CustomEvent("company:updated", { detail: { logo_url: identidade.logo_url || "" } }));
    toast.success("Identidade atualizada");
  }

  async function savePerfil() {
    setSavingP(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        user_id: userId,
        email: ctx.user.email ?? null,
        nome: perfil.nome || null,
        avatar_url: perfil.avatar_url || null,
        assinatura_ativa: perfil.assinatura_ativa,
        csat_auto_finalizar: perfil.csat_auto_finalizar,
      } as any, { onConflict: "user_id" });
      if (error) throw error;

      if (selectedIdioma) {
        await setLanguage(selectedIdioma as any);
        if (companyId) {
          await supabase.from("agent_config").update({ idioma: selectedIdioma } as any).eq("company_id", companyId);
        }
      }

      window.dispatchEvent(new CustomEvent("profile:updated", { detail: { nome: perfil.nome || "", avatar_url: perfil.avatar_url || "" } }));
      toast.success(selectedIdioma === "es" ? "Perfil e idioma guardados correctamente" : selectedIdioma === "en" ? "Profile and language saved successfully" : "Perfil e idioma atualizados com sucesso");
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload();
      }, 600);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar perfil");
    } finally {
      setSavingP(false);
    }
  }

  async function saveSenha() {
    if (senha.nova.length < 8) return toast.error("Mínimo 8 caracteres");
    if (senha.nova !== senha.confirma) return toast.error("Senhas não conferem");
    setSavingS(true);
    const { error } = await supabase.auth.updateUser({ password: senha.nova });
    setSavingS(false);
    if (error) return toast.error(error.message);
    setSenha({ nova: "", confirma: "" });
    toast.success("Senha alterada");
  }

  const resetData = useServerFn(resetCompanyData);
  const [reseting, setReseting] = useState(false);

  const handleResetData = async () => {
    if (!companyId) return;
    setReseting(true);
    try {
      await resetData({ data: { companyId } });
      toast.success("Todos os dados da empresa foram removidos com sucesso.");
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message || "Erro ao resetar dados.");
    } finally {
      setReseting(false);
    }
  };

  async function buscarCep() {
    const cep = (empresa.cep || "").replace(/\D/g, "");
    if (cep.length !== 8) return toast.error("CEP inválido");
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) return toast.error("CEP não encontrado");
      setEmpresa((p) => ({
        ...p,
        rua: d.logradouro || p.rua,
        bairro: d.bairro || p.bairro,
        cidade: d.localidade || p.cidade,
        estado: d.uf || p.estado,
      }));
      toast.success("Endereço preenchido");
    } catch {
      toast.error("Falha ao buscar CEP");
    }
  }

  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  async function buscarCnpj() {
    const cnpj = (empresa.cnpj_cpf || "").replace(/\D/g, "");
    if (cnpj.length !== 14) return toast.error("CNPJ inválido");
    setBuscandoCnpj(true);
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!r.ok) throw new Error("CNPJ não encontrado");
      const d = await r.json();
      setEmpresa((p) => ({
        ...p,
        razao_social: d.razao_social || p.razao_social,
        nome_fantasia: d.nome_fantasia || p.nome_fantasia,
        nome: p.nome || d.nome_fantasia || d.razao_social || "",
        email_corporativo: d.email || p.email_corporativo,
        telefone: d.ddd_telefone_1 || p.telefone,
        cep: d.cep || p.cep,
        rua: d.logradouro || p.rua,
        numero: d.numero || p.numero,
        complemento: d.complemento || p.complemento,
        bairro: d.bairro || p.bairro,
        cidade: d.municipio || p.cidade,
        estado: d.uf || p.estado,
      }));
      toast.success("Dados do CNPJ preenchidos");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao buscar CNPJ");
    } finally {
      setBuscandoCnpj(false);
    }
  }

  const [enderecoOpen, setEnderecoOpen] = useState(true);

  const isAtendente = ctx.membership?.role === "atendente";
  const formulariosOn = useFeatureEnabled("feature.formularios", { isSuperAdmin: (ctx as any)?.isSuperAdmin });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">{t("config.title", undefined, "Configurações")} <HelpTip text={t("config.helptip", undefined, "Perfil, empresa, identidade, templates, horários, satisfação, segurança, integrações e plano.")} /></h1>
        <p className="text-xs sm:text-sm text-muted-foreground">{t("config.subtitle", undefined, "Gerencie sua conta, sua empresa e o funcionamento do sistema.")}</p>
      </div>
      <Tabs defaultValue="perfil">
        <TabsList className="flex h-auto gap-1 bg-transparent p-0 border-b border-border rounded-none w-full justify-start overflow-x-auto no-scrollbar flex-nowrap md:flex-wrap">
          <StyledTab value="perfil" icon={<User className="size-4" />}>{t("config.profile_tab", undefined, "Perfil")}</StyledTab>
          
          {!isAtendente && <StyledTab value="tags" icon={<Tag className="size-4" />}>{t("config.tags_tab", undefined, "Tags")}</StyledTab>}
           
          {!isAtendente && <StyledTab value="departamentos" icon={<Building2 className="size-4" />}>{t("config.departments_tab", undefined, "Departamentos")}</StyledTab>}
          {!isAtendente && <StyledTab value="horarios" icon={<Clock className="size-4" />}>{t("config.schedules_tab", undefined, "Horários")}</StyledTab>}
          <StyledTab value="csat" icon={<Star className="size-4" />}>{t("config.satisfaction_tab", undefined, "Satisfação")}</StyledTab>
          <StyledTab value="sugestoes" icon={<Lightbulb className="size-4" />}>{t("config.suggestions_tab", undefined, "Sugestões")}</StyledTab>
          {!isAtendente && <StyledTab value="integracoes" icon={<Webhook className="size-4" />}>{t("config.integrations_tab", undefined, "Integrações")}</StyledTab>}
          {!isAtendente && <StyledTab value="meta" icon={<Activity className="size-4 text-blue-500" />}>{t("config.meta_tab", undefined, "Meta Ads & Pixel")}</StyledTab>}
          {!isAtendente && formulariosOn && <StyledTab value="formularios" icon={<FileText className="size-4" />}>{t("config.forms_tab", undefined, "Formulários")}</StyledTab>}
          
          {!isAtendente && <StyledTab value="plano" icon={<CreditCard className="size-4" />}>{t("config.plan_tab", undefined, "Plano")}</StyledTab>}

        </TabsList>


        <TabsContent value="perfil" className="mt-4 sm:mt-5">
          <div className={`grid ${isAtendente ? "" : "xl:grid-cols-2"} gap-4 sm:gap-6`}>
            {/* Coluna esquerda — Dados pessoais */}
            <div className="space-y-4">
              <Card className="p-4 sm:p-5 space-y-4">

                <h3 className="font-semibold">{t("config.my_profile", undefined, "Meu Perfil")}</h3>
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="size-14 sm:size-16 rounded-full bg-muted grid place-items-center text-muted-foreground overflow-hidden">
                    {perfil.avatar_url ? (
                      <img src={perfil.avatar_url} alt="avatar" className="size-full object-cover" />
                    ) : (
                      <User className="size-7" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Foto de perfil</div>
                    <div className="text-xs text-muted-foreground">PNG ou JPG até 5 MB.</div>
                  </div>
                  <AvatarUploadDialog
                    userId={userId}
                    onUploaded={(url) => setPerfil((p) => ({ ...p, avatar_url: url }))}
                    trigger={
                      <Button variant="outline" size="sm" type="button">
                        <Upload className="size-4 mr-1.5" /> Alterar foto
                      </Button>
                    }
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Nome de exibição</Label>
                    <Input value={perfil.nome} onChange={(e) => setPerfil({ ...perfil, nome: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t("auth.email", undefined, "E-mail")}</Label>
                    <Input value={perfil.email} disabled />
                  </div>
                </div>

                {/* Idioma do Painel / Sistema configurável no Meu Perfil */}
                <div className="space-y-1.5 pt-1">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold">
                    <Globe className="size-3.5 text-primary" />
                    Idioma do Painel / Sistema
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { code: "es", label: "Español", flag: "🇪🇸" },
                      { code: "pt", label: "Português", flag: "🇧🇷" },
                      { code: "en", label: "English", flag: "🇺🇸" },
                    ].map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => { setSelectedIdioma(item.code); void setLanguage(item.code as any); }}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                          selectedIdioma === item.code
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary/20"
                            : "border-border bg-card hover:bg-muted/50 text-foreground"
                        }`}
                      >
                        <span className="text-base leading-none">{item.flag}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Define o idioma do CRM e do assistente IA. Clique em "Salvar Perfil" para aplicar.
                  </p>
                </div>
                {ctx.company?.atendimento_operacional === true && (
                  <label className="flex items-start gap-3 rounded-xl border border-[color:var(--hairline)] p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[color:var(--brand-text)]"
                      checked={perfil.assinatura_ativa}
                      onChange={(e) => setPerfil({ ...perfil, assinatura_ativa: e.target.checked })}
                    />
                    <span className="text-sm">
                      <span className="font-medium">{t("config.sign_messages", undefined, "Assinar minhas mensagens")}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t("config.sign_messages_desc", undefined, "Envia o seu nome antes do texto nas mensagens que você escreve no chat.")}
                      </span>
                    </span>
                  </label>
                )}
                {ctx.company?.atendimento_operacional === true && (
                  <label className="flex items-start gap-3 rounded-xl border border-[color:var(--hairline)] p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[color:var(--brand-text)]"
                      checked={perfil.csat_auto_finalizar}
                      onChange={(e) => setPerfil({ ...perfil, csat_auto_finalizar: e.target.checked })}
                    />
                    <span className="text-sm">
                      <span className="font-medium">Enviar pesquisa ao finalizar</span>
                      <span className="block text-xs text-muted-foreground">Esta preferência vale somente para os seus atendimentos.</span>
                    </span>
                  </label>
                )}
                <div className="flex justify-stretch sm:justify-end">
                  <Button className="w-full sm:w-auto" onClick={savePerfil} disabled={savingP}>
                    {savingP ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />} {selectedIdioma === "es" ? "Guardar Perfil" : selectedIdioma === "en" ? "Save Profile" : "Salvar Perfil"}
                  </Button>
                </div>
              </Card>

              <Card className="p-4 sm:p-5 space-y-4">
                <div>
                  <h3 className="font-semibold flex items-center gap-2"><KeyRound className="size-4" /> {t("config.change_password", undefined, "Alterar Senha")}</h3>
                  <p className="text-xs text-muted-foreground">{t("config.change_password_desc", undefined, "Mínimo 8 caracteres, incluindo letras e números.")}</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>{t("config.new_password", undefined, "Nova senha")}</Label>
                    <Input type="password" value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t("config.confirm_password", undefined, "Confirmar nova senha")}</Label>
                    <Input type="password" value={senha.confirma} onChange={(e) => setSenha({ ...senha, confirma: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-stretch sm:justify-end">
                  <Button className="w-full sm:w-auto" onClick={saveSenha} disabled={savingS || !senha.nova}>
                    {savingS ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />} {t("config.save_password", undefined, "Alterar Senha")}
                  </Button>
                </div>
              </Card>
            </div>

            {/* Coluna direita — Dados da empresa (somente admin) */}
            {!isAtendente && (

            <div className="space-y-4">
              <Card className="p-4 sm:p-5 space-y-4">
                <h3 className="font-semibold">{t("config.company_data", undefined, "Dados da Empresa")}</h3>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="size-14 sm:size-16 rounded-xl bg-muted grid place-items-center text-muted-foreground overflow-hidden border border-border">
                    {identidade.logo_url ? (
                      <img src={identidade.logo_url} alt="logo" className="size-full object-contain" />
                    ) : (
                      <Palette className="size-6" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Logo da empresa</div>
                    <div className="text-xs text-muted-foreground">Aparece na barra lateral. PNG ou JPG até 5 MB.</div>
                  </div>
                  {companyId && (
                    <CompanyLogoDialog
                      userId={userId}
                      companyId={companyId}
                      onUploaded={(url) => setIdentidade((p) => ({ ...p, logo_url: url }))}
                      trigger={
                        <Button variant="outline" size="sm" type="button">
                          <Upload className="size-4 mr-1.5" /> Alterar logo
                        </Button>
                      }
                    />
                  )}
                </div>


                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Nome / Razão Social</Label>
                    <Input value={empresa.razao_social} onChange={(e) => setEmpresa({ ...empresa, razao_social: e.target.value })} />
                  </div>
                  <div>
                    <Label>CNPJ / CPF</Label>
                    <div className="flex gap-1.5">
                      <Input value={empresa.cnpj_cpf} onChange={(e) => setEmpresa({ ...empresa, cnpj_cpf: formatCpfCnpj(e.target.value) })} placeholder="Digite o CNPJ ou CPF" maxLength={18} />
                      <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={buscarCnpj} disabled={buscandoCnpj || (empresa.cnpj_cpf || "").replace(/\D/g, "").length !== 14} title="Buscar dados pelo CNPJ">
                        {buscandoCnpj ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                      </Button>
                    </div>
                    <p className="text-[10.5px] text-muted-foreground mt-1">Ao digitar um CNPJ (14 dígitos) clique na lupa para preencher automaticamente. Para CPF, preencha manualmente.</p>
                  </div>
                  <div>
                    <Label>E-mail Financeiro</Label>
                    <Input type="email" value={empresa.email_corporativo} onChange={(e) => setEmpresa({ ...empresa, email_corporativo: e.target.value })} />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={empresa.telefone} onChange={(e) => setEmpresa({ ...empresa, telefone: e.target.value })} />
                  </div>
                </div>

                <div className="border border-border rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEnderecoOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <MapPin className="size-4" /> Endereço
                      <span className="text-xs text-muted-foreground font-normal">Auto-preenchido via CEP</span>
                    </span>
                    <ChevronDown className={`size-4 transition-transform ${enderecoOpen ? "rotate-180" : ""}`} />
                  </button>
                  {enderecoOpen && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="grid sm:grid-cols-[140px_1fr_100px] gap-3">
                        <div>
                          <Label>CEP</Label>
                          <div className="flex gap-1.5">
                            <Input value={empresa.cep} onChange={(e) => setEmpresa({ ...empresa, cep: e.target.value })} />
                            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={buscarCep}>
                              <Search className="size-4" />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label>Logradouro</Label>
                          <Input value={empresa.rua} onChange={(e) => setEmpresa({ ...empresa, rua: e.target.value })} />
                        </div>
                        <div>
                          <Label>Número</Label>
                          <Input value={empresa.numero} onChange={(e) => setEmpresa({ ...empresa, numero: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <Label>Complemento</Label>
                          <Input value={empresa.complemento} onChange={(e) => setEmpresa({ ...empresa, complemento: e.target.value })} placeholder="Sala, andar..." />
                        </div>
                        <div>
                          <Label>Bairro</Label>
                          <Input value={empresa.bairro} onChange={(e) => setEmpresa({ ...empresa, bairro: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-[1fr_80px] gap-3">
                        <div>
                          <Label>Cidade</Label>
                          <Input value={empresa.cidade} onChange={(e) => setEmpresa({ ...empresa, cidade: e.target.value })} />
                        </div>
                        <div>
                          <Label>UF</Label>
                          <Input maxLength={2} value={empresa.estado} onChange={(e) => setEmpresa({ ...empresa, estado: e.target.value.toUpperCase() })} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-stretch sm:justify-end">
                  <Button className="w-full sm:w-auto" onClick={saveEmpresa} disabled={savingE}>
                    {savingE ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />} Salvar Empresa
                  </Button>
                </div>
              </Card>


              {/* Zona de Perigo - Resetar Dados */}
              <Card className="p-4 sm:p-5 border-destructive/20 bg-destructive/5 space-y-4">
                <div>
                  <h3 className="font-semibold text-destructive flex items-center gap-2">
                    <AlertTriangle className="size-4" /> Zona de Perigo
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Estas ações são irreversíveis. Tenha certeza antes de prosseguir.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-destructive/20 bg-background/50">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Limpar todos os dados</div>
                    <div className="text-xs text-muted-foreground max-w-sm">
                      Remove permanentemente conversas, contatos, campanhas, cards do CRM e configurações de IA. Sua conta e empresa permanecem ativas.
                    </div>
                  </div>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="shrink-0">
                        <AlertTriangle className="size-4 mr-1.5" /> Resetar Sistema
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação excluirá permanentemente todos os seus dados operacionais (mensagens, leads, automações). 
                          Não há como desfazer isso.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleResetData}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {reseting ? <Loader2 className="size-4 animate-spin" /> : "Sim, apagar tudo"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Card>
            </div>

            )}
          </div>

        </TabsContent>


        
        <TabsContent value="tags"><TagsTab /></TabsContent>
        <TabsContent value="departamentos"><DepartamentosTab /></TabsContent>
        <TabsContent value="horarios"><HorariosTab /></TabsContent>
        <TabsContent value="csat">
          <Tabs defaultValue="config" className="space-y-4">
            <TabsList>
              <TabsTrigger value="config">{t("config.title", undefined, "Configuração")}</TabsTrigger>
              <TabsTrigger value="respostas">{t("common.replies", undefined, "Respostas")}</TabsTrigger>
            </TabsList>
            <TabsContent value="config"><CsatConfigCard /></TabsContent>
            <TabsContent value="respostas"><CsatRespostasTab /></TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="sugestoes"><SugestoesCard companyId={companyId} userId={userId} /></TabsContent>
        <TabsContent value="integracoes"><IntegracoesTab /></TabsContent>
        {!isAtendente && <TabsContent value="meta" className="mt-4 sm:mt-5"><MetaCapiCard /></TabsContent>}
        <TabsContent value="formularios"><FormulariosTab /></TabsContent>
        <TabsContent value="distribuicao"><DistribuicaoTab /></TabsContent>
        <TabsContent value="plano"><PlanoCard company={company} sub={sub} /></TabsContent>

      </Tabs>
    </div>
  );
}

function StyledTab({ value, icon, children }: { value: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-lg gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none border-none"
    >
      {icon}
      {children}
    </TabsTrigger>
  );
}



function fmtBRL(cents: number, moeda = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(cents / 100);
}

const UNLIMITED_THRESHOLD = 1_000_000;
export function isUnlimited(n: number | null | undefined) {
  return !n || n <= 0 || n >= UNLIMITED_THRESHOLD;
}

function UsageBar({ used, total, label, loaded = true, tone = "primary" }: { used: number; total: number; label: string; loaded?: boolean; tone?: "primary" | "warn" | "danger" }) {
  const unlimited = isUnlimited(total);
  const pct = unlimited ? 0 : total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const auto = pct >= 100 ? "danger" : pct >= 80 ? "warn" : tone;
  const bar = auto === "danger" ? "bg-red-500" : auto === "warn" ? "bg-amber-500" : "bg-primary";
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-sm min-w-0">
        <span className="text-muted-foreground truncate">{label}</span>
        {loaded ? (
          <span className="font-medium tabular-nums whitespace-nowrap shrink-0">
            {used.toLocaleString("pt-BR")}{unlimited ? " • " : ` / ${total.toLocaleString("pt-BR")}`}
            {unlimited && <Infinity className="inline-block size-3 -mt-0.5" />}
            {unlimited && <span className="ml-1">ilimitado</span>}
          </span>
        ) : (
          <span className="h-4 w-16 rounded bg-muted animate-pulse" />
        )}
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        {loaded && !unlimited && <div className={`h-full ${bar} transition-[width] duration-300`} style={{ width: `${pct}%` }} />}
        {loaded && unlimited && <div className="h-full w-full bg-primary/25" />}
      </div>
    </div>
  );
}

function PlanoCard({ company, sub }: { company: any; sub: any }) {
  const [creditos, setCreditos] = useState<{ saldo: number; resetam_em: string | null }>({ saldo: 0, resetam_em: null });
  const [consumidos, setConsumidos] = useState(0);
  const [usuarios, setUsuarios] = useState(0);
  const [conexoes, setConexoes] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    void (async () => {
      const comp = await supabase
        .from("company")
        .select("creditos_saldo, creditos_resetam_em")
        .eq("id", company.id)
        .maybeSingle();

      // Início do ciclo: 30 dias antes da data de renovação (fallback: início do mês)
      const reset = comp.data?.creditos_resetam_em ? new Date(comp.data.creditos_resetam_em) : null;
      const inicioCiclo = reset
        ? new Date(reset.getTime() - 30 * 24 * 60 * 60 * 1000)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const [led, u, i] = await Promise.all([
        supabase
          .from("credit_ledger")
          .select("delta")
          .eq("company_id", company.id)
          .lt("delta", 0)
          .gte("created_at", inicioCiclo.toISOString())
          .limit(5000),
        supabase.from("company_user").select("user_id", { count: "exact", head: true }).eq("company_id", company.id).eq("ativo", true),
        supabase.from("whatsapp_instances").select("instance_name", { count: "exact", head: true }).eq("company_id", company.id),
      ]);

      setCreditos({ saldo: comp.data?.creditos_saldo ?? 0, resetam_em: comp.data?.creditos_resetam_em ?? null });
      setConsumidos((led.data ?? []).reduce((acc: number, r: any) => acc + Math.abs(Number(r.delta ?? 0)), 0));
      setUsuarios(u.count ?? 0);
      setConexoes(i.count ?? 0);
      setLoaded(true);
    })();
  }, [company?.id]);

  const status = company?.status_cobranca as string | undefined;
  const trialEnd = sub?.trial_ends_at ?? company?.trial_ate ?? null;
  const days = trialEnd ? trialDaysLeft(trialEnd) : 0;
  const isTrial = status === "trial" || sub?.status === "trialing";
  const isActive = status === "ativo" || sub?.status === "active";
  const isExpired = isTrial && days <= 0;

  const plan = sub?.plan;
  const planoCreditos = isTrial
    ? (plan?.creditos_trial ?? 2147483647)
    : (plan?.creditos_mensais ?? plan?.limite_mensagens ?? 2147483647);
  const usados = consumidos;
  // O total considera o saldo real disponível (pode incluir créditos extras comprados)
  const totalCreditos = Math.max(planoCreditos, usados + creditos.saldo);
  const pctIA = totalCreditos > 0 ? (usados / totalCreditos) * 100 : 0;

  const maxUsuarios = plan?.limite_usuarios ?? 2147483647;
  const maxConexoes = plan?.limite_instancias ?? 2147483647;

  const proximaCobranca = sub?.current_period_end || sub?.renova_em || null;
  const resetIA = creditos.resetam_em || proximaCobranca;
  const features: string[] = (Array.isArray(plan?.features) ? plan.features : []).filter(
    (f: string) => typeof f === "string" && f.trim() && !/^(unlimited|ilimitado)$/i.test(f.trim()),
  );

  return (
    <div className="space-y-4">
      <MeuPlanoPanel />

      {(isTrial || (pctIA >= 80 && !isExpired)) && (
      <Card className="p-4 sm:p-5 space-y-4">
        {isTrial && (
          <div className={`rounded-md p-3 text-sm flex items-start gap-2 ${isExpired ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            {isExpired ? <AlertTriangle className="size-4 mt-0.5" /> : <Sparkles className="size-4 mt-0.5" />}
            <div>
              {isExpired
                ? <>Seu período de teste terminou. Cadastre o cartão para continuar usando.</>
                : <>Restam <b>{days} {days === 1 ? "dia" : "dias"}</b> de teste gratuito. Cadastre o cartão antes do fim do prazo.</>}
            </div>
          </div>
        )}

        {pctIA >= 80 && !isExpired && (
          <div className={`rounded-md p-3 text-sm flex items-start gap-2 ${pctIA >= 100 ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            <AlertTriangle className="size-4 mt-0.5" />
            <div>
              {pctIA >= 100
                ? <>Créditos de IA esgotados. A IA foi pausada — o atendimento humano continua normal. Renovam em {resetIA ? new Date(resetIA).toLocaleDateString("pt-BR") : "breve"}.</>
                : <>Você já usou <b>{Math.round(pctIA)}%</b> dos créditos de IA deste ciclo.</>}
            </div>
          </div>
        )}

      </Card>
      )}

      {features.length > 0 && (
        <Card className="p-4 sm:p-5 space-y-2">
          <h3 className="font-semibold flex items-center gap-2"><Star className="size-4" /> Incluído no plano</h3>
          <ul className="text-sm space-y-1.5 sm:columns-2">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 break-inside-avoid">
                <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <InvoicesCard />

      {!isActive && (
        <Button asChild>
          <Link to="/app/checkout" search={{ plano: (plan?.slug ?? "pro") } as any}>
            <CreditCard className="size-4 mr-1.5" /> Cadastrar cartão e ativar
          </Link>
        </Button>
      )}

      {company?.id && (sub?.status === "trialing" || sub?.status === "active") && (
        <div className="pt-1">
          <CancelSubscriptionButton
            companyId={company.id}
            status={sub?.status}
            cancelAtPeriodEnd={!!sub?.cancel_at_period_end}
            periodEnd={sub?.current_period_end ?? null}
            onChanged={() => window.location.reload()}
          />
        </div>
      )}
    </div>
  );
}

function fmtStatus(s: InvoiceRow["status"]): { label: string; cls: string } {
  switch (s) {
    case "pago": return { label: "Pago", cls: "bg-emerald-600 text-white" };
    case "reembolsado": return { label: "Reembolsado", cls: "bg-amber-500 text-white" };
    case "chargeback": return { label: "Chargeback", cls: "bg-red-600 text-white" };
    case "falhou": return { label: "Falhou", cls: "bg-red-500 text-white" };
    case "cancelado": return { label: "Cancelado", cls: "bg-muted text-foreground" };
    default: return { label: "—", cls: "bg-muted text-foreground" };
  }
}

function InvoicesCard() {
  const fetcher = useServerFn(listMyInvoices);
  const receiptFn = useServerFn(getReceiptData);
  const chargeReceiptFn = useServerFn(getChargeReceipt);
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  
  const [periodo, setPeriodo] = useState<"todos" | "30" | "90" | "365">("todos");
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetcher();
        if (!cancelled) setRows(r as InvoiceRow[]);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtradas = (rows ?? []).filter((r) => {
    
    if (periodo !== "todos") {
      const limite = Date.now() - Number(periodo) * 24 * 60 * 60 * 1000;
      if (new Date(r.created_at).getTime() < limite) return false;
    }
    return true;
  });

  const totalPago = filtradas
    .filter((r) => r.status === "pago")
    .reduce((acc, r) => acc + (r.amount_cents ?? 0), 0);

  async function baixarRecibo(id: string, provider?: string) {
    setBaixando(id);
    try {
      const data = provider === "abacatepay"
        ? await chargeReceiptFn({ data: { id } })
        : await receiptFn({ data: { invoiceId: id } });
      const { gerarReciboPDF } = await import("@/lib/receipt-pdf");
      await gerarReciboPDF(data as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Não consegui gerar o recibo");
    } finally {
      setBaixando(null);
    }
  }

  function exportarCSV() {
    const head = ["Data", "Provedor", "Evento", "Valor", "Status", "Forma", "ID"];
    const linhas = filtradas.map((r) => [
      new Date(r.created_at).toLocaleDateString("pt-BR"),
      r.provider,
      r.event_label,
      r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : "",
      r.status,
      r.metodo ?? "",
      r.external_id ?? "",
    ]);
    const csv = [head, ...linhas].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `faturas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }


  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2"><CreditCard className="size-4" /> Histórico de faturas</h3>
        <div className="flex items-center gap-2">
          {filtradas.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {filtradas.length} registro(s) · total pago {fmtBRL(totalPago, "BRL")}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={exportarCSV} disabled={!filtradas.length}>
            <Download className="size-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {([["todos", "Sempre"], ["30", "30 dias"], ["90", "90 dias"], ["365", "12 meses"]] as const).map(([v, l]) => (
            <Button
              key={v}
              size="sm"
              variant={periodo === v ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setPeriodo(v)}
            >
              {l}
            </Button>
          ))}
        </div>
      )}

      {rows === null ? (
        <div className="py-8 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtradas.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "Nenhuma fatura registrada ainda. Assim que houver cobrança, o histórico aparece aqui."
            : "Nenhuma fatura para esse filtro."}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-2 md:hidden">
            {filtradas.map((r) => {
              const st = fmtStatus(r.status);
              return (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                    <Badge className={`${st.cls} text-[10px]`}>{st.label}</Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{r.event_label}</span>
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      {r.amount_cents != null ? fmtBRL(r.amount_cents, "BRL") : "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {r.provider}{r.metodo ? ` • ${r.metodo}` : ""}
                    </span>
                    {r.status === "pago" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => baixarRecibo(r.id, r.provider)} disabled={baixando === r.id}>
                        {baixando === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <><FileText className="size-3.5 mr-1" /> Recibo</>}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: tabela */}
          <div className="overflow-x-auto -mx-1 hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="py-2 px-1">Data</th>
                  <th className="py-2 px-1">Descrição</th>
                  <th className="py-2 px-1">Forma</th>
                  <th className="py-2 px-1 text-right">Valor</th>
                  <th className="py-2 px-1">Status</th>
                  <th className="py-2 px-1 text-right">Recibo</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r) => {
                  const st = fmtStatus(r.status);
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 px-1 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="py-2 px-1">
                        <div>{r.event_label}</div>
                        <div className="text-[11px] text-muted-foreground capitalize">{r.provider}</div>
                      </td>
                      <td className="py-2 px-1 text-muted-foreground">{r.metodo ?? "—"}</td>
                      <td className="py-2 px-1 text-right tabular-nums font-medium">
                        {r.amount_cents != null ? fmtBRL(r.amount_cents, "BRL") : "—"}
                      </td>
                      <td className="py-2 px-1"><Badge className={st.cls}>{st.label}</Badge></td>
                      <td className="py-2 px-1 text-right">
                        {r.status === "pago" ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => baixarRecibo(r.id, r.provider)} disabled={baixando === r.id}>
                            {baixando === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <><Download className="size-3.5 mr-1" /> PDF</>}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}


function CancelSubscriptionButton({
  companyId, status, cancelAtPeriodEnd, periodEnd, onChanged,
}: {
  companyId: string;
  status?: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  onChanged: () => void;
}) {
  const cancelFn = useServerFn(cancelMySubscription);
  const reactivateFn = useServerFn(reactivateMySubscription);

  const [busy, setBusy] = useState(false);
  const isTrial = status === "trialing";

  async function handleCancel() {
    const msg = isTrial
      ? "Cancelar seu teste agora? Você perderá o acesso imediatamente."
      : `Cancelar sua assinatura? Você mantém acesso até ${
          periodEnd ? new Date(periodEnd).toLocaleDateString("pt-BR") : "o fim do período"
        } e não haverá nova cobrança.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const r: any = await cancelFn({ data: { companyId } });
      toast.success(r?.mode === "period_end" ? "Cancelamento agendado para o fim do período." : "Assinatura cancelada.");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao cancelar");
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate() {
    setBusy(true);
    try {
      await reactivateFn({ data: { companyId } });
      toast.success("Assinatura reativada.");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reativar");
    } finally {
      setBusy(false);
    }
  }

  if (cancelAtPeriodEnd && status === "active") {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs space-y-2">
        <div className="text-amber-900">
          Cancelamento agendado{periodEnd ? ` para ${new Date(periodEnd).toLocaleDateString("pt-BR")}` : ""}.
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={handleReactivate} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : null}
          Reativar assinatura
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCancel} disabled={busy} className="text-red-600 hover:text-red-700 hover:bg-red-50">
      {busy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <X className="size-3.5 mr-1.5" />}
      {isTrial ? "Cancelar teste" : "Cancelar assinatura"}
    </Button>
  );
}


/* ========== CSAT Config ========== */
import { getCsatConfig, updateCsatConfig } from "@/lib/csat-config.functions";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function CsatConfigCard() {
  const getFn = useServerFn(getCsatConfig);
  const saveFn = useServerFn(updateCsatConfig);
  const [pergunta, setPergunta] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [moverPosVenda, setMoverPosVenda] = useState(true);
  const [autoGanho, setAutoGanho] = useState(false);
  const [formato, setFormato] = useState<"link" | "chat">("link");
  const [pedirComentario, setPedirComentario] = useState(true);
  const [textoComentario, setTextoComentario] = useState("");
  const [textoAgradecimento, setTextoAgradecimento] = useState("");
  const [enviarAoFinalizar, setEnviarAoFinalizar] = useState(false);
  const [destinoPipelineId, setDestinoPipelineId] = useState<string | null>(null);
  const [destinoStageId, setDestinoStageId] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<Array<{ id: string; nome: string; tipo: string }>>([]);
  const [stages, setStages] = useState<Array<{ id: string; nome: string; pipeline_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const c: any = await getFn();
        setPergunta(c.pergunta); setAtivo(c.ativo); setMoverPosVenda(c.moverPosVenda);
        setAutoGanho(c.autoGanho === true);
        setFormato(c.formato === "chat" ? "chat" : "link");
        setPedirComentario(c.pedirComentario !== false);
        setTextoComentario(c.textoComentario ?? "");
        setTextoAgradecimento(c.textoAgradecimento ?? "");
        setEnviarAoFinalizar(c.enviarAoFinalizar === true);
        setPipelines(c.pipelines ?? []);
        setStages(c.stages ?? []);
        const posv = (c.pipelines ?? []).find((p: any) => p.tipo === "posvenda");
        setDestinoPipelineId(c.destinoPipelineId ?? posv?.id ?? null);
        if (c.destinoStageId) setDestinoStageId(c.destinoStageId);
        else if (posv) {
          const first = (c.stages ?? []).filter((s: any) => s.pipeline_id === posv.id)[0];
          setDestinoStageId(first?.id ?? null);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const stagesDoPipeline = stages.filter((s) => s.pipeline_id === destinoPipelineId);

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: { pergunta, ativo, moverPosVenda, autoGanho, destinoPipelineId, destinoStageId, formato, pedirComentario, textoComentario, textoAgradecimento, enviarAoFinalizar } });
      toast.success("Configuração salva");
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  if (loading) return <Card className="p-6"><Loader2 className="size-4 animate-spin" /></Card>;
  return (
    <Card className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-w-2xl">
      <div>
        <h3 className="font-semibold text-base">Pesquisa de satisfação (CSAT)</h3>
        <p className="text-sm text-muted-foreground mt-1">Enviada quando o atendente clica no botão CSAT no chat. Você pode escolher para qual funil e etapa o lead vai após o envio.</p>
      </div>
      <div className="flex items-start sm:items-center justify-between gap-3 p-3 rounded-lg border">
        <div>
          <div className="font-medium text-sm">Ativo</div>
          <div className="text-xs text-muted-foreground">Habilitar envio de pesquisa aos clientes</div>
        </div>
        <Switch checked={ativo} onCheckedChange={setAtivo} />
      </div>
      <div className="p-3 rounded-lg border space-y-3">
        <div>
          <div className="font-medium text-sm">Como o cliente responde</div>
          <div className="text-xs text-muted-foreground">Escolha entre enviar um link de pesquisa ou receber a nota na própria conversa.</div>
        </div>
        <Select value={formato} onValueChange={(v) => setFormato(v === "chat" ? "chat" : "link")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="link">Link de pesquisa (página)</SelectItem>
            <SelectItem value="chat">Responder no chat (nota de 1 a 5)</SelectItem>
          </SelectContent>
        </Select>
        {formato === "chat" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Pedir comentário após a nota</div>
                <div className="text-xs text-muted-foreground">A próxima mensagem do cliente vira o comentário.</div>
              </div>
              <Switch checked={pedirComentario} onCheckedChange={setPedirComentario} />
            </div>
            <div>
              <Label className="text-xs">Mensagem de agradecimento</Label>
              <Textarea rows={2} value={textoAgradecimento} onChange={(e) => setTextoAgradecimento(e.target.value)} placeholder="Obrigado pela sua avaliação! 🙏" />
            </div>
            {pedirComentario && (
              <div>
                <Label className="text-xs">Pedido de comentário</Label>
                <Textarea rows={2} value={textoComentario} onChange={(e) => setTextoComentario(e.target.value)} placeholder="Quer deixar um comentário? Pode escrever aqui. 🙂" />
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Enviar ao finalizar o atendimento</div>
                <div className="text-xs text-muted-foreground">Além do envio manual pelo botão no chat.</div>
              </div>
              <Switch checked={enviarAoFinalizar} onCheckedChange={setEnviarAoFinalizar} />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-start sm:items-center justify-between gap-3 p-3 rounded-lg border">
        <div>
          <div className="font-medium text-sm">Enviar automaticamente ao Ganho</div>
          <div className="text-xs text-muted-foreground">Ao mover um card para uma etapa de Ganho, dispara a pesquisa automaticamente</div>
        </div>
        <Switch checked={autoGanho} onCheckedChange={setAutoGanho} />
      </div>
      <div className="p-3 rounded-lg border space-y-3">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <div className="font-medium text-sm">Mover lead após enviar a pesquisa</div>
            <div className="text-xs text-muted-foreground">Escolha o funil e a etapa de destino. Desligue para manter o card onde está.</div>
          </div>
          <Switch checked={moverPosVenda} onCheckedChange={setMoverPosVenda} />
        </div>
        {moverPosVenda && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Funil de destino</Label>
              <Select value={destinoPipelineId ?? ""} onValueChange={(v) => { setDestinoPipelineId(v); const first = stages.find((s) => s.pipeline_id === v); setDestinoStageId(first?.id ?? null); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar funil" /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Etapa de destino</Label>
              <Select value={destinoStageId ?? ""} onValueChange={setDestinoStageId} disabled={!destinoPipelineId}>
                <SelectTrigger><SelectValue placeholder="Selecionar etapa" /></SelectTrigger>
                <SelectContent>
                  {stagesDoPipeline.map((s) => (<SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
      <div>
        <Label>Mensagem da pesquisa</Label>
        <Textarea rows={4} value={pergunta} onChange={(e) => setPergunta(e.target.value)}
          placeholder="Como você avalia nosso atendimento de 1 a 5? 🙏" />
        <p className="text-xs text-muted-foreground mt-1">
          {formato === "chat"
            ? "A mensagem vai exatamente como você escreveu (linhas, emojis e estrelas preservados). Peça uma nota de 1 a 5."
            : "O link com a pesquisa é anexado automaticamente ao final."}
        </p>
      </div>

      <Button className="w-full sm:w-auto" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />} Salvar
      </Button>
    </Card>
  );
}

function SugestoesCard({ companyId, userId }: { companyId: string | undefined; userId: string }) {
  const submitFn = useServerFn(submitFeedback);
  const [category, setCategory] = useState("sugestao");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string; path: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("user_feedback")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [userId]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (attachments.length + files.length > 10) {
      toast.error("Máximo 10 anexos");
      return;
    }
    setUploading(true);
    try {
      const uploaded: typeof attachments = [];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name}: excede 5 MB`);
          continue;
        }
        const ext = file.name.split(".").pop() || "bin";
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("feedback-attachments").upload(path, file, {
          contentType: file.type || undefined,
        });
        if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
        const { data: signed } = await supabase.storage.from("feedback-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
        uploaded.push({ url: signed?.signedUrl || "", name: file.name, path });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(idx: number) {
    const a = attachments[idx];
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    if (a?.path) void supabase.storage.from("feedback-attachments").remove([a.path]);
  }

  async function send() {
    if (message.trim().length < 3) return toast.error("Descreva um pouco mais");
    setSending(true);
    try {
      await submitFn({ data: {
        category, title: title.trim() || null, message,
        link: link.trim() || null,
        company_id: companyId ?? null,
        attachments: attachments.map((a) => ({ url: a.url, name: a.name })),
      }});
      toast.success("Sugestão enviada. Obrigado!");
      setTitle(""); setMessage(""); setLink(""); setAttachments([]);
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  const statusColors: Record<string, string> = {
    aberto: "bg-amber-100 text-amber-800",
    respondido: "bg-emerald-100 text-emerald-800",
    arquivado: "bg-zinc-100 text-zinc-700",
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Lightbulb className="size-4" /> Enviar sugestão</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Compartilhe ideias de melhorias, novas funcionalidades ou reporte problemas. Anexe prints e links de referência.
          </p>
        </div>

        <div className="grid sm:grid-cols-[200px_1fr] gap-3">
          <div>
            <Label>Categoria</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="sugestao">Sugestão de melhoria</option>
              <option value="bug">Reportar problema / bug</option>
              <option value="duvida">Dúvida</option>
              <option value="elogio">Elogio</option>
              <option value="geral">Outro</option>
            </select>
          </div>
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Adicionar exportação em Excel" maxLength={200} />
          </div>
        </div>

        <div>
          <Label>Descrição</Label>
          <Textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Conte com detalhes a sua ideia ou problema…"
            maxLength={4000}
          />
        </div>

        <div>
          <Label className="flex items-center gap-1.5"><Link2 className="size-3.5" /> Link de referência (opcional)</Label>
          <Input value={link} onChange={(e) => setLink(e.target.value)}
            placeholder="https://…" maxLength={500} />
        </div>

        <div>
          <Label className="flex items-center gap-1.5"><ImageIcon className="size-3.5" /> Anexos (prints, imagens — até 5 MB cada)</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div key={i} className="relative group">
                <a href={a.url} target="_blank" rel="noreferrer"
                  className="block w-20 h-20 rounded-md border border-border overflow-hidden bg-muted">
                  {/\.(png|jpe?g|gif|webp|svg)$/i.test(a.name) ? (
                    <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-[10px] px-1 text-center text-muted-foreground">
                      {a.name}
                    </div>
                  )}
                </a>
                <button type="button" onClick={() => void removeAttachment(i)}
                  className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-foreground text-background grid place-items-center opacity-0 group-hover:opacity-100 transition">
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <label className="w-20 h-20 rounded-md border border-dashed border-border grid place-items-center cursor-pointer hover:bg-muted/50 text-xs text-muted-foreground">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : (
                <div className="flex flex-col items-center gap-0.5">
                  <Upload className="size-4" />
                  <span>Anexar</span>
                </div>
              )}
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { void handleFiles(e.target.files); e.currentTarget.value = ""; }} />
            </label>
          </div>
        </div>

        <div className="flex justify-stretch sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={send} disabled={sending || uploading || message.trim().length < 3}>
            {sending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Send className="size-4 mr-1.5" />}
            Enviar sugestão
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="font-semibold">Minhas sugestões</h3>
          <p className="text-xs text-muted-foreground mt-1">Acompanhe o status e respostas da equipe.</p>
        </div>
        {loading ? (
          <div className="py-10 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Você ainda não enviou nenhuma sugestão.</div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{r.category}</Badge>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[r.status] ?? "bg-zinc-100 text-zinc-700"}`}>{r.status}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                {r.title && <div className="text-sm font-medium mb-1">{r.title}</div>}
                <div className="text-sm whitespace-pre-wrap">{r.message}</div>
                {r.link && (
                  <a href={r.link} target="_blank" rel="noreferrer"
                    className="text-xs mt-1.5 inline-flex items-center gap-1 text-[color:var(--brand)] hover:underline break-all">
                    <Link2 className="size-3" /> {r.link}
                  </a>
                )}
                {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {r.attachments.map((a: any, i: number) => (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer"
                        className="block w-16 h-16 rounded border border-border overflow-hidden bg-muted">
                        <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                {r.admin_reply && (
                  <div className="mt-2 pl-3 border-l-2 border-primary text-sm text-muted-foreground whitespace-pre-wrap">
                    <span className="font-medium text-foreground">Resposta da equipe:</span> {r.admin_reply}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
