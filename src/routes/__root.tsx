import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";

import metrixLogo from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";
import mascotLogin from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";

function NotFoundComponent() {
  return (
    <div className="public-surface relative min-h-screen bg-[#F8F9FB] text-[#0A0A0F] overflow-hidden flex flex-col">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(11,34,254,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,34,254,0.05) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 80%)",
          }}
        />
        <div
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, #334155 0%, transparent 60%)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #334155 0%, transparent 65%)" }}
        />
      </div>

      <header className="relative z-10 px-5 sm:px-8 py-5">
        <Link to="/" className="inline-flex items-center">
           <img src={metrixLogo.url} alt="Capiversa" className="h-8 sm:h-9 w-auto" />
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 py-8">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-5xl w-full">
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#334155]/15 bg-[#334155]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#334155]">
              Erro 404
            </div>
            <h1 className="mt-4 text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-[#0A0A0F]">
              Página não<br />encontrada
            </h1>
            <p className="mt-4 text-base sm:text-lg text-[#0A0A0F]/60 max-w-md mx-auto lg:mx-0">
               A página que você procura não existe ou foi movida. Vamos te levar de volta pra rota certa.
            </p>
            <div className="mt-8 flex flex-wrap justify-center lg:justify-start gap-3">
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-xl bg-[#334155] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#1E293B] transition-colors"
              >
                Voltar para o início
              </Link>
              <Link
                to="/entrar"
                className="inline-flex items-center justify-center rounded-xl border border-[#334155]/20 bg-white px-6 py-3 text-sm font-semibold text-[#0A0A0F] hover:border-[#334155]/40 transition-colors"
              >
                Entrar no sistema
              </Link>
            </div>
            <p className="mt-6 text-xs text-[#0A0A0F]/40">
              Já é cliente? O suporte fica no chat dentro do sistema após o login.
            </p>
          </div>

          <div className="order-1 lg:order-2 flex justify-center">
            <div className="relative">
              <div
                className="absolute inset-0 -m-8 rounded-full blur-3xl opacity-40"
                style={{ background: "radial-gradient(circle, #334155 0%, transparent 60%)" }}
              />
              <img
                src={mascotLogin.url}
                alt="Capiversa"
                className="relative h-56 sm:h-72 lg:h-80 w-auto drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="public-surface flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tente novamente ou volte para a home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Precisa de ajuda? Faça login e abra um chamado no chat de suporte dentro do sistema.
        </p>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
       { title: "Capiversa — WhatsApp com IA + CRM Kanban" },
      { name: "description", content: "Conecte o WhatsApp, deixe a IA atender e organize seus leads em um kanban arrastável." },
       { name: "author", content: "Capiversa" },
      { name: "google-site-verification", content: "hsdXT_bpeecFPBeT-jTzjGHxswmPzR4o7aR-JfLkIoU" },
       { name: "theme-color", content: "#334155" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
       { name: "apple-mobile-web-app-title", content: "Capiversa" },
       { name: "application-name", content: "Capiversa" },
       { property: "og:title", content: "Capiversa — WhatsApp com IA + CRM Kanban" },
      { property: "og:description", content: "Conecte o WhatsApp, deixe a IA atender e organize seus leads em um kanban arrastável." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
       { name: "twitter:title", content: "Capiversa — WhatsApp com IA + CRM Kanban" },
      { name: "twitter:description", content: "Conecte o WhatsApp, deixe a IA atender e organize seus leads em um kanban arrastável." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
         href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const NO_FLASH_THEME = `(()=>{try{document.documentElement.classList.remove('dark');localStorage.removeItem('theme');}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>

      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors />
    </QueryClientProvider>
  );
}
