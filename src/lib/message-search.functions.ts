import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "./whatsapp-helpers";

export interface MessageSearchResult {
  id: string;
  numero: string;
  contato_nome: string | null;
  lead_nome: string | null;
  lead_foto_url: string | null;
  texto: string;
  created_at: string;
  direcao: "entrada" | "saida";
  autor: string;
  midia_tipo: string | null;
}

export const searchMessagesGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query: string; limit?: number }) => ({
    query: (d?.query || "").trim(),
    limit: Math.min(Math.max(d?.limit ?? 40, 5), 100),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { query, limit } = data;

    if (!query || query.length < 2) {
      return { results: [] };
    }

    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verificar se a empresa está em modo operacional e o usuário é atendente restrito
    const [{ data: company }, { data: membership }] = await Promise.all([
      supabaseAdmin
        .from("company")
        .select("atendimento_operacional")
        .eq("id", companyId)
        .maybeSingle(),
      supabaseAdmin
        .from("company_user")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const isAtendente = membership?.role === "atendente";
    const isOperational = company?.atendimento_operacional === true;

    let allowedNumbers: string[] | null = null;
    if (isAtendente && isOperational) {
      // Busca quais leads pertencem a esse atendente
      const { data: userCards } = await supabaseAdmin
        .from("crm_cards")
        .select("numero")
        .eq("company_id", companyId)
        .eq("owner_id", userId);
      allowedNumbers = (userCards || []).map((c: any) => c.numero).filter(Boolean);
      if (allowedNumbers.length === 0) {
        return { results: [] };
      }
    }

    let msgQuery = supabaseAdmin
      .from("mensagens")
      .select("id,numero,contato_nome,texto,created_at,direcao,autor,midia_tipo")
      .eq("company_id", companyId)
      .ilike("texto", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (allowedNumbers && allowedNumbers.length > 0) {
      msgQuery = msgQuery.in("numero", allowedNumbers);
    }

    const { data: rows, error } = await msgQuery;
    if (error || !rows) {
      return { results: [] };
    }

    // Obter dados de contato / lead para enriquecer os resultados com avatar e nome
    const uniqueNumeros = Array.from(new Set(rows.map((r: any) => r.numero)));
    const { data: cards } = await supabaseAdmin
      .from("crm_cards")
      .select("numero,nome,foto_url")
      .eq("company_id", companyId)
      .in("numero", uniqueNumeros);

    const cardMap = new Map<string, { nome: string | null; foto_url: string | null }>();
    (cards || []).forEach((c: any) => {
      cardMap.set(c.numero, { nome: c.nome || null, foto_url: c.foto_url || null });
    });

    const results: MessageSearchResult[] = rows.map((r: any) => {
      const card = cardMap.get(r.numero);
      return {
        id: r.id,
        numero: r.numero,
        contato_nome: r.contato_nome || null,
        lead_nome: card?.nome || null,
        lead_foto_url: card?.foto_url || null,
        texto: r.texto || "",
        created_at: r.created_at,
        direcao: r.direcao,
        autor: r.autor,
        midia_tipo: r.midia_tipo || null,
      };
    });

    return { results };
  });

export const fetchMessagesForContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string; limit?: number }) => ({
    numero: (d?.numero || "").trim(),
    limit: Math.min(Math.max(d?.limit ?? 150, 20), 500),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const MSG_COLS =
      "id,numero,contato_nome,direcao,autor,texto,created_at,user_id,midia_url,midia_tipo,midia_mime,midia_nome,reacao,editado_em,deletado_em,whatsapp_message_id,reply_to_id,status_envio,provider,instance_id,raw_payload";

    const { data: rows, error } = await supabaseAdmin
      .from("mensagens")
      .select(MSG_COLS)
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error || !rows) {
      return { messages: [] };
    }

    return { messages: rows };
  });
