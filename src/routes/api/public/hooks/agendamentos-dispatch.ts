import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

// Cron: dispara mensagens agendadas cujo horário já chegou.
export const Route = createFileRoute("/api/public/hooks/agendamentos-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { evoSendText } = await import("@/lib/evolution.server");

          const nowIso = new Date().toISOString();
          const { data: rows, error } = await (supabaseAdmin as any)
            .from("mensagem_agendada")
            .select("id, company_id, numero, mensagem, link_reuniao")
            .eq("status", "pendente")
            .eq("tipo", "mensagem")
            .lte("agendado_para", nowIso)
            .limit(50);
          if (error) throw error;

          const results: any[] = [];
          for (const row of rows ?? []) {
            try {
              const { data: insts } = await (supabaseAdmin as any)
                .from("whatsapp_instances")
                .select("instance_name, status, updated_at")
                .eq("company_id", row.company_id)
                .eq("status", "connected")
                .order("updated_at", { ascending: false });
              
              const inst = insts?.[0];
              if (!inst?.instance_name) throw new Error("Nenhuma conexão de WhatsApp ativa encontrada");

              let texto = row.mensagem as string;
              if (row.link_reuniao && !texto.includes(row.link_reuniao)) {
                texto = `${texto}\n\n${row.link_reuniao}`;
              }
              await evoSendText(inst.instance_name, row.numero, texto);

              await (supabaseAdmin as any)
                .from("mensagem_agendada")
                .update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null })
                .eq("id", row.id);

              await (supabaseAdmin as any).from("mensagens").insert({
                company_id: row.company_id,
                numero: row.numero,
                texto,
                direcao: "saida",
                autor: "agendamento",
              });

              results.push({ id: row.id, ok: true });
            } catch (e: any) {
              await (supabaseAdmin as any)
                .from("mensagem_agendada")
                .update({ status: "erro", erro: String(e?.message || e).slice(0, 500) })
                .eq("id", row.id);
              results.push({ id: row.id, error: e?.message });
            }
          }

          return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
