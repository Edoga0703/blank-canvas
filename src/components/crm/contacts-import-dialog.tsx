// src/components/crm/contacts-import-dialog.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UserCheck,
  UserPlus,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
  Loader2,
  Info,
} from "lucide-react";
import {
  previewContactsImportFn,
  executeContactsImportFn,
  getGoogleContactsStatusFn,
  syncGoogleContactsNowFn,
} from "@/lib/crm-contacts-import.functions";
import { startGoogleOAuth } from "@/lib/google.functions";
import type { ContactsImportPreviewResult, RawContactInput } from "@/lib/crm-contacts-import.server";

interface ContactsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const COUNTRY_OPTIONS = [
  { code: "58", label: "Venezuela (+58)", flag: "🇻🇪" },
  { code: "57", label: "Colombia (+57)", flag: "🇨🇴" },
  { code: "55", label: "Brasil (+55)", flag: "🇧🇷" },
  { code: "1", label: "Estados Unidos / Canadá (+1)", flag: "🇺🇸" },
  { code: "34", label: "España (+34)", flag: "🇪🇸" },
  { code: "52", label: "México (+52)", flag: "🇲🇽" },
  { code: "54", label: "Argentina (+54)", flag: "🇦🇷" },
  { code: "56", label: "Chile (+56)", flag: "🇨🇱" },
  { code: "51", label: "Perú (+51)", flag: "🇵🇪" },
  { code: "593", label: "Ecuador (+593)", flag: "🇪🇨" },
  { code: "507", label: "Panamá (+507)", flag: "🇵🇦" },
];

