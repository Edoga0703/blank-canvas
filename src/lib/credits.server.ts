// SERVER ONLY. Débito de créditos de IA por mensagem gerada/enviada pela IA.
// Atualiza company.creditos_saldo e registra no credit_ledger.

export async function debitAiCredits(
  admin: any,
  companyId: string,
  qtd = 1,
  motivo = "ia_mensagem",
  ref?: string,
): Promise<number | null> {
  try {
    if (!companyId || qtd <= 0) return null;
    const { data: comp } = await admin
      .from("company")
      .select("creditos_saldo")
      .eq("id", companyId)
      .maybeSingle();
    if (!comp) return null;
    const atual = Number(comp.creditos_saldo ?? 0);
    const novo = Math.max(0, atual - qtd);
    if (novo === atual) return atual;
    await admin.from("company").update({ creditos_saldo: novo }).eq("id", companyId);
    await admin.from("credit_ledger").insert({
      company_id: companyId,
      delta: -(atual - novo),
      saldo_apos: novo,
      motivo,
      ref: ref ?? null,
    });
    return novo;
  } catch (e: any) {
    console.warn("[credits.debit]", e?.message);
    return null;
  }
}
