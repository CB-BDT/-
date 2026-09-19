import type { EngineId, SpeakerGender } from "~engines/types"

import { t } from "./i18n"
import type { ScheduleJob } from "./schedule"
import type { Settings } from "./settings"

export type BgRequest =
  | { type: "ping" }
  | { type: "getSettings" }
  | { type: "setSettings"; patch: Partial<Settings> }
  | { type: "clearCache" }
  // 静态地图瓦片拉取：页面 CSP 不放行 tile.openstreetmap.org，由 SW 下载转 base64
  | { type: "fetchTiles"; urls: string[] }
  // 定时消息：列表 / 保存（新建或更新，同时注册 chrome.alarms）/ 删除
  | { type: "scheduleList" }
  | { type: "scheduleUpsert"; job: ScheduleJob }
  | { type: "scheduleDelete"; id: string }
  | {
      type: "translate"
      texts: string[]
      target: string
      source?: string
      engine?: EngineId
      skipCache?: boolean
      /** 说话者性别（仅出站翻译传），参与缓存键并约束译入词形 */
      gender?: SpeakerGender
    }

export interface TranslateData {
  texts: string[]
  engine: EngineId
  /** 实际命中的模型/引擎作用域标识（deepseek 为模型名，google 为作用域名） */
  model?: string
  detected?: string
  cached: boolean[]
  /** 主引擎失败自动切到备用引擎时为 true（只读展示，绝不改配置） */
  degraded?: boolean
}

export type BgResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export async function callBg<T = unknown>(req: BgRequest): Promise<BgResult<T>> {
  try {
    const res = (await chrome.runtime.sendMessage(req)) as BgResult<T> | undefined
    if (!res) return { ok: false, error: t("后台无响应") }
    return res
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
