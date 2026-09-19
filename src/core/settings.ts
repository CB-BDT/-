import type { EngineId, SpeakerGender } from "~engines/types"

import { BUILD_CONFIG } from "./config"
import { t, type UiLang } from "./i18n"
import { getItem, setItem } from "./storage"

export type { SpeakerGender }

/** 用户自定义的 OpenAI 兼容模型（中转站 / OpenRouter / Kimi / 通义等均可） */
export interface CustomModel {
  /** 稳定标识，引擎 id = `custom:${id}`，参与缓存 key */
  id: string
  /** 显示名（聊天框与设置页下拉里展示） */
  label: string
  /** OpenAI 兼容接口根地址，如 https://api.moonshot.cn/v1 */
  baseUrl: string
  apiKey: string
  /** 模型标识符，如 moonshot-v1-8k */
  model: string
}

export function customEngineId(m: CustomModel): EngineId {
  return `custom:${m.id}`
}

/** 早期版本内置过的模型的固定 id（含硬编码 Key）：
 *  仅用于清理老用户 storage 里的残留条目，新安装不再注入。
 *  兼容性说明：该内置条目的 id 恒为下方常量，且用户手动添加的模型 id 由
 *  「cm+时间戳」生成，不会撞上，所以按 id 过滤即可精确命中历史残留。 */
const LEGACY_BUILTIN_ID = "mimo"

export interface Settings {
  engine: EngineId
  enableFallback: boolean
  /** DeepL 官方 API Key；免费版以 :fx 结尾（引擎按后缀自动选免费/Pro 端点） */
  deeplKey: string
  deepseekKey: string
  deepseekModel: string
  /** 自定义 OpenAI 兼容模型列表 */
  customModels: CustomModel[]
  incomingTarget: string
  outgoingTargetMode: "country" | "fixed"
  outgoingFixedTarget: string
  autoSend: boolean
  googleConcurrency: number
  /** 说话者（即用户本人）性别：出站回译时约束译文使用对应性别的词形，
   *  如西班牙语 interesada(女)/interesado(男)。默认女性。 */
  speakerGender: SpeakerGender
  /** 插件界面语言：zh-CN（默认）或 en。切换后所有界面与提示文案立即生效。 */
  uiLang: UiLang
}

export const DEFAULT_SETTINGS: Settings = {
  // 免费优先：默认走 Google 免费公共接口（无 Key、无额度限制）。
  // Lingva 同为免费接口可手动切换；DeepL 需使用者自备 Key（免费版每月 50 万字符）。
  engine: BUILD_CONFIG.defaultEngine,
  enableFallback: true,
  // 开源版留空：由使用者在设置页填写自己的 DeepL Key，源码中不存在任何凭证。
  // 想给自己的私有构建预置，改 src/core/config.ts 一处即可。
  deeplKey: BUILD_CONFIG.defaultDeeplKey,
  deepseekKey: "",
  // DeepSeek V4 系列最新 Flash（V4.1-Flash，官方标识符 deepseek-flash）。
  // 旧模型名 deepseek-chat 已于 2026-07-24 停用，沿用会导致调用失败。
  deepseekModel: "deepseek-flash",
  customModels: [],
  incomingTarget: "zh-CN",
  outgoingTargetMode: "country",
  outgoingFixedTarget: "en",
  autoSend: false,
  googleConcurrency: 2,
  speakerGender: "female",
  // 默认简体中文：老用户升级后界面不变，不会突然变英文
  uiLang: "zh-CN"
}

const KEY = "settings"

/** 旧模型名已于 2026-07-24 停用，命中则自动迁移到最新 Flash */
const RETIRED_MODELS = ["deepseek-chat", "deepseek-reasoner"]

export async function getSettings(): Promise<Settings> {
  const stored = await getItem<Partial<Settings>>(KEY)
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  if (RETIRED_MODELS.includes(merged.deepseekModel)) {
    merged.deepseekModel = DEFAULT_SETTINGS.deepseekModel
  }
  if (!Array.isArray(merged.customModels)) merged.customModels = []
  // 内置模型已从产品移除（不再注入）。老用户 storage 里可能还残留该条目
  // （含硬编码 Key），这里一并过滤掉，避免它继续出现在引擎下拉里。
  merged.customModels = merged.customModels.filter((m) => m?.id !== LEGACY_BUILTIN_ID)
  // 仍停留在已移除内置引擎（custom:mimo）的安装切到 Google 免费接口。
  // 下方 engineValid 兜底也能覆盖，这里显式迁移让旧数据语义更清晰。
  if (merged.engine === `custom:${LEGACY_BUILTIN_ID}`) merged.engine = "google"
  // 主引擎有效性：google / lingva / deepl / custom:xxx。deepseek 已从产品移除，
  // 不再视为有效，命中旧值（或指向已删除的自定义模型）时自愈回 Google 免费接口。
  const engineValid =
    merged.engine === "google" ||
    merged.engine === "lingva" ||
    merged.engine === "deepl" ||
    (typeof merged.engine === "string" &&
      merged.engine.startsWith("custom:") &&
      merged.customModels.some((m) => `custom:${m.id}` === merged.engine))
  if (!engineValid) merged.engine = "google"
  // 界面语言白名单：storage 里可能是历史残留或非法值，统一收敛
  if (merged.uiLang !== "en" && merged.uiLang !== "zh-CN") merged.uiLang = "zh-CN"
  return merged
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await setItem(KEY, next)
  return next
}

/** 引擎下拉统一项（工具栏与消息徽章菜单共用同一份列表语义） */
export interface EngineOption {
  id: EngineId
  label: string
  /** 自定义模型：有生成能力但费 token，徽章侧首次选择需二次确认 */
  isAI: boolean
}

/**
 * 引擎选项列表。顺序：谷歌 → Lingva → DeepL → 自定义模型（有几个列几个）。
 * 徽章菜单每额外包裹一层「不是自定义模型」判断，所以 isAI 必须在此标注，
 * 避免各处重复用 `id.startsWith("custom:")` 各自推断。
 */
export function engineOptions(s: Settings): EngineOption[] {
  return [
    { id: "google", label: t("谷歌·免费"), isAI: false },
    { id: "lingva", label: t("Lingva·免费"), isAI: false },
    { id: "deepl", label: "DeepL", isAI: false },
    ...(s.customModels ?? []).map((m) => ({
      id: customEngineId(m),
      label: m.label || m.model || t("自定义模型"),
      isAI: true
    }))
  ]
}

/**
 * AI 功能（聊天总结）使用的引擎：
 * 跟随全局主引擎；谷歌 / Lingva / DeepL 翻译没有生成能力，退回到第一个自定义模型。
 * 一个自定义模型都没有时返回 null，由调用方提示用户去设置页添加。
 */
export function resolveAIEngine(s: Settings): EngineId | null {
  if (s.engine === "google" || s.engine === "lingva" || s.engine === "deepl") {
    const m = (s.customModels ?? [])[0]
    return m ? customEngineId(m) : null
  }
  return s.engine
}