export function ContactsImportDialog({ open, onOpenChange, onSuccess }: ContactsImportDialogProps) {
  const [activeTab, setActiveTab] = useState<"file" | "google">("file");
  const [defaultCountry, setDefaultCountry] = useState("58");
  const [isParsing, setIsParsing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [preview, setPreview] = useState<ContactsImportPreviewResult | null>(null);
  const [fileName, setFileName] = useState<string>("");

  // Google status
  const [googleStatus, setGoogleStatus] = useState<{ isConnected: boolean; email: string | null; needsReconnect?: boolean }>({
    isConnected: false,
    email: null,
  });
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewContacts = useServerFn(previewContactsImportFn);
  const executeContacts = useServerFn(executeContactsImportFn);
  const getGoogleStatus = useServerFn(getGoogleContactsStatusFn);
  const syncGoogleContacts = useServerFn(syncGoogleContactsNowFn);
  const startOAuth = useServerFn(startGoogleOAuth);

  // Cargar estado de Google al abrir el diálogo
  const checkGoogleConnection = useCallback(async () => {
    try {
      const res = await getGoogleStatus();
      setGoogleStatus(res);
    } catch (e) {
      console.warn("Error cargando estado de Google:", e);
    }
  }, [getGoogleStatus]);

  useEffect(() => {
    if (open) {
      checkGoogleConnection();
    } else {
      // Limpiar estado al cerrar
      setPreview(null);
      setFileName("");
      setIsParsing(false);
      setIsExecuting(false);
    }
  }, [open, checkGoogleConnection]);

  // Listener para cuando se completa la ventana de Google OAuth
  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.data?.type === "GOOGLE_AUTH_SUCCESS") {
        toast.success("Cuenta de Google conectada exitosamente.");
        checkGoogleConnection();
      }
    }
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [checkGoogleConnection]);

  /** Normaliza encabezados removiendo acentos, caracteres invisibles y mayúsculas */
  function normalizeHeaderKey(key: string): string {
    return String(key || "")
      .replace(/^\uFEFF/, "") // Remueve BOM UTF-8
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  /** Extrae nombres, teléfonos y emails desde cualquier fila heterogénea (Excel, CSV, Google Contacts) */
  function extractContactsFromRows(rows: Record<string, any>[]): RawContactInput[] {
    const contacts: RawContactInput[] = [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;

      // Mapa normalizado de la fila
      const normMap = new Map<string, any>();
      for (const [k, v] of Object.entries(row)) {
        normMap.set(normalizeHeaderKey(k), v);
      }

      // 1. Extraer nombre
      let name: string =
        normMap.get("nombre") ||
        normMap.get("nome") ||
        normMap.get("name") ||
        normMap.get("contacto") ||
        normMap.get("contact") ||
        normMap.get("cliente") ||
        normMap.get("client") ||
        normMap.get("razon social") ||
        normMap.get("display_name") ||
        normMap.get("display name") ||
        normMap.get("nombres") ||
        normMap.get("nombre completo") ||
        "";

      if (!name) {
        const given = normMap.get("given name") || normMap.get("first name") || normMap.get("primer nombre") || normMap.get("prenome") || "";
        const family = normMap.get("family name") || normMap.get("last name") || normMap.get("apellido") || normMap.get("sobrenome") || "";
        name = [given, family].filter(Boolean).join(" ").trim();
      }

      // 2. Extraer email
      let email: string | null =
        normMap.get("email") ||
        normMap.get("e-mail") ||
        normMap.get("correo") ||
        normMap.get("correo electronico") ||
        normMap.get("mail") ||
        null;

      if (!email) {
        for (const [k, v] of normMap.entries()) {
          if (k.includes("email") || k.includes("mail") || k.includes("correo")) {
            if (v && String(v).includes("@")) {
              email = String(v).trim();
              break;
            }
          }
        }
      }

      // 3. Extraer todos los teléfonos presentes en la fila
      const phoneCandidates: string[] = [];

      for (const [k, v] of normMap.entries()) {
        if (!v) continue;
        const strVal = String(v).trim();
        const isPhoneHeader =
          k === "telefono" ||
          k === "telefone" ||
          k === "phone" ||
          k === "numero" ||
          k === "celular" ||
          k === "movil" ||
          k === "mobile" ||
          k === "whatsapp" ||
          k === "tel" ||
          k.includes("phone") ||
          k.includes("telefono") ||
          k.includes("telefone") ||
          k.includes("celular") ||
          k.includes("movil") ||
          k.includes("mobile") ||
          k.includes("whatsapp");

        if (isPhoneHeader && !phoneCandidates.includes(strVal)) {
          phoneCandidates.push(strVal);
        }
      }

      // Si aún no detectó teléfonos por encabezado, busca columnas con números de 8 a 15 dígitos
      if (phoneCandidates.length === 0) {
        for (const val of Object.values(row)) {
          if (!val) continue;
          const digits = String(val).replace(/\D/g, "");
          if (digits.length >= 8 && digits.length <= 15) {
            phoneCandidates.push(String(val).trim());
            break;
          }
        }
      }

      for (const ph of phoneCandidates) {
        const trimmedPh = String(ph).trim();
        if (trimmedPh) {
          contacts.push({
            nome: String(name || "").trim() || null,
            numero: trimmedPh,
            email: email ? String(email).trim().toLowerCase() : null,
          });
        }
      }
    }

    return contacts;
  }

  /** Procesa el archivo (CSV o Excel) */
  async function handleFileSelected(file: File) {
    if (!file) return;
    setIsParsing(true);
    setFileName(file.name);
    setPreview(null);

    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    try {
      let rawRows: Record<string, any>[] = [];

      if (isExcel) {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        const buffer = await file.arrayBuffer();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];

        if (!ws) {
          throw new Error("El archivo Excel no contiene ninguna hoja con datos.");
        }

        const headers: { [col: number]: string } = {};
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            row.eachCell((cell, colNumber) => {
              headers[colNumber] = String(cell.value || "").trim();
            });
          } else {
            const item: Record<string, any> = {};
            row.eachCell((cell, colNumber) => {
              const h = headers[colNumber];
              if (h) {
                // Manejar valores de celda de exceljs (pueden ser texto, objetos de hipervínculo, etc.)
                let val = cell.value;
                if (val && typeof val === "object" && "text" in val) {
                  val = (val as any).text;
                }
                item[h] = val;
              }
            });
            rawRows.push(item);
          }
        });
      } else {
        // CSV con PapaParse
        const parsed = await new Promise<any[]>((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false,
            complete: (results) => resolve(results.data as any[]),
            error: (err) => reject(err),
          });
        });
        rawRows = parsed;
      }

      const extractedContacts = extractContactsFromRows(rawRows);

      if (extractedContacts.length === 0) {
        throw new Error("No se detectaron contactos con número de teléfono en el archivo. Revise las columnas.");
      }

      // Enviar a la vista previa del servidor
      const previewRes = await previewContacts({
        data: {
          rawList: extractedContacts,
          defaultCountryDdi: defaultCountry,
        },
      });

      setPreview(previewRes);
    } catch (err: any) {
      console.error("[contacts-dialog] error parsing file:", err);
      toast.error(err?.message || "Error al procesar el archivo.");
      setPreview(null);
    } finally {
      setIsParsing(false);
    }
  }

  /** Conectar o reconectar cuenta Google */
  async function handleConnectGoogle() {
    setIsGoogleLoading(true);
    try {
      const res = await startOAuth({
        data: {
          intent: "contacts",
          redirectTo: "/app/contatos",
        },
      });

      if (!res.ok) {
        toast.error(res.error || "No fue posible iniciar autenticación con Google.");
        return;
      }

      // Abrir en ventana emergente centrada
      const width = 500;
      const height = 650;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      window.open(
        res.url,
        "GoogleAuth",
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Error al iniciar conexión con Google.");
    } finally {
      setIsGoogleLoading(false);
    }
  }

  /** Sincronizar directamente con Google Contacts */
  async function handleSyncGoogleContacts() {
    setIsGoogleLoading(true);
    setPreview(null);
    try {
      const res = await syncGoogleContacts({
        data: { defaultCountryDdi: defaultCountry },
      });

      if (!res.ok) {
        if (res.needsConnect || res.needsScope) {
          toast.info("Se requiere autorizar el acceso a Google Contacts.");
          await handleConnectGoogle();
        } else {
          toast.error(res.error || "Error al sincronizar con Google Contacts.");
        }
        return;
      }

      setFileName(`Google Contacts (${res.totalFetched} contactos descargados)`);
      setPreview(res.preview);
      toast.success(`Se descargaron ${res.totalFetched} contactos desde Google.`);
    } catch (e: any) {
      toast.error(e?.message || "Fallo en la sincronización con Google.");
    } finally {
      setIsGoogleLoading(false);
    }
  }

  /** Ejecutar la importación real */
  async function handleExecuteImport() {
    if (!preview || preview.normalizedContacts.length === 0) return;

    setIsExecuting(true);
    const tId = toast.loading("Aplicando actualización quirúrgica de contactos...");

    try {
      const res = await executeContacts({
        data: {
          normalizedContacts: preview.normalizedContacts,
        },
      });

      if (res.ok) {
        toast.success(
          `¡Sincronización completada! ${res.updatedCount} nombres actualizados en CRM y chat, ${res.insertedCount} contactos nuevos registrados.`,
          { id: tId, duration: 6000 },
        );
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.error || "Hubo errores durante la importación.", { id: tId });
      }
    } catch (err: any) {
      toast.error(err?.message || "Error al ejecutar la sincronización.", { id: tId });
    } finally {
      setIsExecuting(false);
    }
  }

  /** Descarga una plantilla modelo limpia */
  function downloadTemplate() {
    const sample = [
      { Nombre: "Carlos Pérez", Teléfono: "+58 412 1234567", Email: "carlos@ejemplo.com" },
      { Nombre: "María Gómez", Teléfono: "0414 7654321", Email: "maria@ejemplo.com" },
      { Nombre: "Juan Rodríguez", Teléfono: "+57 300 9876543", Email: "" },
    ];
    const csv = Papa.unparse(sample, { delimiter: ";", header: true });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-contactos-crm.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Plantilla descargada.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-3xl p-6 gap-5 bg-[color:var(--panel)] border-[color:var(--hairline)]">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Upload className="size-5 text-primary" />
            Importar y Sincronizar Contactos
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Actualiza los nombres de tus clientes ya registrados en WhatsApp y CRM de forma 100% segura, sin moverlos de embudo ni afectar conversaciones.
          </DialogDescription>
        </DialogHeader>

        {/* Si no hay preview aún: selector de origen */}
        {!preview ? (
          <div className="space-y-4">
            {/* Selector de país por defecto */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)]">
              <div>
                <Label className="text-xs font-semibold">Prefijo internacional predeterminado</Label>
                <p className="text-[11px] text-muted-foreground">
                  Se aplicará a números locales sin código de país (ej. números que empiezan por 0412...).
                </p>
              </div>
              <Select value={defaultCountry} onValueChange={setDefaultCountry}>
                <SelectTrigger className="w-full sm:w-[220px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map((c) => (
                    <SelectItem key={c.code} value={c.code} className="text-xs">
                      {c.flag} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid grid-cols-2 w-full h-11">
                <TabsTrigger value="file" className="gap-2 text-xs sm:text-sm">
                  <FileSpreadsheet className="size-4" />
                  Archivo Excel / CSV
                </TabsTrigger>
                <TabsTrigger value="google" className="gap-2 text-xs sm:text-sm">
                  <RefreshCw className="size-4" />
                  Google Contacts
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Archivo */}
              <TabsContent value="file" className="space-y-4 mt-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[color:var(--hairline)] hover:border-primary/50 transition-colors rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-[color:var(--panel-2)]/40 hover:bg-[color:var(--panel-2)] text-center"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelected(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {isParsing ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">
                      {isParsing ? "Analizando archivo..." : "Haz clic o arrastra tu archivo aquí"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Compatible con archivos Excel (.xlsx, .xls), CSV estándar y CSV descargado de Google Contacts
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[11px] font-normal">
                      Números con o sin +
                    </Badge>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      Formatos internacionales
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-xs gap-1.5 h-8 text-muted-foreground">
                    <Download className="size-3.5" />
                    Descargar plantilla de ejemplo
                  </Button>
                </div>
              </TabsContent>

              {/* Tab 2: Google Contacts */}
              <TabsContent value="google" className="space-y-4 mt-4">
                <div className="p-5 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)] space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Google People API</span>
                        {googleStatus.isConnected ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                            Conectado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            No conectado
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {googleStatus.isConnected && googleStatus.email
                          ? `Sincroniza directamente con los contactos de ${googleStatus.email}.`
                          : "Conecta tu cuenta de Google para traer tus contactos y actualizar nombres automáticamente."}
                      </p>
                    </div>

                    {googleStatus.isConnected ? (
                      <Button
                        size="sm"
                        onClick={handleSyncGoogleContacts}
                        disabled={isGoogleLoading}
                        className="gap-2 shrink-0"
                      >
                        {isGoogleLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        Sincronizar ahora
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleConnectGoogle}
                        disabled={isGoogleLoading}
                        className="gap-2 shrink-0"
                      >
                        {isGoogleLoading ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                        Conectar Google
                      </Button>
                    )}
                  </div>

                  {googleStatus.needsReconnect && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                      <AlertCircle className="size-4 shrink-0" />
                      <span>El permiso de Google ha expirado o le faltan accesos. Por favor vuelva a conectar su cuenta.</span>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground space-y-1.5 pt-2 border-t border-[color:var(--hairline)]">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-emerald-500 shrink-0" />
                      <span>Sincronización en modo solo lectura de contactos (no modifica tu agenda de Google).</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Info className="size-3.5 text-primary shrink-0" />
                      <span>También puedes exportar tu agenda como CSV desde Google Contacts y subirla en la pestaña "Archivo".</span>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          /* Pantalla de VISTA PREVIA (Paso 2) */
          <div className="space-y-4">
            {/* Header del archivo analizado */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)]">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="size-5 text-primary" />
                <div>
                  <p className="text-xs font-semibold">{fileName || "Contactos procesados"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {preview.validContacts} contactos válidos identificados
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 text-muted-foreground"
                onClick={() => setPreview(null)}
                disabled={isExecuting}
              >
                Cambiar archivo
              </Button>
            </div>

            {/* Tarjetas KPI de impacto */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-1.5 text-blue-600 text-xs font-medium">
                  <UserCheck className="size-4" />
                  Existentes en CRM
                </div>
                <div className="text-xl font-bold mt-1 text-foreground">{preview.toUpdateCount}</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Se actualizará su nombre real</p>
              </div>

              <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                  <UserPlus className="size-4" />
                  Nuevos contactos
                </div>
                <div className="text-xl font-bold mt-1 text-foreground">{preview.toInsertCount}</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Guardados en agenda (no saturan el embudo)</p>
              </div>

              <div className="p-3 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)] col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                  <AlertCircle className="size-4" />
                  Descartados
                </div>
                <div className="text-xl font-bold mt-1 text-foreground">{preview.invalidRows}</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Sin teléfono o inválidos</p>
              </div>
            </div>

            {/* Aviso de seguridad y preservación de embudos */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="size-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>
                <strong>Garantía de integridad:</strong> Los clientes con conversaciones activas NO se mueven de etapa ni de embudo. Los contactos nuevos se registran con su nombre en la agenda y entrarán al embudo únicamente cuando inicien una conversación en WhatsApp.
              </span>
            </div>

            {/* Muestra de actualizaciones */}
            {preview.sampleUpdates.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>Muestra de nombres a actualizar:</span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {preview.toUpdateCount > 5 ? `Mostrando 5 de ${preview.toUpdateCount}` : `${preview.toUpdateCount} en total`}
                  </span>
                </Label>
                <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--panel-2)]/60 overflow-hidden divide-y divide-[color:var(--hairline)]">
                  {preview.sampleUpdates.map((item) => (
                    <div key={item.id} className="p-2.5 flex items-center justify-between text-xs gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0">{item.numero}</span>
                        <span className="truncate text-muted-foreground line-through">
                          {item.currentNome || "Sin nombre"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-medium text-foreground">
                        <ArrowRight className="size-3 text-primary" />
                        <span className="text-primary font-semibold">{item.newNome}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 pt-2 border-t border-[color:var(--hairline)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isExecuting}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>

          {preview && (
            <Button
              size="sm"
              onClick={handleExecuteImport}
              disabled={isExecuting || preview.validContacts === 0}
              className="gap-2 w-full sm:w-auto"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Confirmar e importar {preview.validContacts} contactos
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
