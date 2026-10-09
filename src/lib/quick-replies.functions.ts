import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QuickReplyTipo = "texto" | "imagem" | "video" | "audio" | "documento";

export type QuickReply = {
  id: string;
  atalho: string;
  titulo: string | null;
  categoria: string;
  tipo: QuickReplyTipo;
  texto: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_nome: string | null;
  ordem: number;
  favorito: boolean;
  updated_at: string;
};

async function currentCompanyId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data?.company_id) return data.company_id as string;
  const { data: isSuper } = await supabase.rpc("is_super_admin");
  if (isSuper) {
    const { data: firstCo } = await supabase
      .from("company").select("id")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (firstCo?.id) return firstCo.id as string;
  }
  throw new Error("Sem empresa ativa");
}

export const listQuickReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { getUserScope } = await import("./user-scope");
    const scope = await getUserScope(context.supabase, context.userId, cid);
    let q = context.supabase
      .from("quick_reply")
      .select("id, atalho, titulo, categoria, tipo, texto, media_url, media_mime, media_nome, ordem, favorito, updated_at")
      .eq("company_id", cid);
    // Empresas com funções individuais: atendente só vê as respostas que criou.
    if (scope.onlyMine) q = q.eq("user_id", context.userId);
    const { data, error } = await q
      .order("categoria", { ascending: true })
      .order("ordem", { ascending: true })
      .order("atalho", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as QuickReply[];
  });

export const saveQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    atalho: string;
    titulo?: string | null;
    categoria?: string | null;
    tipo: QuickReplyTipo;
    texto?: string | null;
    media_url?: string | null;
    media_mime?: string | null;
    media_nome?: string | null;
    favorito?: boolean;
  }) => {
    const atalho = (d?.atalho || "").trim().replace(/^\/+/, "").slice(0, 40).toLowerCase();
    if (!/^[a-z0-9_-]{2,40}$/i.test(atalho)) {
      throw new Error("Atalho: 2-40 caracteres, só letras, números, _ ou -");
    }
    const tipo = d.tipo;
    if (!["texto", "imagem", "video", "audio", "documento"].includes(tipo)) {
      throw new Error("Tipo inválido");
    }
    const texto = (d.texto || "").slice(0, 4000) || null;
    if (tipo === "texto" && !texto) throw new Error("Texto obrigatório");
    if (tipo !== "texto" && !d.media_url) throw new Error("Mídia obrigatória");
    return {
      id: d.id,
      atalho,
      titulo: (d.titulo || "").trim().slice(0, 120) || null,
      categoria: (d.categoria || "Geral").trim().slice(0, 60) || "Geral",
      tipo,
      texto,
      media_url: d.media_url || null,
      media_mime: d.media_mime || null,
      media_nome: d.media_nome || null,
      favorito: !!d.favorito,
    };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    if (data.favorito) {
      const { count, error: countError } = await context.supabase
        .from("quick_reply")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
        .eq("favorito", true)
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) >= 5) throw new Error("Você pode favoritar no máximo 5 mensagens rápidas");
    }
    if (data.id) {
      const { error } = await context.supabase
        .from("quick_reply")
        .update({
          atalho: data.atalho, titulo: data.titulo, categoria: data.categoria,
          tipo: data.tipo, texto: data.texto,
          media_url: data.media_url, media_mime: data.media_mime, media_nome: data.media_nome,
          favorito: data.favorito,
        })
        .eq("id", data.id).eq("company_id", cid);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await context.supabase.from("quick_reply").insert({
      company_id: cid, user_id: context.userId,
      atalho: data.atalho, titulo: data.titulo, categoria: data.categoria,
      tipo: data.tipo, texto: data.texto,
      media_url: data.media_url, media_mime: data.media_mime, media_nome: data.media_nome,
      favorito: data.favorito,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id obrigatório");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("quick_reply").delete()
      .eq("id", data.id).eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleQuickReplyFavorito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; favorito: boolean }) => {
    if (!d?.id) throw new Error("id obrigatório");
    return { id: d.id, favorito: !!d.favorito };
  })
  .handler(async ({ data, context }) => {
    const cid = await currentCompanyId(context.supabase, context.userId);
    if (data.favorito) {
      const { count, error: countError } = await context.supabase
        .from("quick_reply")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
        .eq("favorito", true)
        .neq("id", data.id);
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) >= 5) throw new Error("Você pode favoritar no máximo 5 mensagens rápidas");
    }
    const { error } = await context.supabase
      .from("quick_reply")
      .update({ favorito: data.favorito })
      .eq("id", data.id).eq("company_id", cid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
