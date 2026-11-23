import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { translations, SUPPORTED_LANGUAGES, type SupportedLanguage, type LanguageOption } from "./translations";
import { LATAM_CURRENCIES, getCurrencyMeta, getDefaultCurrencyForLanguage, type CurrencyOption } from "./currencies";

export interface LanguageContextType {
  language: SupportedLanguage;
  localeCode: string;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (key: string, params?: Record<string, any> | string, fallbackText?: string) => string;
  languages: LanguageOption[];
  currency: string;
  currencySymbol: string;
  currencies: CurrencyOption[];
  setCurrency: (currency: string) => Promise<void>;
  formatDate: (date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number | null | undefined, currency?: string) => string;
  translateDefaultStageName: (name: string) => string;
  translateDefaultPipelineName: (name: string) => string;
}

const STORAGE_KEY = "capiversa_locale";
const CURRENCY_STORAGE_KEY = "capiversa_currency";

export function getSavedCurrency(): string {
  if (typeof window === "undefined") return "USD";
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved && LATAM_CURRENCIES.some((c) => c.code === saved.toUpperCase())) {
      return saved.toUpperCase();
    }
  } catch {}
  return getDefaultCurrencyForLanguage(getSavedLanguage());
}

export function getLocaleCode(lang: SupportedLanguage): string {
  if (lang === "en") return "en-US";
  if (lang === "pt") return "pt-BR";
  return "es-ES";
}

export const DEFAULT_STAGE_TRANSLATIONS: Record<string, string> = {
  // Português
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

  // Español
  "nuevo lead": "crm.stage_novo_lead",
  "nuevo": "crm.stage_novo_lead",
  "lead nuevo": "crm.stage_novo_lead",
  "cualificación": "crm.stage_qualificacao",
  "cualificacion": "crm.stage_qualificacao",
  "calificación": "crm.stage_qualificacao",
  "calificacion": "crm.stage_qualificacao",
  "en atención": "crm.stage_em_atendimento",
  "en atencion": "crm.stage_em_atendimento",
  "en curso": "crm.stage_em_atendimento",
  "en espera": "crm.stage_aguardando",
  "esperando": "crm.stage_aguardando",
  "pendiente": "crm.stage_aguardando",
  "propuesta": "crm.stage_proposta",
  "negociación": "crm.stage_negociacao",
  "negociacion": "crm.stage_negociacao",
  "ganado": "crm.stage_ganho",
  "ganada": "crm.stage_ganho",
  "perdida": "crm.stage_perda",
  "por hacer": "crm.stage_a_fazer",
  "en progreso": "crm.stage_em_andamento",
  "en marcha": "crm.stage_em_andamento",
  "completado": "crm.stage_concluido",
  "finalizado": "crm.stage_concluido",
  "cierre": "crm.stage_fechamento",

  // English
  "new lead": "crm.stage_novo_lead",
  "qualification": "crm.stage_qualificacao",
  "in progress": "crm.stage_em_atendimento",
  "waiting": "crm.stage_aguardando",
  "proposal": "crm.stage_proposta",
  "negotiation": "crm.stage_negociacao",
  "won": "crm.stage_ganho",
  "lost": "crm.stage_perda",
  "to do": "crm.stage_a_fazer",
  "done": "crm.stage_concluido",
  "closing": "crm.stage_fechamento",
  "visit": "crm.stage_visita",
  "contract": "crm.stage_contrato",
};

export const DEFAULT_PIPELINE_TRANSLATIONS: Record<string, string> = {
  // Português
  "funil de vendas": "crm.pipeline_vendas",
  "funil padrão": "crm.pipeline_vendas",
  "funil padrao": "crm.pipeline_vendas",
  "pós-venda": "crm.pipeline_pos_venda",
  "pos-venda": "crm.pipeline_pos_venda",
  "pos venda": "crm.pipeline_pos_venda",
  "suporte": "crm.pipeline_suporte",
  "suporte técnico": "crm.pipeline_suporte",

  // Español
  "embudo de ventas": "crm.pipeline_vendas",
  "embudo estándar": "crm.pipeline_vendas",
  "embudo estandar": "crm.pipeline_vendas",
  "ventas": "crm.pipeline_vendas",
  "post-venta": "crm.pipeline_pos_venda",
  "post venta": "crm.pipeline_pos_venda",
  "soporte": "crm.pipeline_suporte",
  "soporte técnico": "crm.pipeline_suporte",

  // English
  "sales pipeline": "crm.pipeline_vendas",
  "default pipeline": "crm.pipeline_vendas",
  "after-sales": "crm.pipeline_pos_venda",
  "support": "crm.pipeline_suporte",
};

