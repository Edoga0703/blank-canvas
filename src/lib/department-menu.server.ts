import { assignCardToSector } from "./sector-assignment.server";
import { getActiveInstance, waSendText } from "./wa-dispatch.server";
import { extractWhatsappMessageId } from "./evolution-helpers";

type Admin = any;
type MenuOption = { numero: string; department_id: string; label: string };

function matchMenuOption(text: string, options: MenuOption[]): MenuOption | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // 1. Coincidência direta de número (ex.: "1")
  const exactNum = options.find((opt) => String(opt.numero).trim() === trimmed);
  if (exactNum) return exactNum;

  // 2. Dígito inicial seguido de pontuação ou espaço (ex.: "1 - Suporte", "1. Comercial", "1) Vendas")
  const leadingDigitMatch = trimmed.match(/^(\d{1,3})[\s.\-)/:]/);
  if (leadingDigitMatch) {
    const digit = leadingDigitMatch[1];
    const optByDigit = options.find((opt) => String(opt.numero).trim() === digit);
    if (optByDigit) return optByDigit;
  }

  // 3. Dígito isolado no corpo da mensagem
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length > 0 && digitsOnly.length <= 3) {
    const optByDigits = options.find((opt) => String(opt.numero).trim() === digitsOnly);
    if (optByDigits) return optByDigits;
  }

  // 4. Coincidência por nome do departamento ou ID (suporta cliques interativos e texto)
  const lower = trimmed.toLowerCase();
  const optByLabel = options.find(
    (opt) =>
      opt.department_id === trimmed ||
      (opt.label && opt.label.trim().toLowerCase() === lower) ||
      (opt.label && lower.includes(opt.label.trim().toLowerCase()))
  );
  if (optByLabel) return optByLabel;

  return undefined;
}

async function resolveMenuUserId(admin: Admin, companyId: string, numero: string): Promise<string | null> {
  const { data: card } = await admin
    .from("crm_cards")
    .select("owner_id, user_id")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (card?.owner_id) return card.owner_id as string;
  if (card?.user_id) return card.user_id as string;

  const { data: member } = await admin
    .from("company_user")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  return (member?.user_id as string | undefined) ?? null;
}

async function sendFixedMenu(admin: Admin, companyId: string, numero: string, text: string) {
  const instance = await getActiveInstance(companyId);
  if (!instance) throw new Error("Nenhuma conexão ativa para enviar o menu de setores.");
  const sendRes = await waSendText(instance, numero, text);
  const waId = extractWhatsappMessageId(sendRes) || (sendRes as any)?.id || null;
  const userId = await resolveMenuUserId(admin, companyId, numero);
  await admin.from("mensagens").insert({
    company_id: companyId,
    user_id: userId,
    numero,
    texto: text,
    direcao: "saida",
    autor: "ia",
    provider: instance.provider,
    whatsapp_message_id: waId,
    status_envio: "enviado",
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
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
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

  const selected = matchMenuOption(texto, options);
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
