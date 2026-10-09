import { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import academyLogo from "@/assets/capi-conversa-logo-horizontal-black.png.asset.json";
import { ChevronLeft, GraduationCap, PlayCircle, Library, Award, Search, User, MessageSquare, Users, LogOut, Home, Monitor, Globe, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import sidebarPromoAsset from "@/assets/sidebar-promo.png.asset.json";

export function TrainingLayout({ children }: { children: ReactNode }) {
  const loc = useLocation();

  const navItems = [
    { icon: Home, label: "Inicio", to: "/app/treinamentos" },
    { icon: MessageSquare, label: "Suporte", to: "https://metrixcrm.com.br/suporte", external: true },
    { icon: Users, label: "Comunidade", to: "https://comunidade.metrixcrm.com.br", external: true },
    { icon: Heart, label: "Favoritos", to: "/app/treinamentos?filter=favorites" },
  ];

  return (
    <div className="public-surface min-h-screen bg-[#F2F4F6] text-[#12263A] flex flex-col font-sans selection:bg-primary/30">
      {/* Sidebar Netflix Style */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[240px] bg-white flex-col py-8 z-[70] border-r border-[#E7EAEE] px-4">
        <div className="mb-12 px-2">
          <img src={academyLogo.url} alt="Capi Conversa Academy" className="h-12 w-auto rounded-md bg-white p-1 object-contain" />
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map((item, idx) => {
            const isExternal = 'external' in item && item.external;
            const content = (
              <>
                <item.icon className="size-5" />
                <span className="text-sm font-medium tracking-tight">{item.label}</span>
              </>
            );

            if (isExternal) {
              return (
                <a 
                  key={idx}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 text-[#7B8794] hover:text-[#12263A] hover:bg-[#F2F4F6]"
                >
                  {content}
                </a>
              );
            }

            return (
              <Link 
                key={idx} 
                to={item.to} 
                className={cn(
                  "group flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300",
                  loc.pathname === item.to && idx === 0 ? "bg-primary text-primary-foreground" : "text-[#7B8794] hover:text-[#12263A] hover:bg-[#F2F4F6]"
                )}
              >
                {content}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Promo Card */}
        <div className="mt-auto mb-6 px-2">
          <div className="relative group cursor-pointer overflow-hidden rounded-2xl aspect-[4/5] shadow-2xl transition-transform hover:scale-[1.02]">
            <img 
              src={sidebarPromoAsset.url} 
              alt="Promoção" 
              className="w-full h-full object-cover" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
          </div>
        </div>

        <div className="pt-6 border-t border-[#E7EAEE]">
          <Link to="/app/dashboard">
            <Button variant="ghost" className="w-full justify-start gap-4 text-[#7B8794] hover:text-[#12263A] hover:bg-[#F2F4F6] px-4 h-12 rounded-xl transition-all">
              <LogOut className="size-5" />
              <span className="text-sm font-medium">Retornar</span>
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Experience Container */}
      <main className="lg:pl-[240px] flex-1 flex flex-col relative">
        {children}
      </main>

      {/* Mobile Navigation (Bottom) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-2xl border-t border-[#E7EAEE] z-[80] flex items-center justify-around px-2">
        {navItems.map((item, idx) => {
          const isExternal = 'external' in item && item.external;
          const content = (
            <>
              <item.icon className="size-5" />
              <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
            </>
          );

          if (isExternal) {
            return (
              <a 
                key={idx}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-1 min-w-[64px] text-[#7B8794]"
              >
                {content}
              </a>
            );
          }

          return (
            <Link 
              key={idx} 
              to={item.to} 
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-w-[64px]",
                loc.pathname === item.to && idx === 0 ? "text-primary" : "text-[#7B8794]"
              )}
            >
              {content}
            </Link>
          );
        })}
        <Link to="/app/dashboard" className="flex flex-col items-center justify-center gap-1 min-w-[64px] text-[#7B8794]">
           <ChevronLeft className="size-5" />
           <span className="text-[10px] font-medium tracking-tight">Voltar</span>
        </Link>
      </nav>
    </div>
  );
}
