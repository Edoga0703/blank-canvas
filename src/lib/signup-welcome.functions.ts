import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseBrPhone } from "@/lib/br-phone";

export type SignupWelcomeConfig = {
  enabled: boolean;
  company_id: string | null;
  mensagem: string;
};

export const DEFAULT_WELCOME_MESSAGE =
  "Olá {nome}! 👋 Aqui é a Metrix CRM. Sua conta foi criada com sucesso. Qualquer dúvida, é só responder por aqui que a gente te ajuda a começar.";

function renderMessage(tpl: string, vars: { nome: string; email: string; telefone: string }) {
  let out = tpl || DEFAULT_WELCOME_MESSAGE;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v || "").replaceAll(`{${k}}`, v || "");
  }
  // variáveis das réguas que não se aplicam no cadastro
  return out.replace(/\{\{?\s*(plano|dias|empresa)\s*\}?\}/g, "").trim();
}

/**
 * Fonte única: a régua "boas_vindas" do CRM Admin.
 * Liga/desliga e texto vêm de `admin_automation`; o envio usa a conexão do
 * workspace interno (Metrix Admin).
 */
async function loadConfig(): Promise<SignupWelcomeConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: regua }, { data: interna }] = await Promise.all([
    (supabaseAdmin as any)
      .from("admin_automation")
      .select("ativo, template")
      .eq("trigger_key", "boas_vindas")
      .maybeSingle(),
    (supabaseAdmin as any).from("company").select("id").eq("is_internal", true).limit(1).maybeSingle(),
  ]);
  return {
    enabled: !!regua?.ativo,
    company_id: interna?.id ?? null,
    mensagem: regua?.template || DEFAULT_WELCOME_MESSAGE,
  };
}

async function assertSuper(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: any) => r.role === "super_admin")) throw new Error("Acesso restrito.");
}

/** Envia a mensagem de boas-vindas. Nunca lança para o cliente: sempre registra o resultado. */
export const sendSignupWelcome = createServerFn({ method: "POST" })
  .inputValidator((d: { nome?: string; email?: string; telefone: string; userId?: string | null }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nome = (data.nome || "").trim();
    const email = (data.email || "").trim();
    const parsed = parseBrPhone(data.telefone || "");
    const telefone = parsed.numero;

    const log = async (status: string, erro?: string) => {
      await (supabaseAdmin as any).from("signup_welcome_log").insert({
        user_id: data.userId ?? null,
        email: email || null,
        nome: nome || null,
        telefone: telefone || (data.telefone ?? null),
        status,
        erro: erro ?? null,
      });
    };

    try {
      if (!parsed.valid || !telefone) {
        await log("invalido", parsed.reason || "Número inválido");
        return { ok: false as const, reason: "numero_invalido" };
      }

      const cfg = await loadConfig();
      if (!cfg.enabled || !cfg.company_id) {
        await log("desativado");
        return { ok: false as const, reason: "desativado" };
      }

      // Anti-duplicação: já enviado para este número nas últimas 24h?
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await (supabaseAdmin as any)
        .from("signup_welcome_log")
        .select("id")
        .eq("telefone", telefone)
        .eq("status", "enviado")
        .gte("created_at", since)
        .limit(1);
      if ((recent ?? []).length) return { ok: true as const, reason: "duplicado" };

      const { getActiveInstance, waSendText } = await import("@/lib/wa-dispatch.server");
      const inst = await getActiveInstance(cfg.company_id);
      if (!inst) {
        await log("falha", "Nenhuma conexão de WhatsApp ativa na empresa configurada.");
        return { ok: false as const, reason: "sem_conexao" };
      }

      await waSendText(inst, telefone, renderMessage(cfg.mensagem, { nome, email, telefone }));
      await log("enviado");
      return { ok: true as const };
    } catch (e: any) {
      try { await log("falha", String(e?.message || e).slice(0, 500)); } catch {}
      return { ok: false as const, reason: "erro" };
    }
  });

export const getSignupWelcomeConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await loadConfig();
    const { data: conns } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("company_id, instance_name, status, company:company(nome)")
      .in("status", ["connected", "open"]);
    const conexoes = (conns ?? []).map((c: any) => ({
      company_id: c.company_id,
      nome: c.company?.nome || c.instance_name,
    }));
    return { config: cfg, conexoes };
  });

export const testSignupWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { telefone: string; nome?: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const cfg = await loadConfig();
    if (!cfg.company_id) throw new Error("Escolha a conexão de WhatsApp que fará o envio.");
    const parsed = parseBrPhone(data.telefone || "");
    if (!parsed.valid) throw new Error(parsed.reason || "Número inválido");
    const { getActiveInstance, waSendText } = await import("@/lib/wa-dispatch.server");
    const inst = await getActiveInstance(cfg.company_id);
    if (!inst) throw new Error("Nenhuma conexão de WhatsApp ativa na empresa escolhida.");
    await waSendText(
      inst,
      parsed.numero,
      renderMessage(cfg.mensagem, { nome: data.nome || "Teste", email: "teste@metrixcrm.com.br", telefone: parsed.numero }),
    );
    return { ok: true };
  });

export const listSignupWelcomeLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("signup_welcome_log")
      .select("id, nome, email, telefone, status, erro, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    return { logs: data ?? [] };
  });
