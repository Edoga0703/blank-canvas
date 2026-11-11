// src/lib/crm-contacts-import.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface RawContactInput {
  nome?: string | null;
  numero?: string | number | null;
  email?: string | null;
}

export interface NormalizedContactItem {
  nome: string;
  numero: string;
  email?: string | null;
  originalPhone: string;
}

export interface ContactsImportPreviewResult {
  totalRows: number;
  validContacts: number;
  invalidRows: number;
  toUpdateCount: number;
  toInsertCount: number;
  sampleUpdates: Array<{ id: string; numero: string; currentNome: string | null; newNome: string }>;
  sampleInserts: Array<{ numero: string; nome: string; email?: string | null }>;
  normalizedContacts: NormalizedContactItem[];
}

export interface ContactsImportExecutionResult {
  ok: boolean;
  totalProcessed: number;
  updatedCount: number;
  insertedCount: number;
  errorsCount: number;
  error?: string;
}

/**
 * Normaliza cualquier formato telefónico (+ o sin +, paréntesis, guiones, formatos locales con 0, etc.)
 * para que coincida exactamente con lo que WhatsApp registra en `crm_cards.numero`.
 */
export function normalizeContactPhone(
  raw: string | number | null | undefined,
  defaultCountryDdi: string = "58",
): { clean: string; isValid: boolean; original: string } {
  if (!raw) return { clean: "", isValid: false, original: "" };
  const original = String(raw).trim();

  // 1. Detecta si explícitamente venía con prefijo '+' internacional
  const hadPlus = original.startsWith("+");

  // 2. Extrae únicamente dígitos
  let digits = original.replace(/\D/g, "");
  if (!digits || digits.length < 7) {
    return { clean: "", isValid: false, original };
  }

  // 3. Elimina prefijos de discado internacional '00'
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  const ddi = defaultCountryDdi.replace(/\D/g, "") || "58";

  // 4. Manejo de '0' inicial nacional (ej. Venezuela: 0412..., 0414..., 0424..., 0416..., 0426..., 0422...)
  if (digits.startsWith("0") && digits.length >= 10) {
    if (ddi === "58" && digits.length === 11) {
      digits = "58" + digits.slice(1);
    } else {
      digits = ddi + digits.slice(1);
    }
  }

  // 5. Si venía con '+', ya es un número internacional completo garantizado
  if (hadPlus) {
    if (digits.length >= 10 && digits.length <= 15) {
      return { clean: digits, isValid: true, original };
    }
  }

  // 6. Detección inteligente por código de país
  // Venezuela: 10 dígitos locales que comienzan por códigos móviles conocidos
  if (digits.length === 10 && /^(412|414|424|416|426|422)/.test(digits)) {
    digits = "58" + digits;
  }
  // Colombia: 10 dígitos comenzando por 3
  else if (digits.length === 10 && digits.startsWith("3") && ddi === "57") {
    digits = "57" + digits;
  }
  // Brasil: 10 u 11 dígitos
  else if ((digits.length === 10 || digits.length === 11) && ddi === "55" && !digits.startsWith("55")) {
    digits = "55" + digits;
  }
  // USA / Canadá: 10 dígitos
  else if (digits.length === 10 && ddi === "1" && !digits.startsWith("1")) {
    digits = "1" + digits;
  }
  // Fallback para números nacionales de 8-10 dígitos que no tengan el DDI
  else if (digits.length >= 8 && digits.length <= 10 && !digits.startsWith(ddi)) {
    digits = ddi + digits;
  }

  const isValid = digits.length >= 10 && digits.length <= 15;
  return { clean: digits, isValid, original };
}

/**
 * Prepara y desglosa los contactos a importar contra la base de datos real.
 * Permite mostrar la vista previa antes de ejecutar cualquier cambio destructivo.
 */
export async function previewContactsImport(
  companyId: string,
  rawList: RawContactInput[],
  defaultCountryDdi: string = "58",
): Promise<ContactsImportPreviewResult> {
  const normalizedMap = new Map<string, NormalizedContactItem>();
  let invalidRows = 0;

  for (const item of rawList || []) {
    const rawName = String(item.nome ?? "").trim();
    const phoneRes = normalizeContactPhone(item.numero, defaultCountryDdi);

    if (!phoneRes.isValid) {
      invalidRows++;
      continue;
    }

    // Si viene sin nombre, usa una etiqueta mínima o el número
    const resolvedName = rawName || `Contacto ${phoneRes.clean.slice(-4)}`;
    const email = item.email ? String(item.email).trim().toLowerCase() : null;

    // Deduplica dentro del lote cargado manteniendo el nombre más descriptivo
    if (!normalizedMap.has(phoneRes.clean) || rawName.length > (normalizedMap.get(phoneRes.clean)?.nome.length || 0)) {
      normalizedMap.set(phoneRes.clean, {
        nome: resolvedName,
        numero: phoneRes.clean,
        email,
        originalPhone: phoneRes.original,
      });
    }
  }

  const normalizedContacts = Array.from(normalizedMap.values());
  const uniqueNumbers = normalizedContacts.map((c) => c.numero);

  // Consulta por lotes de 500 para verificar cuáles ya existen en crm_cards
  const existingMap = new Map<string, { id: string; numero: string; nome: string | null; email: string | null }>();
  const CHUNK_SIZE = 500;

  for (let i = 0; i < uniqueNumbers.length; i += CHUNK_SIZE) {
    const slice = uniqueNumbers.slice(i, i + CHUNK_SIZE);
    const { data: rows } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id, numero, nome, email")
      .eq("company_id", companyId)
      .in("numero", slice);

    for (const r of rows || []) {
      existingMap.set(r.numero, r);
    }
  }

  const sampleUpdates: Array<{ id: string; numero: string; currentNome: string | null; newNome: string }> = [];
  const sampleInserts: Array<{ numero: string; nome: string; email?: string | null }> = [];
  let toUpdateCount = 0;
  let toInsertCount = 0;

  for (const c of normalizedContacts) {
    const ex = existingMap.get(c.numero);
    if (ex) {
      toUpdateCount++;
      if (sampleUpdates.length < 5) {
        sampleUpdates.push({
          id: ex.id,
          numero: c.numero,
          currentNome: ex.nome,
          newNome: c.nome,
        });
      }
    } else {
      toInsertCount++;
      if (sampleInserts.length < 5) {
        sampleInserts.push({
          numero: c.numero,
          nome: c.nome,
          email: c.email,
        });
      }
    }
  }

  return {
    totalRows: rawList.length,
    validContacts: normalizedContacts.length,
    invalidRows,
    toUpdateCount,
    toInsertCount,
    sampleUpdates,
    sampleInserts,
    normalizedContacts,
  };
}

