import { assignCardToSector } from "./sector-assignment.server";
import { getActiveInstance, waSendText } from "./wa-dispatch.server";

type Admin = any;
type MenuOption = { numero: string; department_id: string; label: string };

function normalizeChoice(text: string) {
  return text.trim().replace(/[^0-9]/g, "");
}

async function sendFixedMenu(admin: Admin, companyId: string, numero: string, text: string) {
  const instance = await getActiveInstance(companyId);
  if (!instance) throw new Error("Nenhuma conexão ativa para enviar o menu de setores.");
  await waSendText(instance, numero, text);
  await admin.from("mensagens").insert({
    company_id: companyId,
    numero,
    texto: text,
    direcao: "saida",
    autor: "ia",
    created_at: new Date().toISOString(),
  });
}

export async function processDepartmentMenu(
  admin: Admin,
  params: { companyId: string; numero: string; texto: string; inboundMessageId: string },
) {
  const { companyId, numero, texto, inboundMessageId } = params;
  const { data: config } = await admin
    .from("agent_config")
    .select("id,menu_setores_ativo,menu_setores_texto,menu_setores_opcoes")
    .eq("company_id", companyId)
    .eq("menu_setores_ativo", true)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!config?.menu_setores_ativo) return null;

  const menuText = String(config.menu_setores_texto ?? "").trim();
  const options = (Array.isArray(config.menu_setores_opcoes) ? config.menu_setores_opcoes : []) as MenuOption[];
  if (!menuText || options.length < 2) return null;

  const { data: card } = await admin
    .from("crm_cards")
    .select("department_id")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .maybeSingle();
  if (card?.department_id) return null;

  const { data: session } = await admin
    .from("department_menu_session")
    .select("id,status,last_inbound_message_id")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .maybeSingle();

  if (session?.last_inbound_message_id === inboundMessageId) return { handled: true, duplicate: true };
  if (session?.status === "encaminhado") return null;

  if (!session) {
    const { error } = await admin.from("department_menu_session").insert({
      company_id: companyId,
      agent_config_id: config.id,
      numero,
      status: "aguardando",
      last_inbound_message_id: inboundMessageId,
      last_menu_at: new Date().toISOString(),
    });
    if (error?.code === "23505") return { handled: true, duplicate: true };
    if (error) throw error;
    await sendFixedMenu(admin, companyId, numero, menuText);
    return { handled: true, action: "menu_sent" };
  }

  await admin
    .from("department_menu_session")
    .update({ last_inbound_message_id: inboundMessageId })
    .eq("id", session.id);

  const selected = options.find((option) => option.numero === normalizeChoice(texto));
  if (!selected) {
    await sendFixedMenu(admin, companyId, numero, menuText);
    await admin.from("department_menu_session").update({ last_menu_at: new Date().toISOString() }).eq("id", session.id);
    return { handled: true, action: "menu_repeated" };
  }

  const assigned = await assignCardToSector(admin, companyId, numero, selected.department_id);
  await admin
    .from("department_menu_session")
    .update({
      status: "encaminhado",
      department_id: selected.department_id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  return { handled: true, action: "transferred", ...assigned };
}