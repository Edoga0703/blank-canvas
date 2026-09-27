import { createFileRoute, redirect, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStandalone } from "@/hooks/use-standalone";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Bot,
  KanbanSquare,
  ShieldCheck,
  Zap,
  ArrowLeft,
  CheckCircle2,
  MessageCircle,
  TrendingUp,
  Calendar,
  Eye,
  EyeOff,
} from "lucide-react";
import { brand } from "@/config/brand";
import metrixLogo from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";
import mascotLogin from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";
import { getRememberChoice, setRememberChoice } from "@/lib/session-persistence";
import { maskPhone } from "@/lib/masks";
import { parseBrPhone } from "@/lib/br-phone";
import { sendSignupWelcome } from "@/lib/signup-welcome.functions";


type Search = { modo?: "login" | "signup"; plano?: string; next?: string; ref?: string };

function safeNext(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return undefined;
  return v;
}

export const Route = createFileRoute("/entrar")({
  ssr: false,
  head: () => ({ meta: [{ title: `${brand.name} — Começar` }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    modo: s.modo === "login" ? "login" : "signup",
    plano: typeof s.plano === "string" ? s.plano : undefined,
    next: safeNext(s.next),
    ref: typeof s.ref === "string" ? s.ref : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const dest = search.next ?? (search.plano ? `/app/checkout?plano=${encodeURIComponent(search.plano)}` : "/app/dashboard");
      throw redirect({ href: dest });
    }
  },
  component: EntrarPage,
});

const PLAN_LABEL: Record<string, { nome: string; preco: string }> = {
  starter: { nome: "Starter", preco: "R$ 97/mês" },
  pro: { nome: "Capi PRO", preco: "R$ 79,90/mês" },
  business: { nome: "Business", preco: "R$ 497/mês" },
};

import { trackReferralClick } from "@/lib/partners.functions";

const emailSchema = z.string().email("E-mail inválido");

function EntrarPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/entrar" }) as Search;
  const [mode, setMode] = useState<"login" | "signup">(search.modo === "login" ? "login" : "signup");
  const isStandalone = useStandalone();
  useEffect(() => {
    if (isStandalone) setMode("login");
  }, [isStandalone]);

  // Registra a abertura do link de indicação (uma vez por sessão/código).
  useEffect(() => {
    const code = search.ref;
    if (!code) return;
    const key = `ref_click_${code}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* sessionStorage indisponível */ }
    void trackReferralClick({ data: { codigo: code, referer: document.referrer || undefined } }).catch(() => {});
  }, [search.ref]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupSentTo, setSignupSentTo] = useState<string | null>(null);
  const [remember, setRemember] = useState(() => getRememberChoice());


  const planInfo = search.plano ? PLAN_LABEL[search.plano] : null;

  async function routeAfterAuth(referralCode?: string | null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    if (search.next) {
      navigate({ href: search.next, replace: true });
      return;
    }
    if (search.plano) {
      navigate({ to: "/app/checkout", search: { plano: search.plano } as any, replace: true });
      return;
    }
    
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (roles?.some((r) => r.role === "super_admin")) {
      navigate({ to: "/master/painel", replace: true });
      return;
    }
    
    // Identifica se o usuário já tem uma empresa ou precisa criar
    const { data: cu } = await supabase.from("company_user")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .maybeSingle();

    // Process referral if exists AND user just joined a company (or we can link the first company they are associated with)
    if (referralCode && cu?.company_id) {
      try {
        const { data: partner } = await supabase
          .from("parceiro")
          .select("id")
          .eq("codigo_indicacao", referralCode)
          .eq("status", "ativo")
          .maybeSingle();
        
        if (partner) {
          // Check if already referred to avoid duplicates
          const { data: existing } = await supabase
            .from("parceiro_indicacao")
            .select("id")
            .eq("company_id", cu.company_id)
            .maybeSingle();
            
          if (!existing) {
            await supabase.from("parceiro_indicacao").insert({
              parceiro_id: partner.id,
              company_id: cu.company_id,
              status: "ativo"
            });
          }
        }
      } catch (e) {
        console.error("Referral linking failed:", e);
      }
    }

    navigate({ href: cu ? "/app/dashboard" : "/app/checkout", replace: true });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const v = emailSchema.safeParse(email);
    if (!v.success) return toast.error(v.error.issues[0].message);
    if (!password) return toast.error("Informe sua senha.");
    setRememberChoice(remember);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error("E-mail ou senha incorretos.");
    toast.success("Bem-vindo de volta!");
    routeAfterAuth(search.ref);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return toast.error("Informe seu nome.");
    const fone = parseBrPhone(telefone);
    if (!fone.valid) return toast.error(fone.reason ? `WhatsApp inválido: ${fone.reason}` : "Informe um WhatsApp válido.");
    const v = emailSchema.safeParse(email);
    if (!v.success) return toast.error(v.error.issues[0].message);
    if (scorePassword(password).score < 2) return toast.error("Sua senha está muito fraca. Use ao menos 8 caracteres com letras e números.");
    if (password !== confirmPassword) return toast.error("As senhas não conferem.");

    setRememberChoice(true);
    setLoading(true);

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: nome.trim(), telefone: fone.numero },
        emailRedirectTo: window.location.origin + (search.plano ? `/app/checkout?plano=${search.plano}` : "/app/dashboard"),
      },
    });

    if (signUpErr) {
      setLoading(false);
      const msg = (signUpErr.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        setMode("login");
        toast.message("Já existe uma conta com esse e-mail.", { description: "Faça login pra continuar." });
        return;
      }
      return toast.error(signUpErr.message);
    }

    // Disparo de boas-vindas (nunca bloqueia o cadastro)
    void sendSignupWelcome({
      data: { nome: nome.trim(), email, telefone: fone.numero, userId: signUpData.user?.id ?? null },
    }).catch(() => {});


    if (signUpData.session) {
      setLoading(false);
      toast.success("Conta criada!");
      return routeAfterAuth(search.ref);
    }

    // Try immediate sign-in (auto-confirm scenarios)
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInErr) {
      setSignupSentTo(email);
      return;
    }
    toast.success("Conta criada!");
    routeAfterAuth(search.ref);
  }

  return (
    <div className="public-surface min-h-screen w-full relative overflow-hidden bg-white text-[#12263A]">
      {/* Subtle grid + blue glow bg */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(11,34,254,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,34,254,0.05) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 85%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 85%)",
          }}
        />
        <div
          className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, var(--brand-soft) 0%, transparent 60%)" }}
        />
        <div
          className="absolute bottom-[-200px] -right-40 h-[600px] w-[600px] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #334155 0%, transparent 65%)" }}
        />
      </div>

      <div className="relative z-10 min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
        {/* LEFT — mascot & brand */}
        <aside className="hidden lg:flex flex-col justify-between p-10 xl:p-14 relative">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#12263A]/60 hover:text-[#334155] transition-colors">
              <ArrowLeft className="size-4" />
              voltar ao site
            </Link>
          </div>

          <div className="absolute top-8 right-8 xl:top-10 xl:right-10 z-20">
            <img src={metrixLogo.url} alt="Capi Conversa" className="h-16 xl:h-20 w-auto drop-shadow-sm" />
          </div>

          <div className="relative flex-1 flex items-center justify-center">
            <div aria-hidden className="absolute inset-0 flex items-center justify-center">
              <div className="absolute w-[85%] aspect-square rounded-full border border-dashed border-[#334155]/15" />
              <div className="absolute w-[65%] aspect-square rounded-full border border-dashed border-[#334155]/25" />
              <div className="absolute w-[45%] aspect-square rounded-full border border-dashed border-[#334155]/35" />
              <div className="absolute w-[70%] aspect-square rounded-full bg-[#334155]/10 blur-3xl" />
            </div>

            <img
              src={mascotLogin.url}
              alt="Mascote Capi Conversa"
              className="relative w-[78%] max-w-md h-auto object-contain drop-shadow-2xl"
              loading="eager"
            />

            <div className="absolute top-6 left-2 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#334155]/10 px-3 py-2 border border-[#334155]/10 animate-[float_6s_ease-in-out_infinite]">
              <div className="w-8 h-8 rounded-lg bg-[#334155] flex items-center justify-center text-white shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Nova conversa</div>
                <div className="text-[10px] text-[#12263A]/60">WhatsApp · há 2s</div>
              </div>
            </div>

            <div className="absolute top-24 right-4 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#334155]/10 px-3 py-2 border border-[#334155]/10 animate-[float_7s_ease-in-out_infinite_0.8s]">
              <div className="w-8 h-8 rounded-lg bg-[#334155]/10 flex items-center justify-center text-[#334155] shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">+R$ 12.480 hoje</div>
                <div className="text-[10px] text-[#12263A]/60">↑ 23% vs ontem</div>
              </div>
            </div>

            <div className="absolute bottom-10 left-4 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#334155]/10 px-3 py-2 border border-[#334155]/10 animate-[float_8s_ease-in-out_infinite_1.4s]">
              <div className="w-8 h-8 rounded-lg bg-[#334155] flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">IA respondeu</div>
                <div className="text-[10px] text-[#12263A]/60">Lead qualificado</div>
              </div>
            </div>

            <div className="absolute bottom-24 right-2 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#334155]/10 px-3 py-2 border border-[#334155]/10 animate-[float_6.5s_ease-in-out_infinite_0.4s]">
              <div className="w-8 h-8 rounded-lg bg-[#334155]/10 flex items-center justify-center text-[#334155] shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Reunião agendada</div>
                <div className="text-[10px] text-[#12263A]/60">Amanhã, 14h</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 text-xs text-[#12263A]/60">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#334155]" /> LGPD-friendly</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#334155]" /> Sem cartão p/ testar</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#334155]" /> Cancele quando quiser</span>
          </div>
        </aside>

        {/* RIGHT — form */}
        <main className="flex flex-col items-center justify-center px-4 py-6 sm:px-8 sm:py-10 md:px-12">
          <div className="lg:hidden w-full max-w-md mb-5 flex items-center justify-between">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#12263A]/60 hover:text-[#334155]">
              <ArrowLeft className="size-4" /> voltar
            </Link>
            <img src={metrixLogo.url} alt="Capi Conversa" className="h-9 sm:h-11 w-auto" />
          </div>

          <div className="lg:hidden mb-3 sm:mb-5 relative">
            <div aria-hidden className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 sm:w-56 aspect-square rounded-full bg-[#334155]/10 blur-3xl" />
            </div>
            <img
              src={mascotLogin.url}
              alt="Mascote Capi Conversa"
              className="relative w-28 sm:w-40 md:w-48 h-auto object-contain drop-shadow-xl"
            />
          </div>

          <div className="w-full max-w-md">


            <div className="relative rounded-2xl bg-white border border-[#334155]/10 shadow-xl shadow-[#334155]/10 p-5 sm:p-7 overflow-hidden">
              <div
                aria-hidden
                className="absolute -top-24 -right-24 size-56 rounded-full blur-3xl opacity-40"
                style={{ background: "radial-gradient(circle, rgba(11,34,254,.35) 0%, transparent 70%)" }}
              />

              <div className="relative">
                {planInfo && (
                  <div className="mb-5 rounded-xl border border-[#334155]/20 bg-[#334155]/5 p-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase font-bold tracking-[0.14em] text-[#334155]">
                      <Sparkles className="size-3.5" /> Plano escolhido
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <div className="font-display text-lg font-bold">{planInfo.nome}</div>
                      <div className="text-sm font-semibold">{planInfo.preco}</div>
                    </div>
                    <div className="text-xs text-[#12263A]/60 mt-1">7 dias grátis • cancele antes e não paga nada</div>
                  </div>
                )}

                {signupSentTo ? (
                  <div className="text-center py-2">
                    <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-[#334155]/10">
                      <CheckCircle2 className="size-8 text-[#334155]" />
                    </div>
                    <h1 className="font-display text-[22px] sm:text-[26px] font-black leading-tight tracking-tight">
                      Verifique seu e-mail
                    </h1>
                    <p className="text-sm text-[#12263A]/70 mt-2 leading-relaxed">
                      Enviamos um link de confirmação para
                      <br />
                      <span className="font-semibold text-[#12263A]">{signupSentTo}</span>
                    </p>
                    <p className="text-xs text-[#12263A]/55 mt-3">
                      Clique no link do e-mail para ativar sua conta. Não esqueça de conferir a caixa de spam.
                    </p>
                    <div className="mt-6 space-y-3">
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => { setSignupSentTo(null); setMode("login"); setPassword(""); setConfirmPassword(""); }}
                        className="w-full h-12 bg-[#334155] hover:bg-[#0919cc] text-white font-semibold rounded-full shadow-lg shadow-[#334155]/30"
                      >
                        Ir para o login
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={async () => {
                          setLoading(true);
                          const { error } = await supabase.auth.resend({ type: "signup", email: signupSentTo });
                          setLoading(false);
                          if (error) return toast.error("Não conseguimos reenviar agora. Tente em alguns instantes.");
                          toast.success("Link reenviado! Confira seu e-mail.");
                        }}
                        disabled={loading}
                        className="w-full h-10 text-sm text-[#12263A]/70 hover:text-[#334155]"
                      >
                        {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                        Reenviar link de confirmação
                      </Button>
                    </div>
                  </div>
                ) : (
                <>
                {/* Tabs */}
                <div className={`${isStandalone ? "hidden" : "grid"} grid-cols-2 gap-1 p-1 rounded-full bg-[#334155]/5 border border-[#334155]/10 mb-6`}>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className={`h-10 rounded-full text-sm font-semibold transition-colors ${
                      mode === "signup" ? "bg-primary text-primary-foreground shadow-md shadow-[#334155]/25" : "text-[#12263A]/60 hover:text-[#334155]"
                    }`}
                  >
                    Criar conta
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`h-10 rounded-full text-sm font-semibold transition-colors ${
                      mode === "login" ? "bg-primary text-primary-foreground shadow-md shadow-[#334155]/25" : "text-[#12263A]/60 hover:text-[#334155]"
                    }`}
                  >
                    Entrar
                  </button>
                </div>

                <h1 className="font-display text-[24px] sm:text-[28px] font-black leading-tight tracking-tight">
                  {mode === "login" ? "Bem-vindo de volta" : "Crie sua conta"}
                </h1>
                <p className="text-sm text-[#12263A]/60 mt-1.5 mb-6">
                  {mode === "login"
                    ? "Entre com seu e-mail e senha pra continuar."
                    : "Preencha os dados abaixo pra começar seu teste grátis."}
                </p>

                {mode === "signup" ? (
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="nome">Nome completo</Label>
                      <Input id="nome" type="text" value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Seu nome" className="h-11" autoComplete="name" />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="telefone">WhatsApp</Label>
                      <Input
                        id="telefone"
                        type="tel"
                        inputMode="tel"
                        value={telefone}
                        onChange={(e) => setTelefone(maskPhone(e.target.value))}
                        required
                        placeholder="(11) 91234-5678"
                        className="h-11"
                        autoComplete="tel"
                      />
                      <p className="text-xs text-[#12263A]/50">Enviaremos as boas-vindas por WhatsApp.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@empresa.com" className="h-11" autoComplete="email" />
                    </div>

                    <div className="space-y-2">
                      <PasswordField
                        id="pwd"
                        label="Senha"
                        value={password}
                        onChange={setPassword}
                        show={showPwd}
                        toggle={() => setShowPwd((v) => !v)}
                        placeholder="Crie uma senha forte"
                        autoComplete="new-password"
                      />
                      <PasswordStrength value={password} />
                    </div>

                    <PasswordField
                      id="pwd2"
                      label="Confirmar senha"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      show={showConfirmPwd}
                      toggle={() => setShowConfirmPwd((v) => !v)}
                      placeholder="Repita a senha"
                      autoComplete="new-password"
                    />

                    <Button type="submit" disabled={loading} size="lg" className="w-full h-12 bg-[#334155] hover:bg-[#0919cc] text-white font-semibold rounded-full shadow-lg shadow-[#334155]/30">
                      {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                      {planInfo ? "Criar conta e continuar" : "Criar conta grátis"}
                    </Button>

                    <p className="text-[11.5px] text-[#12263A]/60 text-center pt-1 leading-relaxed">
                      Sem cartão para começar os <span className="font-semibold text-[#12263A]">7 dias grátis</span>. Cancele quando quiser.
                    </p>
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@empresa.com" className="h-11" autoComplete="email" />
                    </div>

                    <PasswordField
                      id="pwd"
                      label="Senha"
                      value={password}
                      onChange={setPassword}
                      show={showPwd}
                      toggle={() => setShowPwd((v) => !v)}
                      placeholder="Sua senha"
                      autoComplete="current-password"
                      rightSlot={
                        <Link to="/esqueci-senha" className="text-[11.5px] font-medium text-[#12263A]/60 hover:text-[#334155] transition-colors">
                          Esqueci minha senha
                        </Link>
                      }
                    />

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="mt-0.5 size-4 rounded border-[#12263A]/25 accent-[#334155]"
                      />
                      <span className="text-[12.5px] leading-snug text-[#12263A]/70">
                        Manter-me conectado
                        <span className="block text-[11px] text-[#12263A]/45">
                          {remember
                            ? "Você não precisará digitar e-mail e senha novamente neste navegador."
                            : "Por segurança, pediremos login novamente após 12h sem uso."}
                        </span>
                      </span>
                    </label>

                    <Button type="submit" disabled={loading} size="lg" className="w-full h-12 bg-[#334155] hover:bg-[#0919cc] text-white font-semibold rounded-full shadow-lg shadow-[#334155]/30">
                      {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                      Entrar
                    </Button>


                    <p className={`${isStandalone ? "hidden" : "block"} text-[12px] text-[#12263A]/60 text-center pt-1`}>
                      Ainda não tem conta?{" "}
                      <button type="button" onClick={() => setMode("signup")} className="font-semibold text-[#334155] hover:underline">
                        Criar agora
                      </button>
                    </p>
                  </form>
                )}
                </>
                )}
              </div>
            </div>

            <div className="lg:hidden grid gap-2.5 mt-6">
              <MiniFeature icon={<Bot className="size-4" />} text="IA treinada no seu negócio" />
              <MiniFeature icon={<KanbanSquare className="size-4" />} text="CRM Kanban inteligente" />
              <MiniFeature icon={<Zap className="size-4" />} text="Pronto em 2 minutos" />
            </div>

            <p className="text-[11.5px] text-[#12263A]/60 text-center mt-5">
              Ao continuar, você concorda com nossos{" "}
              <Link to="/termos" className="underline underline-offset-2 hover:text-[#334155]">Termos</Link>{" "}
              e{" "}
              <Link to="/privacidade" className="underline underline-offset-2 hover:text-[#334155]">Política de privacidade</Link>.
            </p>

            <div className="lg:hidden mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-[#12263A]/60">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#334155]" /> LGPD-friendly</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#334155]" /> Sem cartão</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[#334155]" /> Cancele quando quiser</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  toggle,
  placeholder,
  autoComplete,
  rightSlot,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
  placeholder?: string;
  autoComplete?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {rightSlot}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="h-11 pr-11"
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-8 grid place-items-center rounded-md text-[#12263A]/50 hover:text-[#334155] hover:bg-[#334155]/5 transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function MiniFeature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#334155]/10 bg-white p-3">
      <div className="size-8 rounded-lg grid place-items-center bg-[#334155]/10 text-[#334155] shrink-0">
        {icon}
      </div>
      <div className="font-semibold text-[13.5px]">{text}</div>
    </div>
  );
}