export function getSavedLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "es";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
    if (saved && (saved === "es" || saved === "en" || saved === "pt")) return saved;
  } catch {}
  return "es";
}

export function translateDefaultStageName(name: string, t?: (k: string, p?: any, d?: string) => string): string {
  if (!name) return "";
  const clean = name.toLowerCase().trim();
  const key = DEFAULT_STAGE_TRANSLATIONS[clean];
  if (!key) return name;
  if (t) return t(key, undefined, name);
  const lang = getSavedLanguage();
  const dict = translations[lang] || translations["es"];
  const parts = key.split(".");
  return (dict as any)?.[parts[0]]?.[parts[1]] || name;
}

export function translateDefaultPipelineName(name: string, t?: (k: string, p?: any, d?: string) => string): string {
  if (!name) return "";
  const clean = name.toLowerCase().trim();
  const key = DEFAULT_PIPELINE_TRANSLATIONS[clean];
  if (!key) return name;
  if (t) return t(key, undefined, name);
  const lang = getSavedLanguage();
  const dict = translations[lang] || translations["es"];
  const parts = key.split(".");
  return (dict as any)?.[parts[0]]?.[parts[1]] || name;
}

export function formatDate(date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return "";
  const d = typeof date === "object" ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  const lang = getSavedLanguage();
  return d.toLocaleDateString(getLocaleCode(lang), options);
}

export function formatTime(date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return "";
  const d = typeof date === "object" ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  const lang = getSavedLanguage();
  return d.toLocaleTimeString(getLocaleCode(lang), options);
}

export function formatCurrency(value: number | null | undefined, currency?: string): string {
  if (value == null || isNaN(value)) return "0";
  const lang = getSavedLanguage();
  const curCode = currency || getSavedCurrency();
  const meta = getCurrencyMeta(curCode);
  const locale = meta.localeDefault || getLocaleCode(lang);
  try {
    return value.toLocaleString(locale, {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    });
  } catch {
    return `${meta.symbol} ${value.toLocaleString(locale, {
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    })}`;
  }
}

