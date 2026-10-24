import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { translations, SUPPORTED_LANGUAGES, type SupportedLanguage, type LanguageOption } from "./translations";

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (key: string, params?: Record<string, any> | string, fallbackText?: string) => string;
  languages: LanguageOption[];
}

const STORAGE_KEY = "capiversa_locale";

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "es"; // Default to Spanish as requested by user
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
    if (saved && (saved === "es" || saved === "en" || saved === "pt")) {
      return saved;
    }
    const navLang = navigator.language?.toLowerCase() || "";
    if (navLang.startsWith("es")) return "es";
    if (navLang.startsWith("en")) return "en";
    if (navLang.startsWith("pt")) return "pt";
  } catch (e) {
    // ignore
  }
  return "es";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(detectInitialLanguage);

  useEffect(() => {
    // Sincronizar atributos html
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback(async (newLang: SupportedLanguage) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      window.dispatchEvent(new CustomEvent("capiversa-language-changed", { detail: { language: newLang } }));
    } catch (e) {
      // ignore
    }

    // Opcionalmente actualizar idioma del bot / empresa en segundo plano
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user) {
        // Actualizar agente de IA activo para mantenerlo alineado al 100%
        await supabase
          .from("agent_config")
          .update({ idioma: newLang } as any)
          .eq("is_default", true);
      }
    } catch {
      // Silent catch: offline or unauthenticated
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, any> | string, fallbackText?: string): string => {
      let defaultStr = typeof params === "string" ? params : fallbackText || key;
      const dict = translations[language] || translations["es"];

      // Resolver claves anidadas tipo "crm.audit_lead"
      const parts = key.split(".");
      let cur: any = dict;
      for (const part of parts) {
        if (cur && typeof cur === "object" && part in cur) {
          cur = cur[part];
        } else {
          cur = undefined;
          break;
        }
      }

      // Si no existe en el idioma actual, fallback a español, luego a portugués
      if (typeof cur !== "string") {
        let fallbackCur: any = translations["es"];
        for (const part of parts) {
          if (fallbackCur && typeof fallbackCur === "object" && part in fallbackCur) {
            fallbackCur = fallbackCur[part];
          } else {
            fallbackCur = undefined;
            break;
          }
        }
        if (typeof fallbackCur === "string") {
          cur = fallbackCur;
        } else {
          let ptCur: any = translations["pt"];
          for (const part of parts) {
            if (ptCur && typeof ptCur === "object" && part in ptCur) {
              ptCur = ptCur[part];
            } else {
              ptCur = undefined;
              break;
            }
          }
          if (typeof ptCur === "string") cur = ptCur;
        }
      }

      let res = typeof cur === "string" ? cur : defaultStr;

      // Interpolar parámetros tipo {name} o {count}
      if (params && typeof params === "object") {
        for (const [pKey, pVal] of Object.entries(params)) {
          res = res.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal));
        }
      }

      return res;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Fallback gracioso si se usa fuera de provider
    const fallbackT = (key: string, params?: Record<string, any> | string, def?: string) =>
      typeof params === "string" ? params : def || key;
    return {
      language: "es" as SupportedLanguage,
      setLanguage: async () => {},
      t: fallbackT,
      languages: SUPPORTED_LANGUAGES,
    };
  }
  return context;
}
