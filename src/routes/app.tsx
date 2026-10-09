import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordHeartbeatClient } from "@/lib/presence";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import type { CompanyRow, Membership } from "@/lib/tenant";
import { getAccessInfo } from "@/lib/tenant";

type Ctx = {
  user: { id: string; email?: string | null };
  company: CompanyRow | null;
  membership: Membership | null;
  isSuperAdmin: boolean;
  impersonating: boolean;
  readOnly?: boolean;
};

const APP_CONTEXT_CACHE_MS = 5 * 60_000;

let appContextCache: { userId: string; ctx: Ctx; expiresAt: number } | null = null;

function applyAppGuards(ctx: Ctx, pathname: string) {
  if (!ctx.company) {
    // Sem empresa: usuário novo. Não mostramos tela de checkout — o app.tsx
    // já provisiona a empresa automaticamente antes de chegar aqui.
    return ctx;
  }

  const acesso = getAccessInfo(ctx.company);
  // Carência: navega em todos os módulos, mas sem poder agir (RLS + servidor).
  ctx.readOnly = acesso.state === "carencia" && !ctx.isSuperAdmin;
  const needsPayment = acesso.state === "bloqueado";

  if (needsPayment && !ctx.isSuperAdmin && pathname !== "/app/checkout") {
    throw redirect({ to: "/app/checkout" });
  }

  if (
    !needsPayment &&
    !ctx.company.onboarding_completed &&
    pathname !== "/app/onboarding" &&
    pathname !== "/app/checkout"
  ) {
    throw redirect({ to: "/app/onboarding" });
  }

  return ctx;
}

function cacheAndGuard(ctx: Ctx, pathname: string) {
  appContextCache = { userId: ctx.user.id, ctx, expiresAt: Date.now() + APP_CONTEXT_CACHE_MS };
  return applyAppGuards(ctx, pathname);
}

