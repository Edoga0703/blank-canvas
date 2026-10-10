import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached as resolveCompanyId } from "./company-cache";

type Canal = "instagram" | "messenger";

/** Lista os canais Meta (Instagram Direct / Messenger) da empresa. */
export const listMetaChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data } = await (supabase as any)
      .from("whatsapp_instances")
      .select("instance_name,display_name,status,provider,phone_number_id,updated_at")
      .eq("company_id", companyId)
      .like("provider", "meta%")
      .order("updated_at", { ascending: false });

    return {
      channels: (data ?? []).map((r: any) => ({
        instanceName: r.instance_name as string,
        displayName: (r.display_name as string) || null,
        canal: (r.provider === "meta_instagram" ? "instagram" : "messenger") as Canal,
        pageId: (r.phone_number_id as string) || null,
        status: (r.status as string) || "pending_token",
      })),
    };
  });

/** Conecta (ou atualiza) um canal Meta usando o Page Access Token. */
export const connectMetaChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { canal?: string; pageToken?: string; displayName?: string | null; pageId?: string | null }) => {
    const pageToken = String(d?.pageToken ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/^Bearer\s+/i, "")
      .replace(/^["']|["']$/g, "")
      .replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "");
    const canal = (d?.canal === "instagram" ? "instagram" : "messenger") as Canal;
    return {
      canal,
      pageToken,
      pageId: d?.pageId?.toString().trim() || null,
      displayName: d?.displayName?.toString().trim() || null,
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);

    if (data.pageToken.length < 20) {
      return { ok: false as const, error: "Token de acesso inválido ou incompleto." };
    }
    if (data.canal === "messenger" && /^(IGAA|IGQV|IGQW)/.test(data.pageToken)) {
      return { ok: false as const, error: "Este é um token do Instagram. Selecione Instagram Direct para conectá-lo." };
    }

    const { metaFetchPage } = await import("./meta.server");
    let page: Awaited<ReturnType<typeof metaFetchPage>>;
    try {
      page = await metaFetchPage(data.pageToken, data.pageId);
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível validar o token na Meta.",
      };
    }
    if (!page.id) throw new Error("Não foi possível validar o token na Meta.");

    const provider = data.canal === "instagram" ? "meta_instagram" : "meta_messenger";
    const channelId = data.canal === "instagram" ? (page.instagramId || (/^(IGAA|IGQV|IGQW)/.test(data.pageToken) ? page.id : null)) : page.id;
    if (!channelId) return { ok: false as const, error: "Este token não expõe uma conta Instagram profissional vinculada. Conecte pelo login oficial da Meta ou informe uma Página com Instagram vinculado." };
    const instanceName = `${provider}_${channelId}`;
    const displayName = data.displayName || (data.canal === "instagram" ? page.instagramName || "Instagram Direct" : page.name || "Messenger");

    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("id, webhook_token")
      .eq("company_id", companyId)
      .eq("instance_name", instanceName)
      .maybeSingle();

    const payload: any = {
      company_id: companyId,
      user_id: userId,
      instance_name: instanceName,
      display_name: displayName,
      provider,
      provider_type: "oficial_meta",
      phone_number_id: channelId,
      instance_token: page.token || data.pageToken,
      status: "connected",
      webhook_token: existing?.webhook_token || crypto.randomUUID(),
      last_state_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await (supabase as any)
        .from("whatsapp_instances")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (supabase as any).from("whatsapp_instances").insert(payload);
      if (error) throw new Error(error.message);
    }

    const { metaSubscribePage } = await import("./meta.server");
    const sub = await metaSubscribePage(page.token || data.pageToken, channelId, { instagram: data.canal === "instagram" });

    return {
      ok: true as const,
      instanceName,
      pageId: channelId,
      displayName,
      canal: data.canal,
      subscribed: sub.ok,
      subscribeError: sub.error,
    };
  });

/** Lista as Páginas do Facebook disponíveis em um token. */
export const listMetaPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pageToken?: string }) => ({
    pageToken: String(d?.pageToken ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/^Bearer\s+/i, "")
      .replace(/^["']|["']$/g, "")
      .replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, ""),
  }))
  .handler(async ({ data }) => {
    if (data.pageToken.length < 20) return { pages: [] as { id: string; name: string | null }[] };
    const { metaListPages } = await import("./meta.server");
    return { pages: await metaListPages(data.pageToken) };
  });

/** Remove um canal Meta. */
export const disconnectMetaChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string }) => {
    const instanceName = String(d?.instanceName ?? "").trim();
    if (!instanceName) throw new Error("Canal inválido.");
    return { instanceName };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await (supabase as any)
      .from("whatsapp_instances")
      .delete()
      .eq("company_id", companyId)
      .eq("instance_name", data.instanceName)
      .like("provider", "meta%");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Reprocessa nome/foto dos contatos Meta já existentes (backfill). */
export const backfillMetaProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { metaFetchProfile } = await import("./meta.server");

    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const { data: insts } = await (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("instance_token,provider")
      .eq("company_id", companyId)
      .like("provider", "meta%");
    const tokens = (insts ?? []).map((i: any) => i.instance_token).filter(Boolean);
    if (!tokens.length) return { updated: 0, total: 0 };

    const { data: cards } = await (supabase as any)
      .from("crm_cards")
      .select("numero,nome,foto_url")
      .eq("company_id", companyId)
      .limit(500);

    const isGeneric = (n: string) =>
      !n || n.startsWith("Instagram ") || n.startsWith("Messenger ") || n.startsWith("Contato ") || /^[0-9]+$/.test(n) || n.toLowerCase().includes("instagram") || n.toLowerCase().includes("messenger");

    let updated = 0;
    const alvos = (cards ?? []).filter((c: any) => isGeneric(c.nome ?? "") || !c.foto_url);
    for (const c of alvos) {
      for (const token of tokens) {
        const p = await metaFetchProfile(token, c.numero).catch(() => null);
        if (!p?.name && !p?.picture) continue;
        const patch: any = {};
        if (p.name && isGeneric(c.nome ?? "")) patch.nome = p.name;
        if (p.picture && !c.foto_url) patch.foto_url = p.picture;
        if (Object.keys(patch).length) {
          await (supabase as any)
            .from("crm_cards")
            .update(patch)
            .eq("company_id", companyId)
            .eq("numero", c.numero);
          if (patch.nome) {
            await (supabase as any)
              .from("mensagens")
              .update({ contato_nome: patch.nome })
              .eq("company_id", companyId)
              .eq("numero", c.numero);
          }
          updated++;
        }
        break;
      }
    }
    return { updated, total: alvos.length };
  });
