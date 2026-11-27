import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeads from "./tools/list-leads";
import listConversations from "./tools/list-conversations";
import sendWhatsapp from "./tools/send-whatsapp";

const supabaseBaseUrl = (
  process.env.EXTERNAL_SUPABASE_URL ||
  process.env.VITE_EXTERNAL_SUPABASE_URL ||
  (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes("llnfjhqdeeuscyqzoqfz")
    ? process.env.SUPABASE_URL
    : "") ||
  "https://supabase.cuentastupana.com"
).replace(/\/+$/, "");

export default defineMcp({
  name: "capiversa-mcp",
  title: "Capiversa",
  version: "0.1.0",
  instructions:
    "Ferramentas do Capiversa para consultar leads do CRM, conversas recentes do WhatsApp e enviar mensagens pela instância conectada da empresa do usuário.",
  auth: auth.oauth.issuer({
    issuer: `${supabaseBaseUrl}/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLeads, listConversations, sendWhatsapp],
});
