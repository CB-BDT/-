import { t, tf } from "~core/i18n"
import { getSettings } from "~core/settings"

import { wrapWithGender } from "./genderAnchor"
import { ConfigError, HttpError, type Engine } from "./types"

/**
 * DeepL 官方 API v2 引擎。
 * - 免费版 Key 以 ":fx" 结尾，必须走 api-free.deepl.com；Pro Key 走 api.deepl.com
 * - 认证头：Authorization: DeepL-Auth-Key <key>
 * - 语言代码大写（ZH / EN / PT-BR），与内部小写代码（zh-CN / en / pt）做映射
 * - 单请求可携带多条文本（text 数组），一次 POST 全部译完
 * - 性别词形：复用 genderAnchor 锚定句技巧（与 Google 引擎行为一致）
 */

/** 内部小写代码 → DeepL 目标语代码。
 *  fa/ur/bn/ms/th/vi 等语种 DeepL 不支持 → 不在此表，
 *  命中即抛 HttpError，由降级链自动换用备用引擎。 */
const LANG_MAP: Record<string, string> = {
  "zh-cn": "ZH",
  // DeepL 目标语仅有简体中文，繁体请求按简体尽力处理
  "zh-tw": "ZH",
  en: "EN",
  es: "ES",
  // WhatsApp 场景的葡语默认巴西用法
  pt: "PT-BR",
  fr: "FR",
  de: "DE",
  it: "IT",
  nl: "NL",
  ru: "RU",
  ar: "AR",
  tr: "TR",
  hi: "HI",
  id: "ID",
  ja: "JA",
  ko: "KO",
  pl: "PL"
}

function mapLang(code: string): string | null {
  const key = code.toLowerCase()
  return LANG_MAP[key] ?? LANG_MAP[key.split("-")[0]] ?? null
}

export const deeplEngine: Engine = {
  id: "deepl",
  label: t("DeepL 翻译"),

  cacheScope() {
    return "deepl-v1"
  },

  async translate({ texts, target, source = "auto", signal, gender = "neutral" }) {
    const s = await getSettings()
    const key = (s.deeplKey ?? "").trim()
    if (!key) {
      throw new ConfigError(t("未配置 DeepL API Key，请在设置中填写"))
    }

    const targetLang = mapLang(target)
    if (!targetLang) {
      throw new HttpError(400, tf("DeepL 暂不支持目标语言 {target}", { target }))
    }

    const wrapped = texts.map((t) => wrapWithGender(t, gender, source, target))
    const body: Record<string, unknown> = {
      text: texts.map((t, i) => (wrapped[i] ? wrapped[i]!.q : t)),
      target_lang: targetLang
    }
    // 源语言仅在能映射时传；auto / DeepL 不支持的源语种交给它自动检测
    if (source && source !== "auto") {
      const srcLang = mapLang(source)
      if (srcLang) body.source_lang = srcLang
    }

    // 免费版 Key 以 :fx 结尾，端点与 Pro 不同，打错端点会 403
    const endpoint = key.endsWith(":fx")
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate"

    const res = await fetch(endpoint, {
      method: "POST",
      signal,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Authorization: `DeepL-Auth-Key ${key}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const raw = await res.text().catch(() => "")
      let detail = raw.slice(0, 300)
      try {
        const parsed: any = JSON.parse(raw)
        detail = parsed?.message ?? detail
      } catch {
        /* 保留原始响应片段 */
      }
      // 403：Key 无效 / Key 与端点不匹配（免费 Key 打 Pro 端点等）——
      // 属用户配置问题，抛 ConfigError 直接暴露，绝不静默降级
      if (res.status === 401 || res.status === 403) {
        throw new ConfigError(
          `DeepL ${res.status}${detail ? `：${detail}` : ""}` +
            tf("（请检查 API Key；免费版 Key 以 :fx 结尾）", {}),
          res.status
        )
      }
      // 429 限流 / 456 免费额度用尽 / 400 参数问题：走降级链换备用引擎
      throw new HttpError(res.status, `DeepL ${res.status}${detail ? `：${detail}` : ""}`)
    }

    const json: any = await res.json()
    const translations: any[] = Array.isArray(json?.translations) ? json.translations : []
    if (translations.length !== texts.length) {
      throw new HttpError(
        502,
        tf("DeepL 返回条数不匹配（{n}/{m}）", {
          n: translations.length,
          m: texts.length
        })
      )
    }

    const out = texts.map((t, i) => {
      const translated = String(translations[i]?.text ?? "")
      return wrapped[i] ? wrapped[i]!.unwrap(translated) : translated
    })

    const detected = translations[0]?.detected_source_language
    return {
      texts: out,
      detected: typeof detected === "string" ? detected.toLowerCase() : undefined
    }
  }
}
