import { SLA_MINUTOS, SUPPORT_CATEGORIAS } from "@/lib/support-constants";

export interface SupportConfig {
  auto_reply_enabled: boolean;
  auto_reply_message: string;
  offhours_enabled: boolean;
  offhours_message: string;
  horario_inicio: number;
  horario_fim: number;
  dias_semana: number[];
  csat_enabled: boolean;
  csat_message: string;
  auto_resolve_dias: number;
}

export const SUPPORT_CONFIG_FALLBACK: SupportConfig = {
  auto_reply_enabled: true,
  auto_reply_message:
    "Olá! Recebemos seu chamado e nossa equipe já foi notificada. Respondemos normalmente em poucos minutos durante o horário comercial.",
  offhours_enabled: false,
  offhours_message:
    "Estamos fora do horário de atendimento no momento. Seu chamado foi registrado e será respondido assim que o expediente começar.",
  horario_inicio: 9,
  horario_fim: 18,
  dias_semana: [1, 2, 3, 4, 5],
  csat_enabled: true,
  csat_message: "Seu chamado foi resolvido! De 1 a 5, como você avalia nosso atendimento?",
  auto_resolve_dias: 0,
};

export async function loadSupportConfig(admin: any): Promise<SupportConfig> {
  try {
    const { data } = await admin.from("support_config").select("*").eq("id", true).maybeSingle();
    return { ...SUPPORT_CONFIG_FALLBACK, ...(data ?? {}) } as SupportConfig;
  } catch {
    return SUPPORT_CONFIG_FALLBACK;
  }
}

/** Horário comercial em America/Sao_Paulo */
export function isBusinessHours(cfg: SupportConfig, now = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const wdName = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase();
  const map: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sáb: 6, sab: 6 };
  const wd = map[wdName.slice(0, 3)] ?? 1;
  const dias = cfg.dias_semana?.length ? cfg.dias_semana : [1, 2, 3, 4, 5];
  return dias.includes(wd) && hour >= cfg.horario_inicio && hour < cfg.horario_fim;
}

/** Triagem por IA: sugere categoria e prioridade a partir do assunto/mensagem. */
export async function triageTicket(
  assunto: string,
  message: string,
): Promise<{ categoria: string; prioridade: "baixa" | "normal" | "alta" | "urgente" } | null> {
  try {
    const { lovableAiChat } = await import("@/lib/lovable-ai.server");
    const out = await lovableAiChat(
      [
        {
          role: "system",
          content:
            "Você classifica chamados de suporte de um CRM SaaS. Responda APENAS um JSON " +
            `{"categoria":"<uma de: ${SUPPORT_CATEGORIAS.join(" | ")}>","prioridade":"baixa|normal|alta|urgente"}. ` +
            "Use 'urgente' apenas quando o cliente está com o sistema/conexão totalmente parado ou perda financeira.",
        },
        { role: "user", content: `Assunto: ${assunto}\nMensagem: ${message}`.slice(0, 2000) },
      ],
      "google/gemini-2.5-flash",
    );
    const json = JSON.parse(out.replace(/```json|```/g, "").trim());
    const categoria = SUPPORT_CATEGORIAS.includes(json?.categoria) ? json.categoria : "Geral";
    const prioridade = ["baixa", "normal", "alta", "urgente"].includes(json?.prioridade)
      ? json.prioridade
      : "normal";
    return { categoria, prioridade };
  } catch (e) {
    console.warn("[support triage]", (e as Error)?.message);
    return null;
  }
}

/** Aplica triagem + resposta automática logo após a criação do chamado. */
export async function runTicketAutomation(
  admin: any,
  ticket: { id: string; assunto: string; created_at?: string },
  message: string,
) {
  const cfg = await loadSupportConfig(admin);
  const patch: any = {};

  const triage = await triageTicket(ticket.assunto, message);
  if (triage) {
    patch.categoria = triage.categoria;
    patch.prioridade = triage.prioridade;
    const base = ticket.created_at ? new Date(ticket.created_at).getTime() : Date.now();
    patch.sla_due_at = new Date(base + (SLA_MINUTOS[triage.prioridade] ?? 480) * 60000).toISOString();
  }

  const dentroHorario = isBusinessHours(cfg);
  const texto = !dentroHorario && cfg.offhours_enabled ? cfg.offhours_message : cfg.auto_reply_message;
  if (cfg.auto_reply_enabled && texto) {
    await admin.from("support_message").insert({
      ticket_id: ticket.id,
      sender_id: null,
      sender_role: "admin",
      content: texto,
    });
    patch.auto_reply_sent = true;
    patch.unread_user = 1;
    patch.last_message_at = new Date().toISOString();
  }

  if (Object.keys(patch).length) {
    await admin.from("support_ticket").update(patch).eq("id", ticket.id);
  }
}
