import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuper(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Acesso negado");
}

export type OpenAiRange = "mes" | "mes_anterior" | "7d" | "30d" | "90d";

function bounds(range: OpenAiRange): { from: Date; to: Date; label: string } {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  switch (range) {
    case "mes_anterior":
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: startOfMonth, label: "Mês anterior" };
    case "7d":
      return { from: new Date(now.getTime() - 7 * 864e5), to: now, label: "Últimos 7 dias" };
    case "30d":
      return { from: new Date(now.getTime() - 30 * 864e5), to: now, label: "Últimos 30 dias" };
    case "90d":
      return { from: new Date(now.getTime() - 90 * 864e5), to: now, label: "Últimos 90 dias" };
    default:
      return { from: startOfMonth, to: now, label: "Este mês" };
  }
}

async function fetchAll(url: string, key: string) {
  const results: any[] = [];
  let page: string | null = null;
  for (let i = 0; i < 20; i++) {
    const u = page ? `${url}&page=${encodeURIComponent(page)}` : url;
    const res = await fetch(u, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      const body = await res.text();
      const err: any = new Error(body.slice(0, 300));
      err.status = res.status;
      throw err;
    }
    const json: any = await res.json();
    results.push(...(json.data ?? []));
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return results;
}

/** Gasto e tokens reais da conta OpenAI (requer chave de administrador). */
export const getOpenAiSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { range?: OpenAiRange }) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);

    const key = process.env["OPENAI_ADMIN_KEY"];
    if (!key) {
      return { configurado: false as const, motivo: "Chave de administrador da OpenAI não configurada." };
    }

    const { from, to, label } = bounds(data.range ?? "mes");
    const start = Math.floor(from.getTime() / 1000);
    const end = Math.floor(to.getTime() / 1000);

    try {
      const [costBuckets, usageBuckets] = await Promise.all([
        fetchAll(
          `https://api.openai.com/v1/organization/costs?start_time=${start}&end_time=${end}&bucket_width=1d&limit=31`,
          key,
        ),
        fetchAll(
          `https://api.openai.com/v1/organization/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d&group_by=model&limit=31`,
          key,
        ),
      ]);

      const porDia = new Map<string, number>();
      let totalUsd = 0;
      for (const b of costBuckets) {
        const dia = new Date((b.start_time ?? start) * 1000).toISOString().slice(0, 10);
        let soma = 0;
        for (const r of b.results ?? []) soma += Number(r?.amount?.value ?? 0);
        totalUsd += soma;
        porDia.set(dia, (porDia.get(dia) ?? 0) + soma);
      }

      const porModelo = new Map<string, { input: number; output: number; requests: number }>();
      let inputTokens = 0;
      let outputTokens = 0;
      let requests = 0;
      for (const b of usageBuckets) {
        for (const r of b.results ?? []) {
          const modelo = r.model ?? "—";
          const cur = porModelo.get(modelo) ?? { input: 0, output: 0, requests: 0 };
          cur.input += Number(r.input_tokens ?? 0);
          cur.output += Number(r.output_tokens ?? 0);
          cur.requests += Number(r.num_model_requests ?? 0);
          porModelo.set(modelo, cur);
          inputTokens += Number(r.input_tokens ?? 0);
          outputTokens += Number(r.output_tokens ?? 0);
          requests += Number(r.num_model_requests ?? 0);
        }
      }

      return {
        configurado: true as const,
        periodo: { label, from: from.toISOString(), to: to.toISOString() },
        totalUsd,
        inputTokens,
        outputTokens,
        requests,
        serie: [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, usd]) => ({ dia, usd })),
        modelos: [...porModelo.entries()]
          .map(([modelo, v]) => ({ modelo, ...v }))
          .sort((a, b) => b.input + b.output - (a.input + a.output)),
      };
    } catch (e: any) {
      return {
        configurado: false as const,
        motivo:
          e?.status === 401 || e?.status === 403
            ? "A chave informada não tem permissão de leitura de uso/custos (precisa ser uma chave de administrador)."
            : `Falha ao consultar a OpenAI: ${e?.message ?? "erro desconhecido"}`,
      };
    }
  });

/** Salva o crédito total adicionado na conta OpenAI (ex.: recarga de US$ 5). */
export const setOpenAiCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { totalUsd: number; desde: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("master_settings").upsert({
      key: "openai_credit_config",
      value: { total_usd: Number(data.totalUsd) || 0, desde: data.desde },
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true };
  });

/** Crédito total, gasto desde a recarga e saldo restante estimado. */
export const getOpenAiCredit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (supabaseAdmin as any)
      .from("master_settings")
      .select("value")
      .eq("key", "openai_credit_config")
      .maybeSingle();
    const cfg = (row?.value as any) || null;
    if (!cfg?.total_usd || !cfg?.desde) return { configurado: false as const };

    const key = process.env["OPENAI_ADMIN_KEY"];
    if (!key) return { configurado: false as const };

    const start = Math.floor(new Date(cfg.desde + "T00:00:00Z").getTime() / 1000);
    const end = Math.floor(Date.now() / 1000);
    let gasto = 0;
    let tokens = 0;
    let requests = 0;
    try {
      const [costBuckets, usageBuckets] = await Promise.all([
        fetchAll(
          `https://api.openai.com/v1/organization/costs?start_time=${start}&end_time=${end}&bucket_width=1d&limit=31`,
          key,
        ),
        fetchAll(
          `https://api.openai.com/v1/organization/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d&limit=31`,
          key,
        ),
      ]);
      for (const b of costBuckets) for (const r of b.results ?? []) gasto += Number(r?.amount?.value ?? 0);
      for (const b of usageBuckets)
        for (const r of b.results ?? []) {
          tokens += Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0);
          requests += Number(r.num_model_requests ?? 0);
        }
    } catch {
      return { configurado: false as const };
    }
    const restante = Math.max(0, Number(cfg.total_usd) - gasto);
    const tokensPorDolar = gasto > 0 && tokens > 0 ? tokens / gasto : null;
    const mensagensPorDolar = gasto > 0 && requests > 0 ? requests / gasto : null;
    return {
      configurado: true as const,
      totalUsd: Number(cfg.total_usd),
      desde: cfg.desde,
      gastoDesde: gasto,
      restante,
      tokensUsados: tokens,
      mensagensUsadas: requests,
      tokensPorDolar,
      custoPorMensagem: mensagensPorDolar ? 1 / mensagensPorDolar : null,
      tokensRestantes: tokensPorDolar ? Math.floor(tokensPorDolar * restante) : null,
      mensagensRestantes: mensagensPorDolar ? Math.floor(mensagensPorDolar * restante) : null,
    };
  });
