import { t } from "~core/i18n"
import type { Settings } from "~core/settings"
import { getEngine } from "~engines"
import type { EngineId, SpeakerGender, TranslateOutput } from "~engines/types"
import { ConfigError } from "~engines/types"

import { withRetry } from "./queue"

/**
 * 引擎降级链：主引擎优先，失败后自动切到备用。
 * google / lingva / deepl 等直连引擎被限流（429 / 456）或实例故障时，
 * 降级到第一个自定义模型；反之自定义模型失败则降级到谷歌。
 * DeepSeek 已从产品移除，不再参与。
 */
export function buildChain(settings: Settings): EngineId[] {
  const chain: EngineId[] = [settings.engine]
  if (!settings.enableFallback) return chain

  const secondary: EngineId =
    settings.engine === "google" ||
    settings.engine === "lingva" ||
    settings.engine === "deepl"
      ? (settings.customModels?.[0]
          ? `custom:${settings.customModels[0].id}`
          : "google")
      : "google"

  if (secondary !== settings.engine) chain.push(secondary)
  return chain
}

export interface ChainResult extends TranslateOutput {
  engineId: EngineId
}

export async function translateWithChain(
  chain: EngineId[],
  params: { texts: string[]; target: string; source: string; gender?: SpeakerGender }
): Promise<ChainResult> {
  const errors: string[] = []

  for (const id of chain) {
    try {
      const output = await withRetry(() => getEngine(id).translate(params), {
        retries: 2
      })
      return { ...output, engineId: id }
    } catch (err) {
      // 配置类错误（Key 未设置 / 鉴权失败 401 / 模型名错误 404 / 空内容）绝不能
      // 静默降级，否则"DeepSeek 根本没接好"会被偷偷转成 Google 译文掩盖掉。
      // 直接暴露给调用方（消息徽章 / 工具栏会展示具体报错）。
      if (err instanceof ConfigError) throw err
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  throw new Error(errors.join(" | ") || t("所有翻译引擎均失败"))
}
