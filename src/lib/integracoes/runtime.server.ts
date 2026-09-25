/** Server-only: execução das integrações por chave em eventos do sistema. */
import { getAdapter, type Campos, type VendaResumo } from "./adapters.server";

type Conexao = { servico: string; campos: Campos; autoEnvio: boolean };

async function conexoesAtivas(companyId: string): Promise<Conexao[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
    const { data } = await (supabaseAdmin as any)
      .from("integracao_chave")
      .select("servico, extra, auto_envio, conectado")
      .eq("company_id", companyId)
      .eq("conectado", true);

    const out: Conexao[] = [];
    for (const r of (data ?? []) as any[]) {
      if (!(await capacidadeAtiva(supabaseAdmin, companyId, r.servico))) continue;
      out.push({
        servico: r.servico,
        campos: (r.extra ?? {}) as Campos,
        autoEnvio: r.auto_envio !== false,
      });
    }
    return out;
  } catch (e) {
    console.warn("[integracoes] conexoesAtivas", e);
    return [];
  }
}

const TEXTO_EVENTO: Record<string, string> = {
  "lead.created": "Novo lead no funil",
  "lead.won": "Venda ganha",
  "lead.lost": "Lead perdido",
  "csat.responded": "Pesquisa de satisfação respondida",
};

/** Envia o aviso do evento para Slack, Teams, Zapier, Make e n8n conectados. */
export async function notificarIntegracoes(companyId: string, evento: string, payload: any) {
  const base = TEXTO_EVENTO[evento];
  if (!base) return;
  const conexoes = await conexoesAtivas(companyId);
  const nome = payload?.nome ?? payload?.contato_nome ?? payload?.lead?.nome ?? "";
  const texto = [base, nome].filter(Boolean).join(": ");

  await Promise.all(
    conexoes.map(async (c) => {
      const adapter = getAdapter(c.servico);
      if (!adapter.notificar) return;
      try {
        await adapter.notificar(c.campos, texto, { evento, dados: payload });
      } catch (e) {
        console.warn(`[integracoes] notificar ${c.servico}`, e);
      }
    }),
  );
}

/** Registra a venda nos serviços financeiros/ERP conectados com envio automático ligado. */
export async function enviarVendaIntegracoes(companyId: string, venda: VendaResumo) {
  const conexoes = await conexoesAtivas(companyId);
  const resultados: { servico: string; referencia: string; link?: string }[] = [];

  for (const c of conexoes) {
    if (!c.autoEnvio) continue;
    const adapter = getAdapter(c.servico);
    if (!adapter.criarVenda) continue;
    try {
      const r = await adapter.criarVenda(c.campos, venda);
      resultados.push({ servico: c.servico, ...r });
    } catch (e) {
      console.warn(`[integracoes] criarVenda ${c.servico}`, e);
    }
  }
  return resultados;
}
