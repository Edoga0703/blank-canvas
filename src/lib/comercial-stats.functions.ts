import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdFor } from "./company-cache";
import { monthRange, previousOf } from "./comercial-range";
import { z } from "zod";

const rangeInput = z.object({
  periodo: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  companyId: z.string().optional(),
  ownerId: z.string().optional(),
});

export const getComercialStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdFor(supabase, userId, data.companyId);

    const range = data.from && data.to ? { from: data.from, to: data.to } : monthRange();
    const prev = previousOf(range);

    let qCurrent = supabase
      .from("crm_venda")
      .select("valor_cents")
      .eq("company_id", companyId)
      .gte("vendido_em", range.from)
      .lt("vendido_em", range.to);

    if (data.ownerId && data.ownerId !== "all") qCurrent = qCurrent.eq("owner_id", data.ownerId);

    let qPrev = supabase
      .from("crm_venda")
      .select("valor_cents")
      .eq("company_id", companyId)
      .gte("vendido_em", prev.from)
      .lt("vendido_em", prev.to);

    if (data.ownerId && data.ownerId !== "all") qPrev = qPrev.eq("owner_id", data.ownerId);

    const ref = new Date(range.from);
    const yearMonth = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;


    const [{ data: currentSales }, { data: prevSales }, { data: goals }] = await Promise.all([
      qCurrent,
      qPrev,
      supabase
        .from("crm_goals")
        .select("user_id, value_cents")
        .eq("company_id", companyId)
        .eq("year_month", yearMonth),
    ]);

    const totalCurrent = (currentSales ?? []).reduce((s, v) => s + v.valor_cents, 0);
    const countCurrent = (currentSales ?? []).length;
    const totalPrev = (prevSales ?? []).reduce((s, v) => s + v.valor_cents, 0);
    const variation = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0;


    const goalsList = (goals || []) as Array<{ user_id: string | null; value_cents: number }>;
    const generalGoal = goalsList.find((g) => !g.user_id)?.value_cents || 0;

    return {
      receitaMes: totalCurrent,
      vendasRealizadas: countCurrent,
      variacaoReceita: variation,
      ticketMedio: countCurrent > 0 ? Math.round(totalCurrent / countCurrent) : 0,
      metaGeral: generalGoal,
      metaAlcancada: generalGoal > 0 ? Math.min(100, Math.round((totalCurrent / generalGoal) * 100)) : 0,
    };
  });

export const getTeamPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdFor(supabase, userId, data.companyId);

    const range = data.from && data.to ? { from: data.from, to: data.to } : monthRange();
    const ref = new Date(range.from);
    const yearMonth = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;

    const [{ data: memberRows }, { data: sales }, { data: goals }] = await Promise.all([
      supabase.from("company_user").select("user_id, role").eq("company_id", companyId).eq("ativo", true),
      supabase
        .from("crm_venda")
        .select("owner_id, valor_cents")
        .eq("company_id", companyId)
        .gte("vendido_em", range.from)
        .lt("vendido_em", range.to),
      supabase
        .from("crm_goals")
        .select("user_id, value_cents")
        .eq("company_id", companyId)
        .eq("year_month", yearMonth),
    ]);

    const memberIds = (memberRows ?? []).map((m: any) => m.user_id);
    const { data: profileRows } = memberIds.length
      ? await supabase.from("profiles").select("user_id, nome, email, avatar_url").in("user_id", memberIds)
      : { data: [] as any[] };
    const profileMap = new Map<string, any>((profileRows ?? []).map((p: any) => [p.user_id, p]));
    const members = (memberRows ?? []).map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      profiles: profileMap.get(m.user_id) ?? null,
    }));


    const goalsList = (goals || []) as Array<{ user_id: string | null; value_cents: number }>;

    const performance = (members ?? []).map((m) => {
      const userSales = (sales ?? []).filter((s) => s.owner_id === m.user_id);
      const receita = userSales.reduce((s, v) => s + v.valor_cents, 0);
      const qtdVendas = userSales.length;
      const meta = goalsList.find((g) => g.user_id === m.user_id)?.value_cents || 0;

      return {
        user_id: m.user_id,
        nome: (m.profiles as any)?.nome || (m.profiles as any)?.email?.split("@")[0] || "Usuário",
        avatar_url: (m.profiles as any)?.avatar_url,
        role: m.role,
        receita,
        vendas: qtdVendas,
        ticketMedio: qtdVendas > 0 ? Math.round(receita / qtdVendas) : 0,
        meta,
        progressoMeta: meta > 0 ? Math.min(100, Math.round((receita / meta) * 100)) : 0,
      };
    });

    return performance.sort((a, b) => b.receita - a.receita);
  });