export const Route = createFileRoute("/app")({
  ssr: false,
  staleTime: 5 * 60_000,
  shouldReload: false,
  beforeLoad: async ({ location, context }): Promise<Ctx> => {
    if (location.pathname === "/app" || location.pathname === "/app/") {
      throw redirect({ to: "/app/dashboard" });
    }



    const { enforceSessionPolicy } = await import("@/lib/session-persistence");
    if (await enforceSessionPolicy()) throw redirect({ to: "/entrar" });

    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData.session?.user;
    if (!sessionUser) throw redirect({ to: "/entrar" });


    if (
      appContextCache &&
      appContextCache.userId === sessionUser.id &&
      appContextCache.expiresAt > Date.now()
    ) {
      return applyAppGuards(appContextCache.ctx, location.pathname);
    }

    const [{ data: u, error }, { data: roles }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("user_roles").select("role").eq("user_id", sessionUser.id),
    ]);
    if (error || !u.user) throw redirect({ to: "/entrar" });

    const isSuperAdmin = (roles ?? []).some((r: any) => r.role === "super_admin");


    // Impersonação (super admin entrando como empresa via /master/empresas)
    let impersonateId: string | null = null;
    if (isSuperAdmin) {
      try { impersonateId = sessionStorage.getItem("master_impersonate_company"); } catch {}
    }

    if (impersonateId) {
      const { data: comp } = await supabase.from("company").select("*").eq("id", impersonateId).maybeSingle();
      if (comp) {
        try {
          const key = `impersonation_logged_${impersonateId}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            const { startImpersonation } = await import("@/lib/master-admin.functions");
            startImpersonation({ data: { companyId: impersonateId, motivo: null } }).catch(() => {});
          }
        } catch {}
        return cacheAndGuard({
          user: { id: u.user.id, email: u.user.email },
          company: comp as any as CompanyRow,
          membership: { company_id: comp.id, role: "owner", forcar_troca_senha: false },
          isSuperAdmin,
          impersonating: true,
        }, location.pathname);
      }
    }

    const { data: cu } = await supabase
      .from("company_user")
      .select("company_id, role, forcar_troca_senha, ativo, created_at, custom_role_id, company:company(*)")
      .eq("user_id", u.user.id)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!cu) {
      if (isSuperAdmin) {
        // Super admin sem vínculo: usa primeira empresa disponível como impersonação
        const { data: anyCompany } = await supabase
          .from("company")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (anyCompany) {
          return cacheAndGuard({
            user: { id: u.user.id, email: u.user.email },
            company: anyCompany as any as CompanyRow,
            membership: { company_id: (anyCompany as any).id, role: "owner", forcar_troca_senha: false },
            isSuperAdmin,
            impersonating: true,
          }, location.pathname);
        }
        throw redirect({ to: "/master/painel" });
      }

      // Cliente novo sem empresa: provisiona automaticamente com o plano padrão
      // (evita tela de checkout — libera acesso completo com trial imediato).
      try {
        const { createCheckoutCompany } = await import("@/lib/checkout.functions");
        const local = u.user.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
        const nome = local ? `Empresa de ${local}` : "Minha empresa";
        await createCheckoutCompany({ data: { nome } });
      } catch (e) {
        console.error("auto-provision company falhou", e);
      }

      const { data: cu2 } = await supabase
        .from("company_user")
        .select("company_id, role, forcar_troca_senha, ativo, created_at, custom_role_id, company:company(*)")
        .eq("user_id", u.user.id)
        .eq("ativo", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!cu2) {
        return cacheAndGuard({ user: { id: u.user.id, email: u.user.email }, company: null, membership: null, isSuperAdmin, impersonating: false }, location.pathname);
      }
      const company2 = (cu2.company as any) as CompanyRow;
      let customPermissions2: Record<string, Record<string, boolean>> | null = null;
      if (cu2.custom_role_id) {
        const { data: customRole } = await supabase
          .from("company_role")
          .select("permissions")
          .eq("id", cu2.custom_role_id)
          .eq("company_id", cu2.company_id)
          .eq("ativo", true)
          .maybeSingle();
        customPermissions2 = (customRole?.permissions as Record<string, Record<string, boolean>> | null) ?? null;
      }
      return cacheAndGuard({
        user: { id: u.user.id, email: u.user.email },
        company: company2,
        membership: {
          company_id: cu2.company_id,
          role: cu2.role as any,
          forcar_troca_senha: cu2.forcar_troca_senha,
          custom_role_id: cu2.custom_role_id,
          custom_permissions: customPermissions2,
        },
        isSuperAdmin,
        impersonating: false,
      }, location.pathname);
    }


    if (cu.forcar_troca_senha && location.pathname !== "/trocar-senha") {
      throw redirect({ to: "/trocar-senha" });
    }

    const company = (cu.company as any) as CompanyRow;

    let customPermissions: Record<string, Record<string, boolean>> | null = null;
    if (cu.custom_role_id) {
      const { data: customRole } = await supabase
        .from("company_role")
        .select("permissions")
        .eq("id", cu.custom_role_id)
        .eq("company_id", cu.company_id)
        .eq("ativo", true)
        .maybeSingle();
      customPermissions = (customRole?.permissions as Record<string, Record<string, boolean>> | null) ?? null;
    }
    return cacheAndGuard({
      user: { id: u.user.id, email: u.user.email },
      company,
      membership: {
        company_id: cu.company_id,
        role: cu.role as any,
        forcar_troca_senha: cu.forcar_troca_senha,
        custom_role_id: cu.custom_role_id,
        custom_permissions: customPermissions,
      },
      isSuperAdmin,
      impersonating: false,
    }, location.pathname);
  },
  component: AppLayout,
});

function AppLayout() {
  const ctx = Route.useRouteContext();
  const blocked = (ctx.company as any)?.admin_bloqueado === true;
  
  const heartbeatInterval = useRef<any>(null);

  useEffect(() => {
    const key = `login_logged_${ctx.user.id}`;
    if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      import("@/lib/team.functions").then(({ recordLogin }) => {
        recordLogin().catch(() => {});
      });
    }

    // Presence heartbeat
    const sendHeartbeat = () => {
      recordHeartbeatClient().catch(() => {});
    };

    sendHeartbeat();
    heartbeatInterval.current = setInterval(sendHeartbeat, 60 * 1000); // 1 min

    return () => {
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
    };
  }, [ctx.user.id]);
  if ((ctx.company?.status_cobranca === "suspenso" || blocked) && !ctx.impersonating) {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="max-w-md text-center space-y-3">
          <div className="text-3xl">⛔</div>
          <h1 className="text-2xl font-bold">Conta suspensa</h1>
          <p className="text-sm text-muted-foreground">
            {blocked
              ? `Sua conta foi bloqueada pela administração${(ctx.company as any)?.admin_bloqueado_motivo ? `: ${(ctx.company as any).admin_bloqueado_motivo}` : ""}. Entre em contato com o suporte.`
              : `Sua conta foi suspensa por inadimplência. Regularize o pagamento para voltar a usar o ${ctx.company?.nome}.`}
          </p>
          <Button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/entrar"; }} variant="outline">
            Sair
          </Button>
        </div>
      </div>
    );
  }
  return (
    <>
      {ctx.impersonating && (
        <div className="bg-destructive text-destructive-foreground text-sm px-4 py-2 flex items-center justify-between">
          <span>🛡️ Você está visualizando como <b>{ctx.company?.nome}</b> (impersonação).</span>
          <Button size="sm" variant="outline" className="h-7 bg-transparent border-white/30 text-white hover:bg-white/10"
            onClick={() => { sessionStorage.removeItem("master_impersonate_company"); window.location.href = "/master/clientes"; }}>
            Sair da impersonação
          </Button>
        </div>
      )}
      <AppShell company={ctx.company} membership={ctx.membership} email={ctx.user.email} userId={ctx.user.id} isSuperAdmin={ctx.isSuperAdmin}>
        <Outlet />
      </AppShell>
    </>
  );
}
