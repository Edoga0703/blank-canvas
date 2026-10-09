import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

/**
 * Salva uma conexão WhatsApp API Oficial via WaBlast.
 * Requer: API key (wak_...) e account_id da WaBlast (identifica a conexão dentro da conta).
 * Opcionais: display_name, phone_number, phone_number_id (informativos).
 */
export const saveWablastConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    displayName: string;
    apiKey: string;
    accountId: string;
    phoneNumber?: string;
    phoneNumberId?: string;
  }) => {
    const displayName = String(d?.displayName || "").trim();
    const apiKey = String(d?.apiKey || "").trim();
    const accountId = String(d?.accountId || "").trim();
    if (displayName.length < 2) throw new Error("Nome inválido");
    if (!apiKey.startsWith("wak_") || apiKey.length < 20) {
      throw new Error("API key inválida (deve começar com 'wak_').");
    }
    if (!accountId) throw new Error("Account ID obrigatório");
    return {
      displayName: displayName.slice(0, 60),
      apiKey,
      accountId,
      phoneNumber: (d?.phoneNumber || "").replace(/\D/g, "") || null,
      phoneNumberId: (d?.phoneNumberId || "").trim() || null,
    };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);

    const { assertWithinLimit } = await import("./plan-limits.server");
    await assertWithinLimit(companyId, "instancias");

    const instanceName = `wablast_${companyId.replace(/-/g, "").slice(0, 12)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const webhookToken = crypto.randomUUID();

    const { error } = await (context.supabase as any)
      .from("whatsapp_instances")
      .insert({
        company_id: companyId,
        user_id: context.userId,
        instance_name: instanceName,
        display_name: data.displayName,
        status: "connected",
        webhook_token: webhookToken,
        provider: "wablast",
        provider_type: "wablast",
        instance_token: data.apiKey,   // guarda a wak_ por instância
        waba_id: data.accountId,       // account_id da WaBlast
        phone_number_id: data.phoneNumberId,
        numero: data.phoneNumber,
        last_state_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);

    return { instanceName, ok: true };
  });

// ---------- Partner Onboarding (revenda) ----------
// A chave é MINHA e fica só no servidor. O front recebe apenas embed_url
// e redireciona o cliente para lá. A confirmação vem por webhook.

function friendlyOnboardingError(code: string | null, msg: string): string {
  switch (code) {
    case "NO_FREE_SLOT":
      return "Não há vagas disponíveis no momento. Nossa equipe já foi avisada.";
    case "REDIRECT_URI_NOT_ALLOWED":
      return "Domínio de retorno não liberado. Contate o suporte.";
    case "SESSION_UNUSABLE":
      return "Sessão expirada ou já utilizada. Vamos gerar uma nova.";
    case "UNAUTHENTICATED":
      return "Falha de autenticação com o provedor. Contate o suporte.";
    default:
      return msg || "Falha ao iniciar conexão oficial.";
  }
}

export const startWablastOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { redirectUri: string }) => {
    const u = String(d?.redirectUri || "").trim();
    if (!/^https?:\/\//.test(u)) throw new Error("redirect_uri inválido");
    return { redirectUri: u };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);

    const { assertWithinLimit } = await import("./plan-limits.server");
    await assertWithinLimit(companyId, "instancias");

    const { wablastCreateOnboardingSession } = await import("./wablast.server");
    try {
      const sess = await wablastCreateOnboardingSession({
        externalRef: companyId,
        redirectUri: data.redirectUri,
      });
      // Log de sessão para suporte
      console.info("[wablast.onboarding] sessão criada", {
        session_id: sess.id,
        external_ref: companyId,
        expires_at: sess.expires_at,
      });
      return {
        id: sess.id,
        embed_url: sess.embed_url,
        expires_at: sess.expires_at,
      };
    } catch (e: any) {
      throw new Error(friendlyOnboardingError(e?.code ?? null, e?.message));
    }
  });

export const checkWablastOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    const id = String(d?.id || "").trim();
    if (!id) throw new Error("id obrigatório");
    return { id };
  })
  .handler(async ({ data }) => {
    const { wablastGetOnboardingSession } = await import("./wablast.server");
    try {
      const s = await wablastGetOnboardingSession(data.id);
      return s;
    } catch (e: any) {
      throw new Error(friendlyOnboardingError(e?.code ?? null, e?.message));
    }
  });

// Admin-only: registra o domínio de retorno na WaBlast (uma vez por domínio).
export const registerWablastDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domain: string }) => {
    const domain = String(d?.domain || "").trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Domínio inválido");
    return { domain };
  })
  .handler(async ({ context, data }) => {
    const { data: role } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    if (!role || (role.role !== "super_admin" && role.role !== "master")) {
      throw new Error("Somente admin master pode registrar domínios.");
    }
    const { wablastRegisterDomain } = await import("./wablast.server");
    return wablastRegisterDomain(data.domain);
  });
