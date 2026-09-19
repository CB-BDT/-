const COUNTRY_LANG: Record<string, string> = {
  CN: "zh", TW: "zh", HK: "zh", MO: "zh", SG: "zh",
  US: "en", GB: "en", AU: "en", CA: "en", NZ: "en", IE: "en", PH: "en", NG: "en", ZA: "en", KE: "en",
  IN: "hi",
  ES: "es", MX: "es", AR: "es", CO: "es", PE: "es", CL: "es", VE: "es", EC: "es",
  BO: "es", PY: "es", UY: "es", GT: "es", CU: "es", DO: "es", HN: "es", SV: "es",
  NI: "es", CR: "es", PA: "es", PR: "es",
  BR: "pt", PT: "pt", AO: "pt", MZ: "pt",
  FR: "fr", BE: "fr", SN: "fr", CI: "fr", CM: "fr", ML: "fr", BF: "fr", NE: "fr",
  TG: "fr", BJ: "fr", GA: "fr", CD: "fr", MG: "fr",
  DE: "de", AT: "de", CH: "de", LI: "de",
  IT: "it", SM: "it", VA: "it",
  NL: "nl", SR: "nl",
  RU: "ru", BY: "ru", KZ: "ru", UA: "uk",
  JP: "ja", KR: "ko",
  SA: "ar", AE: "ar", EG: "ar", DZ: "ar", MA: "ar", TN: "ar", LY: "ar", IQ: "ar",
  JO: "ar", KW: "ar", QA: "ar", BH: "ar", OM: "ar", YE: "ar", SD: "ar", SY: "ar",
  LB: "ar", PS: "ar",
  TR: "tr", IR: "fa", IL: "he", PK: "ur", BD: "bn", LK: "si", NP: "ne",
  TH: "th", VN: "vi", ID: "id", MY: "ms", MM: "my", KH: "km", LA: "lo",
  PL: "pl", CZ: "cs", SK: "sk", HU: "hu", RO: "ro", BG: "bg", GR: "el",
  SE: "sv", NO: "no", DK: "da", FI: "fi", IS: "is",
  EE: "et", LV: "lv", LT: "lt", SI: "sl", HR: "hr", RS: "sr", BA: "bs",
  MK: "mk", AL: "sq", GE: "ka", AM: "hy", AZ: "az", UZ: "uz", MN: "mn"
}

let langDisplay: { of(code: string): string | undefined } | null = null
try {
  langDisplay = new (Intl as any).DisplayNames(["zh-CN"], { type: "language" })
} catch {
  langDisplay = null
}

export function countryToLang(country: string | null | undefined): string {
  if (!country) return "en"
  return COUNTRY_LANG[country.toUpperCase()] ?? "en"
}

export function langName(code: string | null | undefined): string {
  if (!code) return ""
  return langDisplay?.of(code) ?? code
}

export async function detectLanguage(text: string): Promise<string | null> {
  if (!text.trim() || !chrome?.i18n?.detectLanguage) return null
  try {
    const res = await chrome.i18n.detectLanguage(text.slice(0, 400))
    const top = res?.languages?.find(
      (l) => l.percentage >= 40 && !/^zh/.test(l.language)
    )
    return top?.language ?? null
  } catch {
    return null
  }
}
