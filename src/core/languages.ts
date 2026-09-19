import { langName } from "./lang"

export const TARGET_LANGUAGES = [
  "zh-CN",
  "zh-TW",
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "nl",
  "ru",
  "ar",
  "tr",
  "fa",
  "hi",
  "ur",
  "bn",
  "id",
  "ms",
  "th",
  "vi",
  "ja",
  "ko",
  "pl"
] as const

export function languageLabel(code: string): string {
  const name = langName(code)
  return name && name !== code ? `${name} (${code})` : code
}
