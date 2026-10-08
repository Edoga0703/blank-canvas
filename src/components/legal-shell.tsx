import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { brand } from "@/config/brand";

export function LegalShell({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt?: string;
  children: React.ReactNode;
}) {
  const brandName = brand?.name || "TuSaaS CRM";

  return (
    <div className="public-surface relative min-h-screen bg-[#F8F9FA] text-[#0F172A] overflow-hidden">
      {/* Fondo decorativo sutil */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(37,99,235,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at top, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at top, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 80%)",
          }}
        />
        <div
          className="absolute -top-40 -right-32 h-[450px] w-[450px] rounded-full blur-3xl opacity-20 bg-blue-500/30"
        />
      </div>

      {/* Cabecera */}
      <header className="relative z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 min-w-0 group">
            <div className="size-8 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold text-base group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <ShieldCheck className="size-5" />
            </div>
            <span className="font-bold text-lg sm:text-xl tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
              {brandName}
            </span>
          </Link>
          <Link
            to="/"
            className="shrink-0 inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Volver al inicio</span>
            <span className="sm:hidden">Volver</span>
          </Link>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="relative z-10">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
          <div className="mb-8 sm:mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-600/20 bg-blue-50/80 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
              <ShieldCheck className="size-3.5" />
              Documento Oficial de Cumplimiento
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
              {title}
            </h1>
            {updatedAt ? (
              <p className="mt-3 text-sm text-slate-500 font-medium">
                Última actualización: {updatedAt}
              </p>
            ) : null}
          </div>

          <article className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] p-6 sm:p-10">
            <div className="space-y-8 leading-relaxed text-slate-700 [&_h2]:text-slate-900 [&_h2]:font-bold [&_h2]:text-lg [&_h2]:sm:text-xl [&_h2]:border-b [&_h2]:border-slate-100 [&_h2]:pb-2.5 [&_h3]:text-slate-800 [&_h3]:font-semibold [&_h3]:text-base [&_h3]:mt-4 [&_strong]:text-slate-900 [&_a]:text-blue-600 [&_a:hover]:underline [&_ul]:mt-2.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_ol]:mt-2.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2 [&_p]:mt-2.5">
              {children}
            </div>
          </article>

          {/* Pie de página legal */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} {brandName}. Todos los derechos reservados.</span>
            <div className="flex flex-wrap gap-5">
              <Link to="/termos" className="hover:text-blue-600 transition-colors">Términos de Servicio</Link>
              <Link to="/privacidade" className="hover:text-blue-600 transition-colors">Política de Privacidad</Link>
              <Link to="/exclusao-dados" className="hover:text-blue-600 transition-colors">Eliminación de Datos</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
