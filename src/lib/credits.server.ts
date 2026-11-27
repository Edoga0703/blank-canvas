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
    const qty = Math.max(1, Math.floor(Number(qtd) || 1));
    if (!companyId || qty <= 0) return null;

    let novoSaldo: number | null = null;
    let usedFallback = false;

    const { data: rpcData, error: rpcError } = await admin.rpc("debit_ai_credits_atomic", {
      _company_id: companyId,
      _qtd: qty,
    });

    if (!rpcError && rpcData !== null && rpcData !== undefined) {
      novoSaldo = Number(rpcData);
    } else {
      usedFallback = true;
      if (rpcError) {
        console.warn("[credits.debit] RPC fallback:", rpcError.message);
      }
      const { data: comp } = await admin
        .from("company")
        .select("creditos_saldo")
        .eq("id", companyId)
        .maybeSingle();
      if (!comp) return null;
      const atual = Number(comp.creditos_saldo ?? 0);
      novoSaldo = Math.max(0, atual - qty);
      if (novoSaldo === atual) return atual;
      await admin.from("company").update({ creditos_saldo: novoSaldo }).eq("id", companyId);
    }

    if (novoSaldo === null || Number.isNaN(novoSaldo)) return null;

    if (!usedFallback || novoSaldo >= 0) {
      try {
        await admin.from("credit_ledger").insert({
          company_id: companyId,
          delta: -qty,
          saldo_apos: novoSaldo,
          motivo,
          ref: ref ?? null,
        });
      } catch (ledgerErr: any) {
        console.warn("[credits.debit.ledger]", ledgerErr?.message);
      }
    }

    return novoSaldo;
  } catch (e: any) {
    console.warn("[credits.debit]", e?.message);
    return null;
  }
}
