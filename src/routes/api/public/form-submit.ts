import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  form_id: z.string().uuid(),
  campos: z.record(z.string(), z.any()).default({}),
  hp: z.string().optional().nullable(), // honeypot
  tracking: z.record(z.string(), z.any()).optional().nullable(),
});

function cors(res: Response) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "content-type");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

const hits = new Map<string, { n: number; t: number }>();
function rateLimited(ip: string) {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now - cur.t > 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  cur.n++;
  return cur.n > 8;
}

export const Route = createFileRoute("/api/public/form-submit")({
  server: {
    handlers: {
      OPTIONS: async () => cors(new Response(null, { status: 204 })),
      POST: async ({ request }) => {
        try {
          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "0.0.0.0";
          if (rateLimited(ip)) return cors(new Response("muitas tentativas", { status: 429 }));

          const body = bodySchema.parse(await request.json());
          if (body.hp) return cors(Response.json({ ok: true })); // bot

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: form } = await (supabaseAdmin as any)
            .from("lead_form")
            .select("*")
            .eq("id", body.form_id)
            .eq("ativo", true)
            .maybeSingle();
          if (!form) return cors(new Response("formulário indisponível", { status: 404 }));

          const campos = body.campos ?? {};
          const defs: any[] = Array.isArray(form.campos) ? form.campos : [];
          const clean: Record<string, string> = {};
          for (const f of defs) {
            const raw = campos[f.id];
            const val = raw == null ? "" : String(raw).slice(0, 500).trim();
            if (f.obrigatorio && !val) {
              return cors(new Response(`Campo obrigatório: ${f.label}`, { status: 400 }));
            }
            if (val) clean[f.id] = val;
          }

          const byMap = (m: string) => {
            const def = defs.find((d) => d.mapeia === m);
            return def ? clean[def.id] ?? "" : "";
          };
          const numeroRaw = byMap("numero") || String(campos["numero"] ?? "");
          const nome = byMap("nome") || String(campos["nome"] ?? "") || null;
          const email = byMap("email") || null;

          // Todas as demais respostas viram "informações extras" no card do lead.
          const camposExtras = defs
            .filter((d) => !d.mapeia && clean[d.id])
            .map((d) => ({
              label: String(d.label ?? d.id),
              valor: clean[d.id] as string,
              campo_id: String(d.id),
              origem: String(form.nome ?? "Formulário"),
            }));

          const { intakeLead } = await import("@/lib/lead-intake.server");
          let result;
          try {
            result = await intakeLead(supabaseAdmin, {
              companyId: form.company_id,
              numeroRaw,
              nome,
              email,
              mensagem: `Lead pelo formulário "${form.nome}"`,
              canal: "formulario",
              origem: body.tracking?.["utm_source"] || "formulario",
              valor: form.valor_padrao ?? null,
              tags: form.tags ?? [],
              pipelineId: form.pipeline_id,
              stageId: form.stage_id,
              ownerId: form.owner_mode === "fixo" ? form.owner_id : null,
              tracking: body.tracking ?? {},
              camposExtras,
            });
          } catch (e: any) {
            return cors(new Response(e?.message ?? "erro", { status: 400 }));
          }

          await (supabaseAdmin as any).from("lead_form_submission").insert({
            form_id: form.id,
            company_id: form.company_id,
            crm_card_id: result.cardId,
            dados: clean,
            tracking: body.tracking ?? {},
            ip_hash: ip.slice(0, 24),
          });

          await (supabaseAdmin as any)
            .from("lead_form")
            .update({ submits: (form.submits ?? 0) + 1 })
            .eq("id", form.id);

          if (form.wa_auto_enviar && form.wa_mensagem) {
            try {
              const { getActiveInstance, waSendText } = await import("@/lib/wa-dispatch.server");
              const inst = await getActiveInstance(form.company_id);
              if (inst) {
                const texto = String(form.wa_mensagem).replace(/\{\{nome\}\}/g, nome || "");
                await waSendText(inst, result.numero, texto);

                const { data: member } = await (supabaseAdmin as any)
                  .from("company_members")
                  .select("user_id")
                  .eq("company_id", form.company_id)
                  .limit(1)
                  .maybeSingle();

                await (supabaseAdmin as any).from("mensagens").insert({
                  company_id: form.company_id,
                  user_id: member?.user_id || null,
                  numero: result.numero,
                  texto,
                  direcao: "saida",
                  autor: "automacao",
                });
              }
            } catch (e: any) {
              console.warn("[form-submit.wa]", e?.message);
            }
          }

          return cors(
            Response.json({
              ok: true,
              redirect: form.pos_envio === "redirect" ? form.redirect_url : null,
              mensagem: form.mensagem_sucesso,
            }),
          );
        } catch (e: any) {
          return cors(new Response(e?.message ?? "erro", { status: 400 }));
        }
      },
    },
  },
});
