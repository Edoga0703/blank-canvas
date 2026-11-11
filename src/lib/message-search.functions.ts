import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface MessageSearchResult {
  id: string;
  numero: string;
  contato_nome: string | null;
  lead_nome: string | null;
  lead_foto_url: string | null;
  texto: string;
  created_at: string;
  direcao: string;
  autor: string;
  midia_tipo: string | null;
}

/**
 * Validação rigorosa de acesso à conversa:
 * No modo 'atendimento_operacional', atendentes comuns só podem buscar, abrir ou interagir
 * com conversas de contatos/leads que estejam estritamente atribuídos a eles (crm_cards.owner_id = userId).
 * Proprietários (owner), administradores (admin) ou empresas sem modo operacional possuem acesso integral.
 */
export async function requireConversationAccess(
  companyId: string,
  userId: string,
  numero: string,
): Promise<boolean> {
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

  if (!membership) {
    throw new Error("Acesso negado: usuário não pertence à empresa.");
  }

  // Proprietários, administradores ou empresas fora do modo operacional têm acesso completo
  if (["owner", "admin"].includes(membership.role) || !company?.atendimento_operacional) {
    return true;
  }

  // Modo operacional restrito: atendente só pode acessar números de cards atribuídos a ele
  // P1.7: Usa limit(1) em vez de maybeSingle() para evitar erro quando existem múltiplos cards com o mesmo número
  const { data: cards, error: cardErr } = await supabaseAdmin
    .from("crm_cards")
    .select("id")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .eq("owner_id", userId)
    .limit(1);

  if (cardErr || !cards || cards.length === 0) {
    throw new Error("Acesso negado: esta conversa não está atribuída ao seu usuário.");
  }

  return true;
}

export const searchMessagesGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { query: string; limit?: number }) => ({
    query: (d?.query || "").trim(),
    limit: Math.min(Math.max(d?.limit ?? 30, 5), 100),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const query = data.query;
    const limit = data.limit;

    if (!query || query.length < 2) {
      return { results: [] };
    }

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
    const isRestricted = isAtendente && isOperational;

    // P1.7: Tenta primeiro via RPC atômica search_company_messages (filtra carteira no banco antes do LIMIT)
    let rows: any[] = [];
    const { data: rpcRows, error: rpcErr } = await (supabaseAdmin as any).rpc("search_company_messages", {
      p_company_id: companyId,
      p_user_id: userId,
      p_query: query,
      p_limit: limit,
      p_is_restricted: isRestricted,
    });

    if (!rpcErr && Array.isArray(rpcRows)) {
      rows = rpcRows;
    } else {
      // Fallback em código caso a RPC não esteja aplicada no ambiente
      let allowedNumbers: string[] | null = null;
      if (isRestricted) {
        const allNumbers: string[] = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          const { data: userCards, error: pageErr } = await supabaseAdmin
            .from("crm_cards")
            .select("numero")
            .eq("company_id", companyId)
            .eq("owner_id", userId)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          if (pageErr || !userCards || userCards.length === 0) break;
          for (const c of userCards) {
            if (c.numero) allNumbers.push(c.numero);
          }
          if (userCards.length < PAGE_SIZE) break;
          page++;
        }

        allowedNumbers = allNumbers;
        if (allowedNumbers.length === 0) {
          return { results: [] };
        }
      }

      if (allowedNumbers && allowedNumbers.length > 150) {
        // Divide em blocos de até 150 números para não estourar URL do PostgREST
        const chunks: string[][] = [];
        for (let i = 0; i < allowedNumbers.length; i += 150) {
          chunks.push(allowedNumbers.slice(i, i + 150));
        }

        // P1.F: Consulta todos os blocos de números sem limitar a 10 para suportar carteiras > 1500 leads
        const chunkPromises = chunks.map((chunk) =>
          supabaseAdmin
            .from("mensagens")
            .select("id,numero,contato_nome,texto,created_at,direcao,autor,midia_tipo")
            .eq("company_id", companyId)
            .in("numero", chunk)
            .ilike("texto", `%${query}%`)
            .order("created_at", { ascending: false })
            .limit(limit)
        );

        const chunkResults = await Promise.all(chunkPromises);
        const collected: any[] = [];
        for (const res of chunkResults) {
          if (res.error) {
            console.error("[searchMessagesGlobal fallback] Erro ao consultar bloco:", res.error);
          }
          if (res.data) collected.push(...res.data);
        }
        collected.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        rows = collected.slice(0, limit);
      } else {
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

        const { data: rawRows } = await msgQuery;
        rows = rawRows || [];
      }
    }

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
  .validator((d: { numero: string; limit?: number }) => ({
    numero: (d?.numero || "").trim(),
    limit: Math.min(Math.max(d?.limit ?? 150, 20), 500),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    if (!data.numero) {
      throw new Error("Número de contato não fornecido.");
    }

    // Blindagem de permissão: bloqueia atendente de abrir conversas que não são suas
    await requireConversationAccess(companyId, userId, data.numero);

    const MSG_COLS =
      "id,numero,contato_nome,direcao,autor,texto,created_at,user_id,midia_url,midia_tipo,midia_mime,midia_nome,reacao,editado_em,deletado_em,whatsapp_message_id,reply_to_id,status_envio,provider,instance_id,raw_payload";

    const { data: rows, error } = await supabaseAdmin
      .from("mensagens")
      .select(MSG_COLS)
      .eq("company_id", companyId)
      .eq("numero", data.numero)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) {
      throw new Error(`Erro ao consultar mensagens: ${error.message}`);
    }

    return { messages: rows || [] };
  });
