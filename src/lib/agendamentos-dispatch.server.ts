import { getActiveInstance, waSendText } from "./wa-dispatch.server";

export async function executeAgendamentosDispatch() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      const inst = await getActiveInstance(row.company_id);
      if (!inst) throw new Error("Nenhuma conexão ativa de mensageria encontrada");

      let texto = row.mensagem as string;
      if (row.link_reuniao && !texto.includes(row.link_reuniao)) {
        texto = `${texto}\n\n${row.link_reuniao}`;
      }
      
      // Envio agnóstico multicanal (Uazapi, Evolution, WaBlast, Lovable, Telegram)
      await waSendText(inst, row.numero, texto);

      await (supabaseAdmin as any)
        .from("mensagem_agendada")
        .update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null })
        .eq("id", row.id);

      // Resolver user_id para satisfazer chave NOT NULL na tabela mensagens
      const { data: member } = await (supabaseAdmin as any)
        .from("company_user")
        .select("user_id")
        .eq("company_id", row.company_id)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();

      await (supabaseAdmin as any).from("mensagens").insert({
        company_id: row.company_id,
        user_id: member?.user_id || null,
        numero: row.numero,
        texto,
        direcao: "saida",
        autor: "automacao",
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

  return { ok: true, processed: results.length, results };
}