type PwCheck = { label: string; ok: boolean };
function scorePassword(pw: string): { score: 0 | 1 | 2 | 3 | 4; checks: PwCheck[] } {
  const checks: PwCheck[] = [
    { label: "Pelo menos 8 caracteres", ok: pw.length >= 8 },
    { label: "Letra maiúscula (A-Z)", ok: /[A-Z]/.test(pw) },
    { label: "Letra minúscula (a-z)", ok: /[a-z]/.test(pw) },
    { label: "Número (0-9)", ok: /\d/.test(pw) },
    { label: "Símbolo (!@#$...)", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const passed = checks.filter((c) => c.ok).length;
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (pw.length === 0) score = 0;
  else if (passed <= 2) score = 1;
  else if (passed === 3) score = 2;
  else if (passed === 4) score = 3;
  else score = 4;
  return { score, checks };
}

function PasswordStrength({ value }: { value: string }) {
  const { score, checks } = scorePassword(value);
  const labels = ["", "Muito fraca", "Fraca", "Boa", "Forte"];
  const colors = ["bg-gray-200", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-emerald-500"];
  const textColors = ["text-gray-500", "text-red-600", "text-orange-600", "text-yellow-700", "text-emerald-600"];
  if (!value) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : "bg-gray-200"}`} />
        ))}
      </div>
      <div className={`text-[11.5px] font-semibold ${textColors[score]}`}>Força: {labels[score]}</div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className={`text-[11.5px] flex items-center gap-1.5 ${c.ok ? "text-emerald-600" : "text-[#12263A]/50"}`}>
            <span className="inline-block size-3.5 rounded-full grid place-items-center text-[9px] leading-none" style={{ background: c.ok ? "#10b981" : "#e5e7eb", color: c.ok ? "white" : "#9ca3af" }}>
              {c.ok ? "✓" : "•"}
            </span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
