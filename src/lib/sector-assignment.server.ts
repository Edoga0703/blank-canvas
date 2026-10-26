import { getNextUserInQueue } from "./distribution.functions";

type Admin = any;

export async function assignCardToSector(
  admin: Admin,
  companyId: string,
  numero: string,
  departmentId: string,
  options?: { logEvent?: boolean },
) {
  const [{ data: card }, { data: department }] = await Promise.all([
    admin
      .from("crm_cards")
      .select("id,department_id,owner_id")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    admin
      .from("department")
      .select("id,nome")
      .eq("id", departmentId)
      .eq("company_id", companyId)
      .eq("ativo", true)
      .maybeSingle(),
  ]);

  if (!card) throw new Error("Conversa não encontrada.");
  if (!department) throw new Error("Setor inválido ou inativo.");

  const { isManualDistribution } = await import("./crm-engine.server");
  if (await isManualDistribution(admin, companyId)) {
    const { error: manualErr } = await admin
      .from("crm_cards")
      .update({ department_id: departmentId })
      .eq("id", card.id);
    if (manualErr) throw new Error(manualErr.message);
    if (options?.logEvent !== false) {
      await admin.from("lead_evento").insert({
        company_id: companyId,
        card_id: card.id,
        tipo: "transferencia_setor",
        descricao: `Encaminhado para o setor ${department.nome}`,
      });
    }
    return { owner_id: card.owner_id ?? null, setor: department.nome as string };
  }

  const { data: queue } = await admin
    .from("crm_distribution_queues")
    .select("id")
    .eq("company_id", companyId)
    .eq("department_id", departmentId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  let ownerId: string | null = queue?.id
    ? await getNextUserInQueue(admin, queue.id as string)
    : null;

  if (!ownerId) {
    const { data: members } = await admin
      .from("department_member")
      .select("user_id")
      .eq("department_id", departmentId);
    const memberIds = ((members ?? []) as Array<{ user_id: string }>).map((member) => member.user_id);

    if (memberIds.length) {
      const { data: openCards } = await admin
        .from("crm_cards")
        .select("owner_id")
        .eq("company_id", companyId)
        .in("owner_id", memberIds);
      const counts = new Map(memberIds.map((id) => [id, 0]));
      for (const openCard of (openCards ?? []) as Array<{ owner_id: string | null }>) {
        if (openCard.owner_id) counts.set(openCard.owner_id, (counts.get(openCard.owner_id) ?? 0) + 1);
      }
      ownerId = memberIds.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0] ?? null;
    }
  }

  const patch: Record<string, string | null> = { department_id: departmentId };
  if (ownerId) patch.owner_id = ownerId;

  const { error } = await admin.from("crm_cards").update(patch).eq("id", card.id);
  if (error) throw new Error(error.message);

  if (options?.logEvent !== false) {
    await admin.from("lead_evento").insert({
      company_id: companyId,
      card_id: card.id,
      tipo: "transferencia_setor",
      descricao: `Transferido automaticamente para o setor ${department.nome}`,
    });
  }

  return { owner_id: ownerId, setor: department.nome as string };
}