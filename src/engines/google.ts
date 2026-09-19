import { t } from "~core/i18n"

import { HttpError, type Engine } from "./types"
import { wrapWithGender } from "./genderAnchor"

const ENDPOINT = "https://translate.googleapis.com/translate_a/single"

export const googleEngine: Engine = {
  id: "google",
  label: t("Google 翻译（免费接口）"),

  cacheScope() {
    return "gtx-v1"
  },

  async translate({ texts, target, source = "auto", signal, gender = "neutral" }) {
    const out: string[] = []
    let detected: string | undefined

    for (const text of texts) {
      const wrapped = wrapWithGender(text, gender, source, target)
      const qText = wrapped ? wrapped.q : text

      const url =
        `${ENDPOINT}?client=gtx` +
        `&sl=${encodeURIComponent(source)}` +
        `&tl=${encodeURIComponent(target)}` +
        `&dt=t&q=${encodeURIComponent(qText)}`

      const res = await fetch(url, { signal, credentials: "omit" })
      if (!res.ok) {
        const raw = await res.text().catch(() => "")
        throw new HttpError(
          res.status,
          `Google ${res.status}${raw ? `：${raw.slice(0, 160)}` : ""}`
        )
      }

      const json: any = await res.json()
      const segments: any[] = Array.isArray(json?.[0]) ? json[0] : []
      const rawTranslation = segments.map((s) => s?.[0] ?? "").join("")
      out.push(wrapped ? wrapped.unwrap(rawTranslation) : rawTranslation)

      if (!detected && typeof json?.[2] === "string") detected = json[2]
    }

    return { texts: out, detected }
  }
}
