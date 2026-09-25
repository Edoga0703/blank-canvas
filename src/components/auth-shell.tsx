import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck, CheckCircle2, KeyRound } from "lucide-react";
import metrixLogo from "@/assets/metrix-logo-full.png.asset.json";
import mascotLogin from "@/assets/mascote-login.png.asset.json";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[#F8F9FB] text-[#0A0A0F] overflow-hidden">
      {/* Background decor */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(11,34,254,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,34,254,0.05) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 85%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 85%)",
          }}
        />
        <div
          className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, #0B22FE 0%, transparent 60%)" }}
        />
        <div
          className="absolute bottom-[-200px] -right-40 h-[600px] w-[600px] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #0B22FE 0%, transparent 65%)" }}
        />
      </div>

      <div className="relative z-10 min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
        {/* LEFT — brand & mascot */}
        <aside className="hidden lg:flex flex-col justify-between p-10 xl:p-14 relative">
          <div className="flex items-center gap-4">
            <Link
              to="/entrar"
              className="inline-flex items-center gap-2 text-sm text-[#0A0A0F]/60 hover:text-[#0B22FE] transition-colors"
            >
              <ArrowLeft className="size-4" />
              voltar para o login
            </Link>
          </div>

          <div className="absolute top-8 right-8 xl:top-10 xl:right-10 z-20">
            <img
              src={metrixLogo.url}
              alt="Metrix CRM"
              className="h-16 xl:h-20 w-auto drop-shadow-sm"
            />
          </div>

          <div className="relative flex-1 flex items-center justify-center">
            <div aria-hidden className="absolute inset-0 flex items-center justify-center">
              <div className="absolute w-[85%] aspect-square rounded-full border border-dashed border-[#0B22FE]/15" />
              <div className="absolute w-[65%] aspect-square rounded-full border border-dashed border-[#0B22FE]/25" />
              <div className="absolute w-[45%] aspect-square rounded-full border border-dashed border-[#0B22FE]/35" />
              <div className="absolute w-[70%] aspect-square rounded-full bg-[#0B22FE]/10 blur-3xl" />
            </div>

            <img
              src={mascotLogin.url}
              alt="Mascote Metrix CRM"
              className="relative w-[72%] max-w-md h-auto object-contain drop-shadow-2xl"
              loading="eager"
            />

            <div className="absolute top-10 left-2 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#0B22FE]/10 px-3 py-2 border border-[#0B22FE]/10 animate-[float_6s_ease-in-out_infinite]">
              <div className="w-8 h-8 rounded-lg bg-[#0B22FE] flex items-center justify-center text-white shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Acesso seguro</div>
                <div className="text-[10px] text-[#0A0A0F]/60">criptografia ponta a ponta</div>
              </div>
            </div>

            <div className="absolute bottom-16 right-2 flex items-center gap-2 bg-white rounded-xl shadow-lg shadow-[#0B22FE]/10 px-3 py-2 border border-[#0B22FE]/10 animate-[float_7s_ease-in-out_infinite_0.6s]">
              <div className="w-8 h-8 rounded-lg bg-[#0B22FE]/10 flex items-center justify-center text-[#0B22FE] shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">LGPD-friendly</div>
                <div className="text-[10px] text-[#0A0A0F]/60">seus dados protegidos</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 text-xs text-[#0A0A0F]/60">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-[#0B22FE]" /> LGPD-friendly
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-[#0B22FE]" /> Suporte humano
            </span>
          </div>
        </aside>

        {/* RIGHT — form */}
        <main className="flex flex-col items-center justify-center px-4 py-8 sm:px-8 sm:py-10 md:px-12">
          <div className="lg:hidden w-full max-w-md mb-5 flex items-center justify-between">
            <Link
              to="/entrar"
              className="inline-flex items-center gap-2 text-sm text-[#0A0A0F]/60 hover:text-[#0B22FE]"
            >
              <ArrowLeft className="size-4" /> login
            </Link>
            <img src={metrixLogo.url} alt="Metrix CRM" className="h-9 sm:h-11 w-auto" />
          </div>

          <div className="lg:hidden mb-3 sm:mb-5 relative">
            <div aria-hidden className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 sm:w-56 aspect-square rounded-full bg-[#0B22FE]/10 blur-3xl" />
            </div>
            <img
              src={mascotLogin.url}
              alt="Mascote Metrix CRM"
              className="relative w-28 sm:w-40 h-auto object-contain drop-shadow-xl"
            />
          </div>

          <div className="w-full max-w-md">
            <div className="relative rounded-2xl bg-white border border-[#0B22FE]/10 shadow-xl shadow-[#0B22FE]/10 p-5 sm:p-7 overflow-hidden">
              <div
                aria-hidden
                className="absolute -top-24 -right-24 size-56 rounded-full blur-3xl opacity-40"
                style={{ background: "radial-gradient(circle, rgba(11,34,254,.35) 0%, transparent 70%)" }}
              />
              <div className="relative">
                <div className="mb-5">
                  <h1 className="font-display text-2xl font-black tracking-tight">{title}</h1>
                  {subtitle && (
                    <p className="text-sm text-[#0A0A0F]/60 mt-1">{subtitle}</p>
                  )}
                </div>
                {children}
              </div>
            </div>

            {footer && <div className="mt-5 text-center text-sm">{footer}</div>}

            <div className="lg:hidden mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-[#0A0A0F]/60">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-[#0B22FE]" /> LGPD-friendly
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#0B22FE]" /> Suporte humano
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  toggle,
  placeholder,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 pr-11 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-8 grid place-items-center rounded-md text-[#0A0A0F]/50 hover:text-[#0B22FE] hover:bg-[#0B22FE]/5 transition-colors"
          tabIndex={-1}
        >
          {show ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          )}
        </button>
      </div>
    </div>
  );
}
