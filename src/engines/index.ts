import { getSettings } from "~core/settings"

import { createCustomEngine } from "./custom"
import { deeplEngine } from "./deepl"
import { createDeepseekEngine } from "./deepseek"
import { googleEngine } from "./google"
import { lingvaEngine } from "./lingva"

import type { Engine, EngineId } from "./types"

const deepseekEngine = createDeepseekEngine(async () => {
  const s = await getSettings()
  return { key: s.deepseekKey, model: s.deepseekModel }
})

const REGISTRY: Record<string, Engine> = {
  google: googleEngine,
  lingva: lingvaEngine,
  deepl: deeplEngine,
  deepseek: deepseekEngine
}

/** 自定义模型引擎 id 前缀（引擎 id = custom:<CustomModel.id>） */
export const CUSTOM_PREFIX = "custom:"

/**
 * 引擎解析：google / lingva / deepl / deepseek 走静态注册表；
 * custom:<id> 每次按最新 settings 动态构造（配置惰性读取，
 * 与 deepseekEngine 相同模式，改 Key / 换模型即时生效）。
 */
export function getEngine(id: EngineId): Engine {
  const known = REGISTRY[id]
  if (known) return known
  if (typeof id === "string" && id.startsWith(CUSTOM_PREFIX)) {
    const cid = id.slice(CUSTOM_PREFIX.length)
    return createCustomEngine(id, async () => {
      const s = await getSettings()
      return (s.customModels ?? []).find((m) => m.id === cid) ?? null
    })
  }
  return googleEngine
}

export function listEngines(): Engine[] {
  return Object.values(REGISTRY)
}

export { ConfigError, HttpError } from "./types"
export type { Engine, EngineId, TranslateParams, TranslateOutput } from "./types"
