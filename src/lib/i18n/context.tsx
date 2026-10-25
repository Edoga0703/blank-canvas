import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { translations, SUPPORTED_LANGUAGES, type SupportedLanguage, type LanguageOption } from "./translations";

export interface LanguageContextType {
  language: SupportedLanguage;
  localeCode: string;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (key: string, params?: Record<string, any> | string, fallbackText?: string) => string;
  languages: LanguageOption[];
  formatDate: (date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number | null | undefined, currency?: string) => string;
  translateDefaultStageName: (name: string) => string;
  translateDefaultPipelineName: (name: string) => string;
}

const STORAGE_KEY = "capiversa_locale";

export function getLocaleCode(lang: SupportedLanguage): string {
  if (lang === "en") return "en-US";
  if (lang === "pt") return "pt-BR";
  return "es-ES";
}

const DEFAULT_STAGE_TRANSLATIONS: Record<string, string> = {
  "novo lead": "crm.stage_novo_lead",
  "novo": "crm.stage_novo_lead",
  "qualificação": "crm.stage_qualificacao",
  "qualificacao": "crm.stage_qualificacao",
  "em atendimento": "crm.stage_em_atendimento",
  "atendimento": "crm.stage_em_atendimento",
  "aguardando": "crm.stage_aguardando",
  "proposta": "crm.stage_proposta",
  "negociação": "crm.stage_negociacao",
  "negociacao": "crm.stage_negociacao",
  "ganho": "crm.stage_ganho",
  "perdido": "crm.stage_perda",
  "perda": "crm.stage_perda",
  "a fazer": "crm.stage_a_fazer",
  "em andamento": "crm.stage_em_andamento",
  "concluído": "crm.stage_concluido",
  "concluido": "crm.stage_concluido",
  "fechamento": "crm.stage_fechamento",
  "visita": "crm.stage_visita",
  "contrato": "crm.stage_contrato",
};

const DEFAULT_PIPELINE_TRANSLATIONS: Record<string, string> = {
  "funil de vendas": "crm.pipeline_vendas",
  "funil padrão": "crm.pipeline_vendas",
  "funil padrao": "crm.pipeline_vendas",
  "pós-venda": "crm.pipeline_pos_venda",
  "pos-venda": "crm.pipeline_pos_venda",
  "pos venda": "crm.pipeline_pos_venda",
  "suporte": "crm.pipeline_suporte",
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "es";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
    if (saved && (saved === "es" || saved === "en" || saved === "pt")) {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return "es"; // Default to Spanish
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(detectInitialLanguage);

  useEffect(() => {
    // Sincronizar atributos html
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  useEffect(() => {
    // Hidratar idioma guardado en base de datos si localStorage no fue inicializado aún
    let active = true;
    async function hydrateFromDB() {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;
        const { data: cu } = await supabase
          .from("company_user")
          .select("company_id")
          .eq("user_id", session.session.user.id)
          .limit(1)
          .maybeSingle();
        if (cu?.company_id) {
          const { data: cfg } = await supabase
            .from("agent_config")
            .select("idioma")
            .eq("company_id", cu.company_id)
            .limit(1)
            .maybeSingle();
          if (cfg?.idioma && (cfg.idioma === "es" || cfg.idioma === "en" || cfg.idioma === "pt")) {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved && active) {
              setLanguageState(cfg.idioma as SupportedLanguage);
              localStorage.setItem(STORAGE_KEY, cfg.idioma);
            }
          }
        }
      } catch {
        // ignore
      }
    }
    void hydrateFromDB();
    return () => { active = false; };
  }, []);

  const setLanguage = useCallback(async (newLang: SupportedLanguage) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      window.dispatchEvent(new CustomEvent("capiversa-language-changed", { detail: { language: newLang } }));
    } catch (e) {
      // ignore
    }

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user) {
        const { data: cu } = await supabase
          .from("company_user")
          .select("company_id")
          .eq("user_id", session.session.user.id)
          .limit(1)
          .maybeSingle();
        if (cu?.company_id) {
          await supabase
            .from("agent_config")
            .update({ idioma: newLang } as any)
            .eq("company_id", cu.company_id);
        }
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

  const localeCode = useMemo(() => getLocaleCode(language), [language]);

  const formatDate = useCallback((date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions) => {
    if (!date) return "";
    const d = typeof date === "object" ? date : new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(localeCode, options);
  }, [localeCode]);

  const formatTime = useCallback((date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions) => {
    if (!date) return "";
    const d = typeof date === "object" ? date : new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(localeCode, options);
  }, [localeCode]);

  const formatNumber = useCallback((value: number | null | undefined, options?: Intl.NumberFormatOptions) => {
    if (value == null || isNaN(value)) return "0";
    return value.toLocaleString(localeCode, options);
  }, [localeCode]);

  const formatCurrency = useCallback((value: number | null | undefined, currency?: string) => {
    if (value == null || isNaN(value)) return "0";
    const cur = currency || (language === "pt" ? "BRL" : "USD");
    try {
      return value.toLocaleString(localeCode, { style: "currency", currency: cur });
    } catch {
      return value.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }, [language, localeCode]);

  const translateDefaultStageName = useCallback((name: string): string => {
    if (!name) return "";
    const clean = name.toLowerCase().trim();
    const key = DEFAULT_STAGE_TRANSLATIONS[clean];
    return key ? t(key, undefined, name) : name;
  }, [t]);

  const translateDefaultPipelineName = useCallback((name: string): string => {
    if (!name) return "";
    const clean = name.toLowerCase().trim();
    const key = DEFAULT_PIPELINE_TRANSLATIONS[clean];
    return key ? t(key, undefined, name) : name;
  }, [t]);

  return (
    <LanguageContext.Provider value={{
      language,
      localeCode,
      setLanguage,
      t,
      languages: SUPPORTED_LANGUAGES,
      formatDate,
      formatTime,
      formatNumber,
      formatCurrency,
      translateDefaultStageName,
      translateDefaultPipelineName,
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    const fallbackT = (key: string, params?: Record<string, any> | string, def?: string) =>
      typeof params === "string" ? params : def || key;
    return {
      language: "es" as SupportedLanguage,
      localeCode: "es-ES",
      setLanguage: async () => {},
      t: fallbackT,
      languages: SUPPORTED_LANGUAGES,
      formatDate: (d, opt) => (d ? new Date(d).toLocaleDateString("es-ES", opt) : ""),
      formatTime: (d, opt) => (d ? new Date(d).toLocaleTimeString("es-ES", opt) : ""),
      formatNumber: (v, opt) => (v != null ? Number(v).toLocaleString("es-ES", opt) : "0"),
      formatCurrency: (v) => (v != null ? `$ ${Number(v).toFixed(2)}` : "$ 0.00"),
      translateDefaultStageName: (n) => n,
      translateDefaultPipelineName: (n) => n,
    };
  }
  return context;
}
