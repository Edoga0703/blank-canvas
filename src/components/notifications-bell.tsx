import { useEffect, useRef, useState } from "react";
import {
  Bell, UserPlus, PlugZap, Megaphone, LifeBuoy, CalendarClock, CheckCheck,
  MessageCircle, AtSign, Heart,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

type Tipo =
  | "lead_novo" | "conexao_caiu" | "campanha_finalizada"
  | "chamado_respondido" | "agendamento_proximo"
  | "comentario_meta" | "mencion_meta" | "reacao_meta";

type Notif = {
  id: string;
  tipo: Tipo;
  titulo: string;
  descricao: string | null;
  link: string | null;
  lida_em: string | null;
  created_at: string;
};

const META: Record<Tipo, { icon: typeof Bell; label: string; tone: string }> = {
  lead_novo: { icon: UserPlus, label: "Lead novo", tone: "text-[color:var(--brand)] bg-[color:var(--brand)]/10" },
  conexao_caiu: { icon: PlugZap, label: "Conexão", tone: "text-destructive bg-destructive/10" },
  campanha_finalizada: { icon: Megaphone, label: "Campanha", tone: "text-emerald-600 bg-emerald-600/10" },
  chamado_respondido: { icon: LifeBuoy, label: "Suporte", tone: "text-amber-600 bg-amber-600/10" },
  agendamento_proximo: { icon: CalendarClock, label: "Agendamento", tone: "text-violet-600 bg-violet-600/10" },
  comentario_meta: { icon: MessageCircle, label: "Comentário", tone: "text-blue-600 bg-blue-600/10" },
  mencion_meta: { icon: AtSign, label: "Menção", tone: "text-fuchsia-600 bg-fuchsia-600/10" },
  reacao_meta: { icon: Heart, label: "Reação", tone: "text-rose-600 bg-rose-600/10" },
};

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationsBell({
  companyId,
  variant = "icon",
}: { companyId?: string | null; variant?: "icon" | "menu" }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const instanceRef = useRef<string>(Math.random().toString(36).slice(2));
  const isMobile = useIsMobile();

  async function load() {
    if (!companyId) { setItems([]); return; }
    const { data } = await supabase
      .from("notificacao")
      .select("id,tipo,titulo,descricao,link,lida_em,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Notif[]);
  }

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const safeLoad = () => { if (active) void load(); };

    safeLoad();
    const t = window.setInterval(safeLoad, 30000);

    if (companyId) {
      try {
        channel = supabase
          .channel(`notif-${companyId}-${instanceRef.current}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notificacao", filter: `company_id=eq.${companyId}` },
            safeLoad,
          )
          .subscribe();
      } catch (error) {
        console.warn("Realtime notifications unavailable; polling remains active.", error);
      }
    }

    return () => {
      active = false;
      window.clearInterval(t);
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const unread = items.filter((n) => !n.lida_em).length;

  async function markRead(id: string) {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, lida_em: new Date().toISOString() } : n)));
    await supabase.from("notificacao").update({ lida_em: new Date().toISOString() }).eq("id", id);
  }

  async function markAll() {
    const ids = items.filter((n) => !n.lida_em).map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((p) => p.map((n) => (n.lida_em ? n : { ...n, lida_em: now })));
    await supabase.from("notificacao").update({ lida_em: now }).in("id", ids);
  }

  function openNotif(n: Notif) {
    void markRead(n.id);
    setOpen(false);
    if (!n.link) return;
    const [path, qs] = n.link.split("?");
    const search = qs
      ? Object.fromEntries(new URLSearchParams(qs).entries())
      : undefined;
    void navigate({ to: path, search: search as never });
  }

  const trigger =
    variant === "menu" ? (
          <button className="w-full flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent">
            <span className="flex items-center"><Bell className="size-4 mr-2" />Notificações</span>
            {unread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-destructive text-white text-[10px] font-bold grid place-items-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        ) : (
          <button
            title="Notificações"
            className="relative size-9 grid place-items-center rounded-full bg-[#f1f2f4] border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-foreground hover:bg-[#292cff] hover:text-white transition-colors"
          >
            <Bell className="size-[16px]" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 grid place-items-center rounded-full bg-destructive text-white text-[10px] font-bold leading-none">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
    );

  const list =
    items.length === 0 ? (
      <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">
        Nenhuma notificação por aqui
      </div>
    ) : (
      <div className={isMobile ? "overflow-y-auto overscroll-contain" : "max-h-[min(60vh,320px)] overflow-y-auto overscroll-contain"}>
        {items.map((n) => {
          const meta = META[n.tipo] ?? META.lead_novo;
          const Icon = meta.icon;
          return (
            <button
              key={n.id}
              onClick={() => openNotif(n)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2.5 hover:bg-accent/50 border-b border-[color:var(--hairline)] last:border-0 ${n.lida_em ? "opacity-60" : ""}`}
            >
              <span className={`size-6 rounded-full grid place-items-center shrink-0 ${meta.tone}`}>
                <Icon className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[12.5px] font-semibold truncate">{n.titulo}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                </span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {n.descricao || meta.label}
                </span>
              </span>
              {!n.lida_em && <span className="size-1.5 rounded-full bg-[color:var(--brand)] shrink-0" />}
            </button>
          );
        })}
      </div>
    );

  const header = (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="text-[13px] font-semibold">Notificações</span>
      {unread > 0 && (
        <button
          onClick={(e) => { e.preventDefault(); void markAll(); }}
          className="text-[11px] font-medium text-[color:var(--brand)] hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <CheckCheck className="size-3" /> Marcar todas
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="p-0 rounded-t-2xl max-h-[75vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Notificações</SheetTitle>
          </SheetHeader>
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
          {header}
          <div className="border-t border-[color:var(--hairline)] flex-1 min-h-0 overflow-y-auto">{list}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        avoidCollisions
        className="w-[min(20rem,calc(100vw-2rem))] p-0 overflow-hidden"
      >
        <DropdownMenuLabel className="p-0">{header}</DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        {list}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
