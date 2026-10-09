import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { Loader2, Check, Building2, MapPin, ImageIcon, Bot, PartyPopper, Search, User } from "lucide-react";
import { maskCpf, maskCnpj, maskPhone, maskCep } from "@/lib/masks";
import { AvatarUploadDialog } from "@/components/config/avatar-upload-dialog";
import { CompanyLogoDialog } from "@/components/config/company-logo-dialog";

type Search = { checkout?: string };

export const Route = createFileRoute("/app/onboarding")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
  }),
  head: () => ({ meta: [{ title: `${brand.name} — Bem-vindo` }] }),
  component: Onboarding,
});

const STEPS = [
  { key: "empresa", label: "Empresa", icon: Building2 },
  { key: "endereco", label: "Endereço", icon: MapPin },
  { key: "identidade", label: "Identidade", icon: ImageIcon },
  { key: "briefing", label: "Briefing", icon: Bot },
  { key: "concluir", label: "Concluir", icon: PartyPopper },
] as const;

function Onboarding() {
  const ctx = Route.useRouteContext();
  const navigate = useNavigate();
  const search = useSearch({ from: "/app/onboarding" }) as Search;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Empresa
  const [tipoPessoa, setTipoPessoa] = useState<"pf" | "pj">("pj");
  const [cnpjCpf, setCnpjCpf] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState(ctx.company?.nome ?? "");
  const [emailCorp, setEmailCorp] = useState(ctx.user.email ?? "");
  const [telefone, setTelefone] = useState("");
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);

  // Endereço
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Identidade (fotos, sem cor/tipografia — white label)
  const [logoUrl, setLogoUrl] = useState(ctx.company?.logo_url ?? "");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Briefing (alimenta os 3 agentes de IA)
  const [briefing, setBriefing] = useState({
    sobre_empresa: "",
    produtos_servicos: "",
  });

  useEffect(() => {
    if (!ctx.company) navigate({ to: "/app/checkout", replace: true });
  }, [ctx.company, navigate]);

  useEffect(() => {
    if (!ctx.company) return;
    const c = ctx.company;
    if (c.tipo_pessoa) setTipoPessoa(c.tipo_pessoa.toLowerCase() as any);
    if (c.cnpj_cpf) setCnpjCpf(c.cnpj_cpf);
    if (c.razao_social) setRazaoSocial(c.razao_social);
    if (c.nome_fantasia) setNomeFantasia(c.nome_fantasia);
    if (c.email_corporativo) setEmailCorp(c.email_corporativo);
    if (c.telefone) setTelefone(c.telefone);
    if (c.cep) setCep(c.cep);
    if (c.rua) setRua(c.rua);
    if (c.numero) setNumero(c.numero);
    if (c.complemento) setComplemento(c.complemento);
    if (c.bairro) setBairro(c.bairro);
    if (c.cidade) setCidade(c.cidade);
    if (c.estado) setEstado(c.estado);
    if (typeof c.onboarding_step === "number" && c.onboarding_step > 0) {
      setStep(Math.min(c.onboarding_step, STEPS.length - 1));
    }
    // Perfil (avatar)
    void (async () => {
      const { data } = await supabase.from("profiles").select("avatar_url").eq("user_id", ctx.user.id).maybeSingle();
      if (data?.avatar_url) setAvatarUrl(data.avatar_url as any);
    })();
  }, [ctx.company, ctx.user.id]);

  useEffect(() => {
    if (search.checkout === "success") {
      toast.success("Pagamento validado! 7 dias grátis liberados.");
    }
  }, [search.checkout]);

  if (!ctx.company) return null;
  const companyId = ctx.company.id;

  async function buscarCnpj() {
    const cnpj = (cnpjCpf || "").replace(/\D/g, "");
    if (cnpj.length !== 14) return toast.error("CNPJ inválido");
    setBuscandoCnpj(true);
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!r.ok) throw new Error("CNPJ não encontrado");
      const d = await r.json();
      if (d.razao_social) setRazaoSocial(d.razao_social);
      if (d.nome_fantasia) setNomeFantasia(d.nome_fantasia);
      else if (d.razao_social && !nomeFantasia) setNomeFantasia(d.razao_social);
      if (d.email && !emailCorp) setEmailCorp(d.email);
      if (d.ddd_telefone_1 && !telefone) setTelefone(maskPhone(d.ddd_telefone_1));
      if (d.cep) setCep(maskCep(d.cep));
      if (d.logradouro) setRua(d.logradouro);
      if (d.numero) setNumero(String(d.numero));
      if (d.complemento) setComplemento(d.complemento);
      if (d.bairro) setBairro(d.bairro);
      if (d.municipio) setCidade(d.municipio);
      if (d.uf) setEstado(d.uf);
      toast.success("Dados do CNPJ preenchidos");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao buscar CNPJ");
    } finally {
      setBuscandoCnpj(false);
    }
  }

  async function buscarCep() {
    const c = (cep || "").replace(/\D/g, "");
    if (c.length !== 8) return toast.error("CEP inválido");
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const d = await r.json();
      if (d.erro) throw new Error("CEP não encontrado");
      setRua(d.logradouro || rua);
      setBairro(d.bairro || bairro);
      setCidade(d.localidade || cidade);
      setEstado(d.uf || estado);
      toast.success("Endereço preenchido");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao buscar CEP");
    } finally {
      setBuscandoCep(false);
    }
  }

  async function persistPartial(nextStep: number) {
    const fantasia = nomeFantasia.trim();
    const razao = razaoSocial.trim() || fantasia;
    const patch: any = {
      nome: fantasia || razao || null,
      tipo_pessoa: tipoPessoa.toUpperCase(),
      cnpj_cpf: cnpjCpf || null,
      razao_social: razao || null,
      nome_fantasia: fantasia || null,
      email_corporativo: emailCorp || null,
      telefone: telefone || null,
      cep: cep || null,
      rua: rua || null,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cidade: cidade || null,
      estado: estado || null,
      pais: "BR",
      logo_url: logoUrl || null,
      onboarding_step: nextStep,
    };
    const { data, error } = await supabase
      .from("company")
      .update(patch)
      .eq("id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error(
        "Não foi possível salvar (sessão expirada ou sem permissão). Recarregue a página e tente de novo.",
      );
    }
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!nomeFantasia.trim()) return tipoPessoa === "pj" ? "Informe o nome fantasia." : "Informe o nome do negócio.";
      if (!cnpjCpf.trim()) return tipoPessoa === "pj" ? "Informe o CNPJ." : "Informe o CPF.";
      if (!telefone.trim()) return "Informe o telefone.";
    }
    if (step === 1) {
      if (!cep.trim() || !cidade.trim() || !estado.trim()) return "Preencha CEP, cidade e estado.";
    }
    return null;
  }

  async function next() {
    const err = validateStep();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      await persistPartial(step + 1);
      setStep(Math.min(step + 1, STEPS.length - 1));
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }
  function back() { if (step > 0) setStep(step - 1); }

  async function finalizar() {
    setSaving(true);
    try {
      await persistPartial(STEPS.length - 1);

      // Aplica briefing em todos os agentes da empresa (qualificação, follow-up, pós-venda).
      if (briefing.sobre_empresa.trim() || briefing.produtos_servicos.trim()) {
        const { error: agErr } = await supabase
          .from("agent_config")
          .update({
            sobre_empresa: briefing.sobre_empresa || undefined,
            produtos_servicos: briefing.produtos_servicos || undefined,
            nome_empresa: nomeFantasia.trim() || undefined,
          })
          .eq("company_id", companyId);
        if (agErr) throw new Error(agErr.message);
      }

      const { data: doneRows, error: doneErr } = await supabase
        .from("company")
        .update({
          onboarding_completed: true,
          nome: nomeFantasia.trim(),
        })
        .eq("id", companyId)
        .select("id");
      if (doneErr) throw new Error(doneErr.message);
      if (!doneRows || doneRows.length === 0) {
        throw new Error(
          "Não foi possível concluir (sessão expirada ou sem permissão). Recarregue a página e tente de novo.",
        );
      }

      toast.success("Tudo pronto! Bem-vindo ao " + brand.name);
      window.location.href = "/app/dashboard";
    } catch (e: any) {
      toast.error(e.message || "Falha ao concluir");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold font-display">Vamos configurar seu {brand.name}</h1>
        <p className="text-sm text-muted-foreground">Leva uns 3 minutos. Você pode voltar e ajustar depois em Configurações.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 md:gap-2 mb-6 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.key} className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <div className={`size-8 rounded-full grid place-items-center text-xs font-bold transition ${
                done ? "bg-primary text-primary-foreground" :
                active ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                "bg-muted text-muted-foreground"
              }`}>
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </div>
              <div className={`text-xs md:text-sm hidden sm:block ${active ? "font-semibold" : "text-muted-foreground"}`}>{s.label}</div>
              {i < STEPS.length - 1 && <div className="w-4 md:w-8 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      <Card className="p-6 space-y-4">
        {step === 0 && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipoPessoa("pj")}
                className={`flex-1 rounded-lg border-2 p-3 text-sm font-semibold transition ${tipoPessoa === "pj" ? "border-primary bg-primary/5" : "border-border"}`}
              >Pessoa Jurídica (CNPJ)</button>
              <button
                type="button"
                onClick={() => setTipoPessoa("pf")}
                className={`flex-1 rounded-lg border-2 p-3 text-sm font-semibold transition ${tipoPessoa === "pf" ? "border-primary bg-primary/5" : "border-border"}`}
              >Pessoa Física (CPF)</button>
            </div>

            <Row label={tipoPessoa === "pj" ? "CNPJ" : "CPF"}>
              <div className="flex gap-2">
                <Input
                  value={cnpjCpf}
                  onChange={(e) => setCnpjCpf(tipoPessoa === "pj" ? maskCnpj(e.target.value) : maskCpf(e.target.value))}
                  placeholder={tipoPessoa === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                  inputMode="numeric"
                />
                {tipoPessoa === "pj" && (
                  <Button type="button" variant="outline" onClick={buscarCnpj} disabled={buscandoCnpj}>
                    {buscandoCnpj ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4 mr-1.5" />}
                    Buscar
                  </Button>
                )}
              </div>
              {tipoPessoa === "pj" && (
                <p className="text-[11px] text-muted-foreground">Preenchemos os dados do CNPJ automaticamente.</p>
              )}
            </Row>

            {tipoPessoa === "pj" && (
              <Row label="Razão social">
                <Input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} placeholder="Ex: Padaria do João LTDA" />
              </Row>
            )}

            <Row label={tipoPessoa === "pj" ? "Nome fantasia" : "Nome do negócio"}>
              <Input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} placeholder="Ex: Padaria do João" />
            </Row>

            <div className="grid sm:grid-cols-2 gap-3">
              <Row label="E-mail corporativo">
                <Input type="email" value={emailCorp} onChange={(e) => setEmailCorp(e.target.value)} />
              </Row>
              <Row label="Telefone">
                <Input value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" />
              </Row>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <Row label="CEP">
                <div className="flex gap-2">
                  <Input value={cep} onChange={(e) => setCep(maskCep(e.target.value))} placeholder="00000-000" inputMode="numeric" />
                  <Button type="button" variant="outline" size="icon" onClick={buscarCep} disabled={buscandoCep} title="Buscar CEP">
                    {buscandoCep ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  </Button>
                </div>
              </Row>
              <div className="sm:col-span-2"><Row label="Rua"><Input value={rua} onChange={(e) => setRua(e.target.value)} /></Row></div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <Row label="Número"><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></Row>
              <Row label="Complemento"><Input value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Sala, andar…" /></Row>
              <Row label="Bairro"><Input value={bairro} onChange={(e) => setBairro(e.target.value)} /></Row>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2"><Row label="Cidade"><Input value={cidade} onChange={(e) => setCidade(e.target.value)} /></Row></div>
              <Row label="Estado (UF)"><Input value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" /></Row>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Personalize sua conta com sua logo e foto. Você pode ajustar isso depois em Configurações.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 space-y-3">
                <div className="text-sm font-semibold">Logo da empresa</div>
                <div className="h-32 rounded-md bg-muted grid place-items-center overflow-hidden">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Building2 className="size-10 text-muted-foreground" />
                  )}
                </div>
                <CompanyLogoDialog
                  userId={ctx.user.id}
                  companyId={companyId}
                  onUploaded={(url) => setLogoUrl(url)}
                  trigger={
                    <Button type="button" variant="outline" className="w-full">
                      {logoUrl ? "Trocar logo" : "Enviar logo"}
                    </Button>
                  }
                />
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="text-sm font-semibold">Sua foto de perfil</div>
                <div className="h-32 rounded-md bg-muted grid place-items-center overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-24 w-24 rounded-full object-cover" />
                  ) : (
                    <User className="size-10 text-muted-foreground" />
                  )}
                </div>
                <AvatarUploadDialog
                  userId={ctx.user.id}
                  onUploaded={(url) => setAvatarUrl(url)}
                  trigger={
                    <Button type="button" variant="outline" className="w-full">
                      {avatarUrl ? "Trocar foto" : "Enviar foto"}
                    </Button>
                  }
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-muted-foreground">
              Um briefing rápido sobre sua empresa. Essas informações vão alimentar os agentes de IA
              (qualificação, follow-up e pós-venda) para que respondam com o contexto do seu negócio.
            </p>
            <Row label="Sobre a empresa">
              <Textarea
                value={briefing.sobre_empresa}
                onChange={(e) => setBriefing({ ...briefing, sobre_empresa: e.target.value })}
                rows={4}
                placeholder="O que sua empresa faz, há quanto tempo, público-alvo, diferenciais, região de atuação…"
              />
            </Row>
            <Row label="Principais produtos e serviços">
              <Textarea
                value={briefing.produtos_servicos}
                onChange={(e) => setBriefing({ ...briefing, produtos_servicos: e.target.value })}
                rows={4}
                placeholder="Liste os principais produtos e serviços, com preços/condições, se fizer sentido."
              />
            </Row>
          </>
        )}

        {step === 4 && (
          <div className="text-center py-6 space-y-4">
            <div className="size-16 mx-auto rounded-full bg-primary/10 grid place-items-center">
              <PartyPopper className="size-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-display">Tudo certo, {nomeFantasia}!</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Sua conta está pronta. Você tem <b>7 dias grátis</b> pra explorar tudo.
              Conecte seu WhatsApp no próximo passo e a IA já começa a atender.
            </p>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t border-border mt-2">
          <Button variant="ghost" onClick={back} disabled={step === 0 || saving}>Voltar</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null} Avançar
            </Button>
          ) : (
            <Button onClick={finalizar} disabled={saving} className="bg-gradient-brand text-primary-foreground hover:opacity-90 font-semibold">
              {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null} Ir pro dashboard
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
