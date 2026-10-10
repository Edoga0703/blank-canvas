import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";

export type PublishChannel = {
  id: string;
  instanceName: string;
  name: string;
  provider: "meta_instagram" | "meta_messenger";
  externalId: string;
  hasToken: boolean;
};

/** Lista os canais Meta conectados na empresa disponíveis para publicação. */
export const getConnectedPublishChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ channels: PublishChannel[] }> => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, provider, phone_number_id, instance_token, status")
      .eq("company_id", companyId)
      .in("provider", ["meta_instagram", "meta_messenger"])
      .eq("status", "connected");

    if (error) {
      console.error("[getConnectedPublishChannels] Erro ao buscar instâncias:", error.message);
      return { channels: [] };
    }

    const channels: PublishChannel[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      instanceName: r.instance_name,
      name: r.display_name || (r.provider === "meta_instagram" ? "Instagram Direct" : "Facebook Messenger"),
      provider: r.provider,
      externalId: r.phone_number_id,
      hasToken: Boolean(r.instance_token),
    }));

    return { channels };
  });

/** Publica um post (foto ou vídeo) no canal selecionado. */
export const publishPostToMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      channelId: string;
      mediaUrl: string;
      caption?: string;
      mediaType?: "image" | "video";
    }) => ({
      channelId: String(input.channelId),
      mediaUrl: String(input.mediaUrl).trim(),
      caption: input.caption?.trim() || "",
      mediaType: input.mediaType || "image",
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inst } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("instance_name, display_name, provider, phone_number_id, instance_token")
      .eq("id", data.channelId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!inst || !inst.instance_token) {
      throw new Error("Canal não encontrado ou sem token de acesso ativo.");
    }

    const {
      metaPublishInstagramPhoto,
      metaPublishInstagramVideo,
      metaPublishFacebookPost,
    } = await import("./meta-publish.server");

    let result: any = null;

    if (inst.provider === "meta_instagram") {
      if (data.mediaType === "video") {
        result = await metaPublishInstagramVideo(
          inst.instance_token,
          inst.phone_number_id,
          data.mediaUrl,
          data.caption,
        );
      } else {
        result = await metaPublishInstagramPhoto(
          inst.instance_token,
          inst.phone_number_id,
          data.mediaUrl,
          data.caption,
        );
      }
    } else {
      // Facebook Page
      result = await metaPublishFacebookPost(
        inst.instance_token,
        inst.phone_number_id,
        data.caption,
        data.mediaUrl,
      );
    }

    return { ok: true, result };
  });

/** Obtém as publicações do feed para visualização no painel. */
export const getChannelFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channelId: string; limit?: number }) => ({
    channelId: String(input.channelId),
    limit: Number(input.limit || 24),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inst } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("provider, phone_number_id, instance_token")
      .eq("id", data.channelId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!inst || !inst.instance_token) {
      return { posts: [] };
    }

    const { metaFetchInstagramFeed, metaFetchFacebookFeed } = await import("./meta-publish.server");

    if (inst.provider === "meta_instagram") {
      const posts = await metaFetchInstagramFeed(inst.instance_token, inst.phone_number_id, data.limit);
      return { posts };
    } else {
      const posts = await metaFetchFacebookFeed(inst.instance_token, inst.phone_number_id, data.limit);
      return { posts };
    }
  });

/** Faz upload direto para o bucket público do Supabase, sem depender de R2. */
export const uploadPublicMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; mimeType: string; base64Data: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleanName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `uploads/${Date.now()}_${cleanName}`;
    const buffer = Buffer.from(data.base64Data, "base64");

    const { error } = await supabaseAdmin.storage
      .from("public-media")
      .upload(path, buffer, {
        contentType: data.mimeType || "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.error("[uploadPublicMedia] Erro upload:", error.message);
      throw new Error("Falha ao salvar arquivo no servidor: " + error.message);
    }

    const { data: pub } = supabaseAdmin.storage
      .from("public-media")
      .getPublicUrl(path);

    return { publicUrl: pub.publicUrl };
  });

