import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeads from "./tools/list-leads";
import listConversations from "./tools/list-conversations";
import sendWhatsapp from "./tools/send-whatsapp";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "capiversa-mcp",
  title: "Capiversa",
  version: "0.1.0",
  instructions:
    "Ferramentas do Capiversa para consultar leads do CRM, conversas recentes do WhatsApp e enviar mensagens pela instância conectada da empresa do usuário.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeads, listConversations, sendWhatsapp],
});
