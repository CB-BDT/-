import { t, tf } from "~core/i18n"
import type { CustomModel } from "~core/settings"

import { systemPrompt } from "./deepseek"
import { ConfigError, HttpError, type Engine } from "./types"

/** OpenAI 兼容接口地址拼接：base 去尾部斜杠后补 /chat/completions
 *  （用户填 https://api.xx.com/v1 或 .../v1/ 均可；已带完整路径则原样使用） */
export function joinEndpoint(base: string): string {
  const b = (base || "").trim().replace(/\/+$/, "")
  if (b.endsWith("/chat/completions")) return b
  return b + "/chat/completions"
}

/**
 * 用户自定义 OpenAI 兼容模型引擎。
 * 与 DeepSeek 引擎共用同一套翻译提示词（含性别词形约束），
 * 差异仅在于接口地址 / Key / 模型名全部来自用户配置。
 */
export function createCustomEngine(
  engineId: string,
  getConfig: () => Promise<CustomModel | null>
): Engine {
  // 无配置时用于 label / 报错的兜底名
  const fallbackLabel = t("自定义模型")

  return {
    id: engineId,
    label: fallbackLabel,

    async cacheScope() {
      const m = await getConfig()
      // baseUrl 参与作用域：换中转站 / 换模型名都不会读到旧缓存
      return m ? `${m.baseUrl}|${m.model}` : "missing"
    },

    async translate({ texts, target, signal, gender = "neutral" }) {
      const m = await getConfig()
      if (!m) {
        throw new ConfigError(t("该自定义模型已被删除或配置丢失，请在设置中检查"))
      }
      if (!m.apiKey) {
        throw new ConfigError(
          tf("未配置「{label}」的 API Key，请在设置中填写", { label: m.label || fallbackLabel })
        )
      }
      const label = m.label || fallbackLabel
      const endpoint = joinEndpoint(m.baseUrl)

      const out: string[] = []

      for (const text of texts) {
        const res = await fetch(endpoint, {
          method: "POST",
          signal,
          credentials: "omit",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${m.apiKey}`
          },
          body: JSON.stringify({
            model: m.model,
            temperature: 0,
            stream: false,
            messages: [
              { role: "system", content: systemPrompt(target, gender) },
              { role: "user", content: text }
            ]
          })
        })

        if (!res.ok) {
          const raw = await res.text().catch(() => "")
          let detail = raw.slice(0, 300)
          try {
            const parsed: any = JSON.parse(raw)
            detail = parsed?.error?.message ?? parsed?.message ?? detail
          } catch {
            /* 保留原始响应片段 */
          }
          // 鉴权 / 参数 / 模型名相关的 4xx 属于"用户配置问题"，
          // 抛 ConfigError 让上层暴露给用户，绝不静默降级到 Google。
          if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
            throw new ConfigError(
              `${label} ${res.status}${detail ? `：${detail}` : ""}` +
                t("（请检查接口地址、Key 与模型标识符）"),
              res.status
            )
          }
          throw new HttpError(res.status, `${label} ${res.status}${detail ? `：${detail}` : ""}`)
        }

        const json: any = await res.json()
        const content = (json?.choices?.[0]?.message?.content ?? "").trim()

        if (!content) {
          throw new ConfigError(
            tf("{label} 返回空内容（模型 {model}），请确认模型标识符可用", {
              label,
              model: m.model
            })
          )
        }

        out.push(content)
      }

      return { texts: out }
    }
  }
}
