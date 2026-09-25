import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PluginBanner = {
  id: string;
  imagem_url: string;
  imagem_mobile_url: string | null;
  alt: string | null;
  link_url: string | null;
  plugin_id: string | null;
  ordem: number;
  ativo: boolean;
};

async function assertSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}

export const listPluginBanners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PluginBanner[]> => {
    const { data, error } = await context.supabase
      .from("plugin_banner")
      .select("*")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as PluginBanner[];
  });

export const listPluginBannersMaster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PluginBanner[]> => {
    await assertSuperAdmin(context.supabase);
    const { data, error } = await context.supabase
      .from("plugin_banner")
      .select("*")
      .order("ordem", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as PluginBanner[];
  });

export const savePluginBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<PluginBanner>) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    if (!data.imagem_url) throw new Error("Informe a URL da imagem do banner");
    const payload = {
      imagem_url: data.imagem_url,
      imagem_mobile_url: data.imagem_mobile_url || null,
      alt: data.alt || null,
      link_url: data.link_url || null,
      plugin_id: data.plugin_id || null,
      ordem: data.ordem ?? 0,
      ativo: data.ativo ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("plugin_banner").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("plugin_banner").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deletePluginBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { error } = await context.supabase.from("plugin_banner").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
