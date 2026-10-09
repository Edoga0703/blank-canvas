import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached as resolveCompanyId } from "./company-cache";

/** Passo 2 — gera a URL do login da Meta (popup). */
export const startMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin?: string }) => ({ origin: String(d?.origin ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { sanitizeOrigin, signState, buildAuthUrl } = await import("./meta-oauth.server");

    const origin = sanitizeOrigin(data.origin);
    if (!origin) return { ok: false as const, error: "Origem inválida." };

    const nonce = crypto.randomUUID();
    const state = await signState({ c: companyId, u: userId, n: nonce, o: origin, t: Date.now() });
    return { ok: true as const, authUrl: buildAuthUrl(origin, state) };
  });

/** Passo 4 — lista as Páginas/contas IG descobertas na sessão OAuth. */
export const listMetaOAuthTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { session?: string }) => {
    const session = String(d?.session ?? "").trim();
    if (!session) throw new Error("Sessão inválida.");
    return { session };
  })
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { discoverTargets } = await import("./meta-oauth.server");

    const { data: row } = await (supabaseAdmin as any)
      .from("meta_oauth_session")
      .select("user_token,user_id,expires_at,consumed")
      .eq("handle", data.session)
      .maybeSingle();

    if (!row || row.user_id !== userId || row.consumed || new Date(row.expires_at) < new Date()) {
      return { ok: false as const, error: "Sessão expirada. Conecte novamente." };
    }

    try {
      const targets = await discoverTargets(row.user_token);
      return {
        ok: true as const,
        targets: targets.map((t) => ({
          pageId: t.pageId,
          pageName: t.pageName,
          pagePicture: t.pagePicture,
          igId: t.igId,
          igUsername: t.igUsername,
          igPicture: t.igPicture,
        })),
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao listar Páginas." };
    }
  });

/** Passo 4 — conecta os canais escolhidos (assina webhooks automaticamente). */
export const connectMetaOAuthTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { session?: string; pageIds?: string[]; withInstagram?: boolean }) => {
    const session = String(d?.session ?? "").trim();
    if (!session) throw new Error("Sessão inválida.");
    return {
      session,
      pageIds: Array.isArray(d?.pageIds) ? d!.pageIds!.map(String).slice(0, 20) : [],
      withInstagram: d?.withInstagram !== false,
    };
  })
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { discoverTargets } = await import("./meta-oauth.server");
    const { metaSubscribePage } = await import("./meta.server");

    const { data: row } = await (supabaseAdmin as any)
      .from("meta_oauth_session")
      .select("id,user_token,user_id,company_id,expires_at,consumed")
      .eq("handle", data.session)
      .maybeSingle();

    if (!row || row.user_id !== userId || row.consumed || new Date(row.expires_at) < new Date()) {
      return { ok: false as const, error: "Sessão expirada. Conecte novamente." };
    }

    const companyId = row.company_id as string;
    const all = await discoverTargets(row.user_token);
    const chosen = data.pageIds.length ? all.filter((t) => data.pageIds.includes(t.pageId)) : all;
    if (!chosen.length) return { ok: false as const, error: "Nenhuma Página selecionada." };

    const connected: { canal: string; name: string }[] = [];
    const skipped: string[] = [];

    // Plano padrão: 1 conta de Facebook e 1 de Instagram por empresa.
    const { getCompanyPlan } = await import("./plan-limits.server");
    const plan = await getCompanyPlan(companyId);
    const metaCap = Math.max(1, Number(plan.limites.instancias ?? 1));

    const { data: metaRows } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("provider, instance_name")
      .eq("company_id", companyId)
      .in("provider", ["meta_messenger", "meta_instagram"]);
    const existentes: Record<string, Set<string>> = {
      meta_messenger: new Set(),
      meta_instagram: new Set(),
    };
    for (const r of metaRows ?? []) {
      existentes[r.provider as string]?.add(r.instance_name as string);
    }

    for (const target of chosen) {
      const rows: { provider: string; externalId: string; name: string }[] = [
        { provider: "meta_messenger", externalId: target.pageId, name: target.pageName || "Messenger" },
      ];
      if (data.withInstagram && target.igId) {
        rows.push({
          provider: "meta_instagram",
          externalId: target.igId,
          name: target.igUsername ? `@${target.igUsername}` : "Instagram Direct",
        });
      }

      for (const item of rows) {
        const instanceName = `${item.provider}_${item.externalId}`;
        const jaTem = existentes[item.provider] ?? new Set<string>();
        if (!jaTem.has(instanceName) && jaTem.size >= metaCap) {
          skipped.push(item.name);
          continue;
        }
        const { data: existing } = await (supabaseAdmin as any)
          .from("whatsapp_instances")
          .select("id, webhook_token")
          .eq("company_id", companyId)
          .eq("instance_name", instanceName)
          .maybeSingle();



        const payload = {
          company_id: companyId,
          user_id: userId,
          instance_name: instanceName,
          display_name: item.name,
          provider: item.provider,
          provider_type: "oficial_meta",
          phone_number_id: item.externalId,
          instance_token: target.pageToken,
          status: "connected",
          webhook_token: existing?.webhook_token || crypto.randomUUID(),
          last_state_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (existing?.id) {
          await (supabaseAdmin as any).from("whatsapp_instances").update(payload).eq("id", existing.id);
        } else {
          await (supabaseAdmin as any).from("whatsapp_instances").insert(payload);
        }
        connected.push({ canal: item.provider, name: item.name });
        existentes[item.provider]?.add(instanceName);
      }

      // Assina o app nos eventos de mensagem da Página (cobre Messenger + IG vinculado).
      await metaSubscribePage(target.pageToken, target.pageId);
    }

    // El token de usuario solo sirve para completar esta seleccion. La cuenta
    // conectada conserva el Page token correspondiente; eliminamos la sesion
    // temporal para reducir la exposicion de credenciales.
    await (supabaseAdmin as any)
      .from("meta_oauth_session")
      .delete()
      .eq("id", row.id);

    if (!connected.length && skipped.length) {
      return {
        ok: false as const,
        error: `Seu plano permite ${metaCap} conta${metaCap === 1 ? "" : "s"} por canal (Facebook e Instagram). Remova a conexão atual ou faça upgrade.`,
      };
    }

    return { ok: true as const, connected, skipped };
  });

/** Passo 5 — revalida os tokens dos canais Meta da empresa. */
export const checkMetaChannelsHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isTokenValid } = await import("./meta-oauth.server");

    const { data: rows } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id,instance_name,instance_token,status")
      .eq("company_id", companyId)
      .like("provider", "meta%");

    let expired = 0;
    for (const r of rows ?? []) {
      const ok = r.instance_token ? await isTokenValid(r.instance_token) : false;
      if (!ok) expired += 1;
      await (supabaseAdmin as any)
        .from("whatsapp_instances")
        .update({ status: ok ? "connected" : "expired", last_state_at: new Date().toISOString() })
        .eq("id", r.id);
    }
    return { ok: true as const, checked: (rows ?? []).length, expired };
  });
