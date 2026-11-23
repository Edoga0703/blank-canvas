// Catálogo de monedas de América Latina (LATAM) para Capiconversa CRM
// Soporta símbolos, decimales habituales y locales estándar para formateo financiero

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  country: string;
  decimals: number;
  localeDefault: string;
}

export const LATAM_CURRENCIES: CurrencyOption[] = [
  { code: "USD", symbol: "$", flag: "🇺🇸", country: "Internacional / Ecuador", name: "Dólar Estadounidense", decimals: 2, localeDefault: "es-US" },
  { code: "BRL", symbol: "R$", flag: "🇧🇷", country: "Brasil", name: "Real Brasileño", decimals: 2, localeDefault: "pt-BR" },
  { code: "MXN", symbol: "$", flag: "🇲🇽", country: "México", name: "Peso Mexicano", decimals: 2, localeDefault: "es-MX" },
  { code: "COP", symbol: "$", flag: "🇨🇴", country: "Colombia", name: "Peso Colombiano", decimals: 0, localeDefault: "es-CO" },
  { code: "ARS", symbol: "$", flag: "🇦🇷", country: "Argentina", name: "Peso Argentino", decimals: 2, localeDefault: "es-AR" },
  { code: "CLP", symbol: "$", flag: "🇨🇱", country: "Chile", name: "Peso Chileno", decimals: 0, localeDefault: "es-CL" },
  { code: "PEN", symbol: "S/", flag: "🇵🇪", country: "Perú", name: "Sol Peruano", decimals: 2, localeDefault: "es-PE" },
  { code: "UYU", symbol: "$U", flag: "🇺🇾", country: "Uruguay", name: "Peso Uruguayo", decimals: 2, localeDefault: "es-UY" },
  { code: "BOB", symbol: "Bs.", flag: "🇧🇴", country: "Bolivia", name: "Boliviano", decimals: 2, localeDefault: "es-BO" },
  { code: "PYG", symbol: "₲", flag: "🇵🇾", country: "Paraguay", name: "Guaraní Paraguayo", decimals: 0, localeDefault: "es-PY" },
  { code: "VES", symbol: "Bs.", flag: "🇻🇪", country: "Venezuela", name: "Bolívar Venezolano", decimals: 2, localeDefault: "es-VE" },
  { code: "GTQ", symbol: "Q", flag: "🇬🇹", country: "Guatemala", name: "Quetzal", decimals: 2, localeDefault: "es-GT" },
  { code: "CRC", symbol: "₡", flag: "🇨🇷", country: "Costa Rica", name: "Colón Costarricense", decimals: 0, localeDefault: "es-CR" },
  { code: "DOP", symbol: "RD$", flag: "🇩🇴", country: "República Dominicana", name: "Peso Dominicano", decimals: 2, localeDefault: "es-DO" },
];

export function getCurrencyMeta(code?: string | null): CurrencyOption {
  if (!code) return LATAM_CURRENCIES[0];
  const found = LATAM_CURRENCIES.find((c) => c.code.toUpperCase() === code.trim().toUpperCase());
  return found || LATAM_CURRENCIES[0];
}

export function getDefaultCurrencyForLanguage(lang: string): string {
  if (lang === "pt") return "BRL";
  return "USD";
}