export const getProductStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdFor(supabase, userId, data.companyId);

    let q = supabase.from("crm_venda").select("item_id, item_nome, valor_cents").eq("company_id", companyId);
    if (data.from && data.to) q = q.gte("vendido_em", data.from).lt("vendido_em", data.to);

    const [{ data: products }, { data: sales }] = await Promise.all([
      supabase.from("produto").select("id, preco, nome, categoria, ativo").eq("company_id", companyId),
      q,
    ]);


    const productsCount = (products || []).filter((p) => p.ativo).length;
    const totalReceita = (sales || []).reduce((s, v) => s + v.valor_cents, 0);

    const salesByName = (sales || []).reduce((acc: Record<string, number>, sale: any) => {
      const key = (sale.item_nome || products?.find((p: any) => p.id === sale.item_id)?.nome || "").trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    let mostSoldName = "Nenhum";
    let maxSales = 0;
    Object.entries(salesByName).forEach(([nome, count]) => {
      if ((count as number) > maxSales) {
        maxSales = count as number;
        mostSoldName = nome;
      }
    });

    return { produtosAtivos: productsCount, maisVendido: mostSoldName, receitaProdutos: totalReceita };
  });

export const getProductsPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdFor(supabase, userId, data.companyId);

    let q = supabase.from("crm_venda").select("item_id, item_nome, valor_cents").eq("company_id", companyId);
    if (data.from && data.to) q = q.gte("vendido_em", data.from).lt("vendido_em", data.to);

    const [{ data: products }, { data: sales }] = await Promise.all([
      supabase.from("produto").select("*").eq("company_id", companyId),
      q,
    ]);


    return (products || [])
      .map((p) => {
        const pSales = (sales || []).filter(
          (s: any) =>
            s.item_id === p.id ||
            (s.item_nome || "").trim().toLowerCase() === (p.nome || "").trim().toLowerCase(),
        );
        const receita = pSales.reduce((s, v) => s + v.valor_cents, 0);
        const qtd = pSales.length;
        return {
          id: p.id,
          nome: p.nome,
          categoria: p.categoria,
          preco: p.preco,
          ativo: p.ativo,
          tipo: (p as any).tipo ?? "produto",
          vendas: qtd,
          receita,
          ticketMedio: qtd > 0 ? Math.round(receita / qtd) : Math.round(Number(p.preco || 0) * 100),
        };
      })
      .sort((a, b) => b.receita - a.receita);
  });

export const getReportsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeInput.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdFor(supabase, userId, data.companyId);

    const range = data.from && data.to ? { from: data.from, to: data.to } : monthRange();

    const { data: sales } = await supabase
      .from("crm_venda")
      .select("valor_cents, vendido_em")
      .eq("company_id", companyId)
      .gte("vendido_em", range.from)
      .lt("vendido_em", range.to)
      .order("vendido_em", { ascending: true });

    const start = new Date(range.from);
    const end = new Date(range.to);
    const dayMap = new Map<string, number>();
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      dayMap.set(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }), 0);
    }

    (sales || []).forEach((v) => {
      const label = new Date(v.vendido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      if (dayMap.has(label)) dayMap.set(label, (dayMap.get(label) || 0) + v.valor_cents);
    });

    return { chart: Array.from(dayMap.entries()).map(([name, value]) => ({ name, value })) };
  });