/**
 * Ejecuta la actualización e importación QUIRÚRGICA:
 * - Para contactos existentes: SOLO actualiza `nome` (y email si aplica) en crm_cards y mensagens.
 *   ¡NO toca etapa, ni embudo, ni responsable, ni valor, ni historial de chat!
 * - Para contactos nuevos: Inserta en crm_cards en la primera etapa con su nombre real.
 */
export async function executeContactsImport(
  companyId: string,
  userId: string,
  normalizedContacts: NormalizedContactItem[],
): Promise<ContactsImportExecutionResult> {
  if (!normalizedContacts || normalizedContacts.length === 0) {
    return { ok: true, totalProcessed: 0, updatedCount: 0, insertedCount: 0, errorsCount: 0 };
  }

  const uniqueNumbers = normalizedContacts.map((c) => c.numero);
  const existingMap = new Map<string, { id: string; numero: string; nome: string | null; email: string | null }>();
  const CHUNK_SIZE = 500;

  // 1. Mapeo de existentes en crm_cards
  for (let i = 0; i < uniqueNumbers.length; i += CHUNK_SIZE) {
    const slice = uniqueNumbers.slice(i, i + CHUNK_SIZE);
    const { data: rows } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id, numero, nome, email")
      .eq("company_id", companyId)
      .in("numero", slice);

    for (const r of rows || []) {
      existingMap.set(r.numero, r);
    }
  }

  const toUpdate: Array<{ id: string; numero: string; newNome: string; email?: string | null }> = [];
  const toInsert: NormalizedContactItem[] = [];

  for (const c of normalizedContacts) {
    const ex = existingMap.get(c.numero);
    if (ex) {
      toUpdate.push({
        id: ex.id,
        numero: c.numero,
        newNome: c.nome,
        email: c.email || ex.email || null,
      });
    } else {
      toInsert.push(c);
    }
  }

  let updatedCount = 0;
  let insertedCount = 0;
  let errorsCount = 0;

  // 2. ACTUALIZACIÓN QUIRÚRGICA DE CONTACTOS EXISTENTES
  // Para garantizar máximo rendimiento y cero conflictos, procesamos en lotes concurrentes
  const CONCURRENCY = 15;
  for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
    const slice = toUpdate.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (item) => {
        try {
          const updateCardPatch: Record<string, any> = {
            nome: item.newNome,
            updated_at: new Date().toISOString(),
          };
          if (item.email) updateCardPatch.email = item.email;

          // Actualiza SOLO nombre y fecha en el card (etapa, embudo, dueño e historial quedan 100% intactos)
          const { error: cardErr } = await (supabaseAdmin as any)
            .from("crm_cards")
            .update(updateCardPatch)
            .eq("id", item.id)
            .eq("company_id", companyId);

          if (cardErr) throw cardErr;

          // Actualiza el nombre del contacto en las conversaciones de mensajes
          const { error: msgErr } = await (supabaseAdmin as any)
            .from("mensagens")
            .update({ contato_nome: item.newNome })
            .eq("company_id", companyId)
            .eq("numero", item.numero);

          if (msgErr) throw msgErr;

          updatedCount++;
        } catch (e) {
          console.error(`[contacts-import] Error actualizando contacto ${item.numero}:`, e);
          errorsCount++;
        }
      }),
    );
  }

  // 3. INSERCIÓN SEGURA DE CONTACTOS NUEVOS
  if (toInsert.length > 0) {
    // Buscar la etapa inicial por defecto de la empresa
    const { data: firstStage } = await (supabaseAdmin as any)
      .from("crm_stage")
      .select("id, pipeline_id, nome")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();

    const INSERT_CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const slice = toInsert.slice(i, i + INSERT_CHUNK);
      const nowIso = new Date().toISOString();

      const payload = slice.map((c) => ({
        company_id: companyId,
        user_id: userId,
        numero: c.numero,
        nome: c.nome,
        email: c.email || null,
        pipeline_id: firstStage?.pipeline_id || null,
        stage_id: firstStage?.id || null,
        status: firstStage?.nome || "Contato da agenda",
        tipo_contato: "interno",
        ultima_mensagem: null,
        ultima_em: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      }));

      const { error: insertError } = await (supabaseAdmin as any)
        .from("crm_cards")
        .insert(payload);

      if (insertError) {
        console.error("[contacts-import] Error insertando lote nuevo:", insertError);
        errorsCount += slice.length;
      } else {
        insertedCount += slice.length;
      }
    }
  }

  return {
    ok: errorsCount === 0 || updatedCount + insertedCount > 0,
    totalProcessed: normalizedContacts.length,
    updatedCount,
    insertedCount,
    errorsCount,
  };
}
