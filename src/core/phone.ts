import { parsePhoneNumberFromString } from "libphonenumber-js"

let regionDisplay: { of(code: string): string | undefined } | null = null
try {
  regionDisplay = new (Intl as any).DisplayNames(["zh-CN"], { type: "region" })
} catch {
  regionDisplay = null
}

export interface PhoneInfo {
  e164: string
  country: string
  countryName: string
  flag: string
}

export function toFlagEmoji(iso2: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return "🏳️"
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

export function looksLikePhone(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const digits = t.replace(/\D/g, "")
  return digits.length >= 7 && digits.length <= 15 && /^[+\d\s\-().]+$/.test(t)
}

export function analyzePhone(raw: string | null | undefined): PhoneInfo | null {
  if (!raw) return null
  const cleaned = raw.replace(/[\s\-().]/g, "")
  const match = cleaned.match(/\+?\d{7,15}/)
  if (!match) return null

  const candidate = match[0].startsWith("+") ? match[0] : `+${match[0]}`
  const parsed = parsePhoneNumberFromString(candidate)
  if (!parsed || !parsed.isValid() || !parsed.country) return null

  const country = parsed.country
  return {
    e164: parsed.number,
    country,
    countryName: regionDisplay?.of(country) ?? country,
    flag: toFlagEmoji(country)
  }
}
