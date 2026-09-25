import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import metrixLogo from "@/assets/metrix-logo-full.png.asset.json";

export function LegalShell({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[#F8F9FB] text-[#0A0A0F] overflow-hidden">
      {/* Background decor */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(11,34,254,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,34,254,0.05) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse at top, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at top, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 75%)",
          }}
        />
        <div
          className="absolute -top-48 -right-40 h-[500px] w-[500px] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #0B22FE 0%, transparent 60%)" }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[#0B22FE]/10 bg-white/70 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <Link to="/" className="flex items-center min-w-0">
            <img
              src={metrixLogo.url}
              alt="Metrix CRM"
              className="h-8 sm:h-9 w-auto"
            />
          </Link>
          <Link
            to="/"
            className="shrink-0 inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#0A0A0F]/70 hover:text-[#0B22FE] transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Voltar ao site</span>
            <span className="sm:hidden">Voltar</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
          <div className="mb-8 sm:mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0B22FE]/15 bg-[#0B22FE]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#0B22FE]">
              Documento legal
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[#0A0A0F]">
              {title}
            </h1>
            {updatedAt ? (
              <p className="mt-3 text-sm text-[#0A0A0F]/50">
                Última atualização: {updatedAt}
              </p>
            ) : null}
          </div>

          <article className="rounded-2xl border border-[#0B22FE]/10 bg-white shadow-[0_1px_0_rgba(11,34,254,0.04),0_20px_60px_-30px_rgba(11,34,254,0.15)] p-6 sm:p-10">
            <div className="space-y-8 leading-relaxed text-[#0A0A0F]/75 [&_h2]:text-[#0A0A0F] [&_h2]:font-bold [&_h2]:text-lg [&_h2]:sm:text-xl [&_strong]:text-[#0A0A0F] [&_a]:text-[#0B22FE] [&_a:hover]:underline [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_p]:mt-2">
              {children}
            </div>
          </article>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 text-xs text-[#0A0A0F]/50">
            <span>© {new Date().getFullYear()} Metrix CRM</span>
            <div className="flex flex-wrap gap-4">
              <Link to="/termos" className="hover:text-[#0B22FE]">Termos</Link>
              <Link to="/privacidade" className="hover:text-[#0B22FE]">Privacidade</Link>
              <Link to="/reembolso" className="hover:text-[#0B22FE]">Reembolso</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
