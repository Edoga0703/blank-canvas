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

    const { assertCompanyCanWrite } = await import("@/lib/billing/access.server");
    await assertCompanyCanWrite(companyId);

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
