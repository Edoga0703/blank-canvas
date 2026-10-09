import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  numero: z.union([z.string(), z.number()]).optional().nullable(),
  telefone: z.union([z.string(), z.number()]).optional().nullable(),
  phone: z.union([z.string(), z.number()]).optional().nullable(),
  whatsapp: z.union([z.string(), z.number()]).optional().nullable(),
  nome: z.string().max(120).optional().nullable(),
  name: z.string().max(120).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  mensagem: z.string().max(1000).optional().nullable(),
  message: z.string().max(1000).optional().nullable(),
  valor: z.union([z.string(), z.number()]).optional().nullable(),
  utm_source: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(200).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  origem: z.string().max(120).optional().nullable(),
}).passthrough();

function cors(res: Response) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "content-type");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

export const Route = createFileRoute("/api/public/hooks/$token")({
  server: {
    handlers: {
      OPTIONS: async () => cors(new Response(null, { status: 204 })),
      POST: async ({ request, params }) => {
        try {
          const token = String(params.token ?? "").trim();
          if (!/^[a-f0-9]{20,}$/.test(token)) return cors(new Response("invalid token", { status: 401 }));

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: hook } = await (supabaseAdmin as any)
            .from("inbound_webhook")
            .select("id, company_id, nome, ativo, total_recebidos")
            .eq("token", token)
            .maybeSingle();
          if (!hook || !hook.ativo) return cors(new Response("invalid token", { status: 401 }));

          const body = bodySchema.parse(await request.json());
          const raw = String(body.numero ?? body.telefone ?? body.phone ?? body.whatsapp ?? "");
          let numero = raw.replace(/\D/g, "").slice(0, 15);
          if (numero.length === 10 || numero.length === 11) numero = "55" + numero;
          if (numero.length < 10) {
            return cors(new Response('numero inválido. Envie "numero" com DDD, ex: "5511999999999".', { status: 400 }));
          }

          const nome = (body.nome ?? body.name ?? "").trim() || null;
          const mensagem = (body.mensagem ?? body.message ?? "").trim() || `Lead via webhook "${hook.nome}"`;
          const email = body.email?.trim() || null;
          let valor: number | null = null;
          if (body.valor != null && body.valor !== "") {
            const v = Number(String(body.valor).replace(",", "."));
            if (Number.isFinite(v)) valor = v;
          }
          const cid = hook.company_id;

          const { data: pipe } = await (supabaseAdmin as any)
            .from("crm_pipeline")
            .select("id")
            .eq("company_id", cid)
            .eq("tipo", "comercial")
            .order("ordem", { ascending: true })
            .limit(1)
            .maybeSingle();

          let firstStage: any = null;
          if (pipe?.id) {
            const { data: stages } = await (supabaseAdmin as any)
              .from("crm_stage")
              .select("id, pipeline_id, nome, ordem")
              .eq("company_id", cid)
              .eq("pipeline_id", pipe.id)
              .order("ordem", { ascending: true });
            firstStage = stages?.[0] ?? null;
          }

          const { data: existing } = await (supabaseAdmin as any)
            .from("crm_cards")
            .select("id")
            .eq("company_id", cid)
            .eq("numero", numero)
            .maybeSingle();

          if (existing) {
            await (supabaseAdmin as any).from("crm_cards")
              .update({ ultima_mensagem: mensagem.slice(0, 240), ultima_em: new Date().toISOString() })
              .eq("id", existing.id);
            await (supabaseAdmin as any).from("lead_evento").insert({
              company_id: cid, card_id: existing.id, tipo: "captura", descricao: `Retorno via webhook "${hook.nome}"`,
            });
            await (supabaseAdmin as any).from("inbound_webhook")
              .update({ total_recebidos: (hook.total_recebidos ?? 0) + 1 })
              .eq("id", hook.id);
            return cors(Response.json({ ok: true, card_id: existing.id, created: false }));
          }

          const { pickLeadOwner } = await import("@/lib/crm-engine.server");
          const ownerId = await pickLeadOwner(supabaseAdmin, cid, firstStage?.id);

          let effectiveUserId: string | null = ownerId ?? null;
          if (!effectiveUserId) {
            const { data: adminUser } = await (supabaseAdmin as any)
              .from("company_user")
              .select("user_id")
              .eq("company_id", cid)
              .eq("ativo", true)
              .limit(1)
              .maybeSingle();
            effectiveUserId = adminUser?.user_id ?? null;
          }
          if (!effectiveUserId) return cors(new Response("empresa sem usuário ativo", { status: 500 }));

          const payload: any = {
            company_id: cid,
            user_id: effectiveUserId,
            numero,
            nome,
            email,
            valor,
            ultima_mensagem: mensagem.slice(0, 240),
            ultima_em: new Date().toISOString(),
            utm_source: body.utm_source ?? null,
            utm_medium: body.utm_medium ?? null,
            utm_campaign: body.utm_campaign ?? null,
            canal_entrada: "webhook",
            primeiro_contato_em: new Date().toISOString(),
            origem: body.origem || hook.nome || "webhook",
          };
          if (firstStage) {
            payload.pipeline_id = firstStage.pipeline_id;
            payload.stage_id = firstStage.id;
            payload.status = firstStage.nome;
          }
          if (ownerId) payload.owner_id = ownerId;

          const { data: inserted, error } = await (supabaseAdmin as any)
            .from("crm_cards")
            .insert(payload)
            .select("id")
            .maybeSingle();
          if (error) return cors(new Response(error.message, { status: 500 }));

          await (supabaseAdmin as any).from("lead_evento").insert({
            company_id: cid, card_id: inserted.id, tipo: "captura", descricao: `Lead via webhook "${hook.nome}"`,
          });
          await (supabaseAdmin as any)
            .from("inbound_webhook")
            .update({ total_recebidos: (hook.total_recebidos ?? 0) + 1 })
            .eq("id", hook.id);

          try {
            const { processKanbanReguaForNumero } = await import("@/lib/kanban-engine.server");
            await processKanbanReguaForNumero(supabaseAdmin, cid, numero);
            const { emitWebhook } = await import("@/lib/webhooks.server");
            await emitWebhook(cid, "lead.created", { card_id: inserted.id, numero, nome, origem: payload.origem });
          } catch (e: any) {
            console.warn("[inbound-hook.pos]", e?.message);
          }

          return cors(Response.json({ ok: true, card_id: inserted.id, created: true }));
        } catch (e: any) {
          return cors(new Response(e?.message ?? "erro", { status: 400 }));
        }
      },
    },
  },
});
