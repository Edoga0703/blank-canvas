import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const annSchema = z.object({
  title: z.string(),
  content: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  button_text: z.string().optional().nullable(),
  button_link: z.string().optional().nullable(),
  size: z.enum(['sm', 'md', 'lg', 'full']).default('md'),
  expires_at: z.string().optional().nullable(),
  display_time_seconds: z.number().optional().default(10),
  show_frequency: z.enum(['once', 'always', 'daily']).default('once'),
});

async function assertSuper(ctx: any) {
  const { data: isSuper } = await ctx.supabase.rpc("is_super_admin");
  if (!isSuper) throw new Error("Acesso restrito ao super admin");
}

/** Avisos visíveis para o cliente (ativos e dentro do prazo). Público. */
export const getActiveAnnouncements = createServerFn({ method: "GET" })
  .handler(async () => {
    const nowIso = new Date().toISOString();
    const { data, error } = await (supabase as any)
      .from("announcements")
      .select("*")
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as any[];
  });

/** Todos os avisos (inclui inativos/expirados) — apenas super admin. */
export const listAllAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context);
    const { data, error } = await context.supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => annSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertSuper(context);
    const { data: rows, error } = await context.supabase
      .from("announcements")
      .insert([data])
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Não foi possível criar o aviso.");
    return { success: true, id: (rows[0] as any).id };
  });

export const updateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => annSchema.extend({
    id: z.string(),
    is_active: z.boolean().optional().default(true),
  }).parse(data))
  .handler(async ({ context, data }) => {
    await assertSuper(context);
    const { id, ...updates } = data;
    const { data: rows, error } = await context.supabase
      .from("announcements")
      .update(updates)
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Nenhum aviso foi alterado (permissão ou aviso inexistente).");
    return { success: true };
  });

export const setAnnouncementActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string(), is_active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertSuper(context);
    const { data: rows, error } = await context.supabase
      .from("announcements")
      .update({ is_active: data.is_active })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Nenhum aviso foi alterado.");
    return { success: true };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertSuper(context);
    const { data: rows, error } = await context.supabase
      .from("announcements")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("O aviso não foi removido (permissão ou já removido).");
    return { success: true };
  });
