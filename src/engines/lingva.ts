import { LINGVA_ENDPOINT } from "~core/config"
import { t } from "~core/i18n"

import { HttpError, type Engine } from "./types"
import { wrapWithGender } from "./genderAnchor"

/**
 * Lingva Translate 免费公共接口（Google 翻译的开源前端代理，无需 Key）。
 * - GET {实例地址}/api/v1/{source}/{target}/{query}
 * - source 支持 auto；语言代码与 Google 基本一致（zh-CN → zh、zh-TW → zh-TW）
 * - 响应：{ "translation": "..." }
 * - 社区公益实例、无 SLA：失败 / 限流抛 HttpError，由降级链自动换备用引擎
 * - 实例地址集中在 src/core/config.ts，公共实例失效时可换自建/镜像
 * - 性别词形：复用 genderAnchor 锚定句技巧（与 Google 引擎行为一致）
 */
const ENDPOINT = LINGVA_ENDPOINT

/** 内部代码 → Lingva 代码。未列出的语种与 Google 代码一致，直接透传。 */
const LANG_MAP: Record<string, string> = {
  "zh-cn": "zh",
  "zh-tw": "zh-TW"
}

function mapLang(code: string): string {
  const key = code.toLowerCase()
  return LANG_MAP[key] ?? key
}

export const lingvaEngine: Engine = {
  id: "lingva",
  label: t("Lingva 翻译（免费接口）"),

  cacheScope() {
    return "lingva-v1"
  },

  async translate({ texts, target, source = "auto", signal, gender = "neutral" }) {
    const targetLang = mapLang(target)
    const sourceLang = source && source !== "auto" ? mapLang(source) : "auto"

    const out: string[] = []
    for (const text of texts) {
      const wrapped = wrapWithGender(text, gender, source, target)
      const qText = wrapped ? wrapped.q : text

      // 查询词在路径中，必须 encodeURIComponent（空格/斜杠/& 等都会破坏路径）
      const url = `${ENDPOINT}/${sourceLang}/${targetLang}/${encodeURIComponent(qText)}`

      const res = await fetch(url, { signal, credentials: "omit" })
      if (!res.ok) {
        const raw = await res.text().catch(() => "")
        throw new HttpError(
          res.status,
          `Lingva ${res.status}${raw ? `：${raw.slice(0, 160)}` : ""}`
        )
      }

      const json: any = await res.json()
      const translated = json?.translation
      if (typeof translated !== "string") {
        throw new HttpError(502, t("Lingva 响应格式异常（缺少 translation 字段）"))
      }
      out.push(wrapped ? wrapped.unwrap(translated) : translated)
    }

    return { texts: out }
  }
}