export function formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions): string {
  if (value == null || isNaN(value)) return "0";
  const lang = getSavedLanguage();
  return value.toLocaleString(getLocaleCode(lang), options);
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectInitialCurrency(): string {
  if (typeof window === "undefined") return "USD";
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved && LATAM_CURRENCIES.some((c) => c.code === saved.toUpperCase())) {
      return saved.toUpperCase();
    }
  } catch {}
  return getDefaultCurrencyForLanguage(detectInitialLanguage());
}

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
  const [currency, setCurrencyState] = useState<string>(detectInitialCurrency);

  useEffect(() => {
    // Sincronizar atributos html
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  // Sincronizar entre pestañas y eventos personalizados
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        const val = e.newValue as SupportedLanguage;
        if (val === "es" || val === "en" || val === "pt") {
          setLanguageState(val);
        }
      } else if (e.key === CURRENCY_STORAGE_KEY && e.newValue) {
        setCurrencyState(e.newValue);
      }
    }
    function handleCustom(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.language && (detail.language === "es" || detail.language === "en" || detail.language === "pt")) {
        setLanguageState(detail.language);
      }
    }
    function handleCustomCurrency(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.currency) {
        setCurrencyState(detail.currency);
      }
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener("capiversa-language-changed", handleCustom);
    window.addEventListener("capiversa-currency-changed", handleCustomCurrency);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("capiversa-language-changed", handleCustom);
      window.removeEventListener("capiversa-currency-changed", handleCustomCurrency);
    };
  }, []);

  useEffect(() => {
    // Hidratar idioma y moneda guardados en base de datos si localStorage no fue inicializado aún
    let active = true;
    async function hydrateFromDB() {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;

        // 1. Priorizar metadatos de usuario si existen
        const userPref = session.session.user.user_metadata?.preferred_language;
        if (userPref && (userPref === "es" || userPref === "en" || userPref === "pt")) {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (active && saved !== userPref) {
            setLanguageState(userPref as SupportedLanguage);
            localStorage.setItem(STORAGE_KEY, userPref);
          }
        }

        // 2. Revisar configuración de agente de la empresa
        const { data: cu } = await supabase
          .from("company_user")
          .select("company_id")
          .eq("user_id", session.session.user.id)
          .limit(1)
          .maybeSingle();
        if (cu?.company_id) {
          const { data: cfg } = await (supabase as any)
            .from("agent_config")
            .select("idioma, moeda")
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
          if ((cfg as any)?.moeda) {
            const savedCur = localStorage.getItem(CURRENCY_STORAGE_KEY);
            if (!savedCur && active) {
              setCurrencyState((cfg as any).moeda);
              localStorage.setItem(CURRENCY_STORAGE_KEY, (cfg as any).moeda);
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

  const setCurrency = useCallback(async (newCur: string) => {
    const valid = LATAM_CURRENCIES.find((c) => c.code.toUpperCase() === newCur?.trim().toUpperCase())?.code || "USD";
    setCurrencyState(valid);
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, valid);
      window.dispatchEvent(new CustomEvent("capiversa-currency-changed", { detail: { currency: valid } }));
    } catch {}

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
            .update({ moeda: valid } as any)
            .eq("company_id", cu.company_id);
        }
      }
    } catch {
      // Silent catch: offline or unauthenticated
    }
  }, []);

  const setLanguage = useCallback(async (newLang: SupportedLanguage) => {
    setLanguageState(newLang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLang;
    }
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
        // Sincronizar metadatos de usuario en auth para persistir entre sesiones
        void supabase.auth.updateUser({ data: { preferred_language: newLang } });

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

  const currencySymbol = useMemo(() => getCurrencyMeta(currency).symbol, [currency]);

  const formatCurrency = useCallback((value: number | null | undefined, currencyOverride?: string) => {
    if (value == null || isNaN(value)) return "0";
    const curCode = currencyOverride || currency;
    const meta = getCurrencyMeta(curCode);
    const locale = meta.localeDefault || localeCode;
    try {
      return value.toLocaleString(locale, {
        style: "currency",
        currency: meta.code,
        minimumFractionDigits: meta.decimals,
        maximumFractionDigits: meta.decimals,
      });
    } catch {
      return `${meta.symbol} ${value.toLocaleString(locale, {
        minimumFractionDigits: meta.decimals,
        maximumFractionDigits: meta.decimals,
      })}`;
    }
  }, [currency, localeCode]);

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
      currency,
      currencySymbol,
      currencies: LATAM_CURRENCIES,
      setCurrency,
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
    const lang = getSavedLanguage();
    const loc = getLocaleCode(lang);
    const fallbackT = (key: string, params?: Record<string, any> | string, def?: string) => {
      const defaultStr = typeof params === "string" ? params : def || key;
      const parts = key.split(".");
      let cur: any = (translations as any)[lang];
      for (const part of parts) {
        if (cur && typeof cur === "object" && part in cur) {
          cur = cur[part];
        } else {
          cur = undefined;
          break;
        }
      }
      if (typeof cur !== "string") {
        let ptCur: any = (translations as any)["pt"];
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
      let res = typeof cur === "string" ? cur : defaultStr;
      if (params && typeof params === "object") {
        for (const [pKey, pVal] of Object.entries(params)) {
          res = res.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal));
        }
      }
      return res;
    };
    const curCode = getSavedCurrency();
    const curMeta = getCurrencyMeta(curCode);
    return {
      language: lang,
      localeCode: loc,
      setLanguage: async () => {},
      t: fallbackT,
      languages: SUPPORTED_LANGUAGES,
      currency: curCode,
      currencySymbol: curMeta.symbol,
      currencies: LATAM_CURRENCIES,
      setCurrency: async () => {},
      formatDate: (d, opt) => (d ? new Date(d).toLocaleDateString(loc, opt) : ""),
      formatTime: (d, opt) => (d ? new Date(d).toLocaleTimeString(loc, opt) : ""),
      formatNumber: (v, opt) => (v != null ? Number(v).toLocaleString(loc, opt) : "0"),
      formatCurrency: (v, c) => formatCurrency(v, c),
      translateDefaultStageName: (n) => n,
      translateDefaultPipelineName: (n) => n,
    };
  }
  return context;
}
