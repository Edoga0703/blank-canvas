// src/lib/crm-contacts-import.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  previewContactsImport,
  executeContactsImport,
  type RawContactInput,
  type NormalizedContactItem,
} from "./crm-contacts-import.server";

/**
 * Vista previa de importación: analiza el archivo o lista sin realizar ningún cambio en la base de datos.
 * Clasifica los contactos en:
 * - Existentes (solo se actualizará su nombre e información de contacto sin tocar etapas ni embudos).
 * - Nuevos (se insertarán en la etapa inicial).
 */
export const previewContactsImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rawList: RawContactInput[]; defaultCountryDdi?: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) throw new Error("Empresa no encontrada");

    const rawList = Array.isArray(data.rawList) ? data.rawList : [];
    const defaultCountryDdi = (data.defaultCountryDdi || "58").replace(/\D/g, "") || "58";

    const preview = await previewContactsImport(companyId, rawList, defaultCountryDdi);
    return preview;
  });

/**
 * Ejecuta la importación quirúrgica y segura:
 * - Actualiza nombre y mensajes para contactos existentes sin moverlos de etapa.
 * - Inserta los contactos nuevos respetando los límites del plan contratado.
 */
export const executeContactsImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { normalizedContacts: NormalizedContactItem[] }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) throw new Error("Empresa no encontrada");

    const contacts = Array.isArray(data.normalizedContacts) ? data.normalizedContacts : [];
    if (contacts.length === 0) {
      return { ok: true, totalProcessed: 0, updatedCount: 0, insertedCount: 0, errorsCount: 0 };
    }

    // Verificar límites del plan si hay contactos nuevos
    try {
      const { getCompanyPlanUsage } = await import("@/lib/plan-limits.server");
      const { plan, usage } = await getCompanyPlanUsage(companyId);

      // Contar cuántos son nuevos paginando en lotes de 500 para soportar listas grandes sin truncar PostgREST
      const uniqueNumbers = contacts.map((c) => c.numero);
      const existingSet = new Set<string>();
      const CHUNK = 500;
      for (let i = 0; i < uniqueNumbers.length; i += CHUNK) {
        const slice = uniqueNumbers.slice(i, i + CHUNK);
        const { data: rows } = await (supabaseAdmin as any)
          .from("crm_cards")
          .select("numero")
          .eq("company_id", companyId)
          .in("numero", slice);
        for (const r of rows || []) {
          existingSet.add(r.numero);
        }
      }
      const newContactsCount = contacts.filter((c) => !existingSet.has(c.numero)).length;

      if (newContactsCount > 0 && usage.contatos + newContactsCount > plan.limites.contatos) {
        const restante = Math.max(0, plan.limites.contatos - usage.contatos);
        throw new Error(
          `La importación de ${newContactsCount} contactos nuevos excede el límite de su plan (${plan.limites.contatos.toLocaleString()}). Cupo disponible: ${restante.toLocaleString()}.`,
        );
      }
    } catch (planErr: any) {
      // Si el error fue por exceso de límite, propagarlo
      if (planErr?.message?.includes("excede el límite")) {
        throw planErr;
      }
      // Otros errores de plan no bloquean la importación
      console.warn("[contacts-import] Plan check warning:", planErr?.message);
    }

    const result = await executeContactsImport(companyId, context.userId, contacts);
    return result;
  });

/**
 * Obtiene el estado de conexión de Google Integration para la empresa actual.
 */
export const getGoogleContactsStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) return { isConnected: false, email: null };

    const { data: gi } = await (supabaseAdmin as any)
      .from("google_integration")
      .select("conectado, email, precisa_reconectar")
      .eq("company_id", companyId)
      .maybeSingle();

    return {
      isConnected: Boolean(gi?.conectado && !gi?.precisa_reconectar),
      email: gi?.email ?? null,
      needsReconnect: Boolean(gi?.precisa_reconectar),
    };
  });

/**
 * Descarga los contactos de Google People API y genera la vista previa
 * para que el usuario confirme antes de guardar.
 */
export const syncGoogleContactsNowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { defaultCountryDdi?: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) throw new Error("Empresa no encontrada");

    const { fetchGoogleContacts } = await import("@/lib/google.server");
    const fetchRes = await fetchGoogleContacts(supabaseAdmin, companyId);

    if (!fetchRes.ok) {
      return {
        ok: false,
        needsConnect: !fetchRes.needsScope,
        needsScope: Boolean(fetchRes.needsScope),
        error: fetchRes.error || "No fue posible conectar con Google Contacts.",
      };
    }

    const rawList = fetchRes.contacts || [];
    const defaultCountryDdi = (data?.defaultCountryDdi || "58").replace(/\D/g, "") || "58";
    const preview = await previewContactsImport(companyId, rawList, defaultCountryDdi);

    return {
      ok: true,
      totalFetched: rawList.length,
      preview,
    };
  });
