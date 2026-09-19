import type {
  BgRequest,
  BgResult,
  TranslateData
} from "~core/messages"
import { removeAllFirstSeen } from "~core/activeDates"
import type { Settings } from "~core/settings"
import { getSettings, setSettings } from "~core/settings"
import { getItem, setItem } from "~core/storage"
import { getEngine } from "~engines"
import type { EngineId } from "~engines/types"

import { cacheClear, cacheGet, cachePrune, cacheSet, hashKey } from "./cache"
import { TaskQueue } from "./queue"
import { buildChain, translateWithChain } from "./translator"
import { alarmNameOf, loadSchedules, saveSchedules } from "~core/schedule"

const CACHE_TTL_MS = 30 * 86_400_000

const queue = new TaskQueue(2)

function applyQueueLimit(settings: Settings) {
  queue.setLimit(settings.googleConcurrency)
}

type TranslateRequest = Extract<BgRequest, { type: "translate" }>

async function resolveScopes(chain: EngineId[]): Promise<Map<EngineId, string>> {
  const scopes = new Map<EngineId, string>()
  await Promise.all(
    chain.map(async (id) => {
      scopes.set(id, await getEngine(id).cacheScope())
    })
  )
  return scopes
}

async function handleTranslate(req: TranslateRequest): Promise<TranslateData> {
  const settings = await getSettings()
  const source = req.source ?? "auto"
  const chain = req.engine ? [req.engine] : buildChain(settings)
  const scopes = await resolveScopes(chain)

  const count = req.texts.length
  const results: string[] = new Array(count).fill("")
  const cached: boolean[] = new Array(count).fill(false)
  const pending: number[] = []

  // 性别仅在非 neutral 时参与 hash：neutral（入站翻译/旧行为）的
  // hash 段数与旧格式完全一致，历史缓存零失效；女性/男性译文独立缓存。
  const genderPart = req.gender && req.gender !== "neutral" ? `g:${req.gender}` : ""

  // keys[i][c] = sha1(engine | model-scope | source | target | [g:xxx |] text)
  const keys: string[][] = await Promise.all(
    req.texts.map((text) =>
      Promise.all(
        chain.map((id) => {
          const parts = [id, scopes.get(id) ?? "", source, req.target]
          if (genderPart) parts.push(genderPart)
          parts.push(text)
          return hashKey(...parts)
        })
      )
    )
  )

  for (let i = 0; i < count; i += 1) {
    let hit = false

    if (!req.skipCache) {
      for (let c = 0; c < chain.length; c += 1) {
        const entry = await cacheGet(keys[i][c])
        if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
          results[i] = entry.text
          cached[i] = true
          hit = true
          break
        }
      }
    }

    if (!hit) pending.push(i)
  }

  let detected: string | undefined
  let engineId: EngineId = chain[0]
  // 默认：命中缓存或仍走主引擎时，model 取主引擎作用域、不视为降级
  let model: string | undefined = scopes.get(chain[0])
  let degraded = false

  if (pending.length > 0) {
    const output = await queue.run(() =>
      translateWithChain(chain, {
        texts: pending.map((i) => req.texts[i]),
        target: req.target,
        source,
        gender: req.gender ?? "neutral"
      })
    )

    detected = output.detected
    engineId = output.engineId
    if (engineId !== chain[0]) degraded = true
    model = scopes.get(engineId)

    const scopeIdx = chain.indexOf(output.engineId)

    for (let j = 0; j < pending.length; j += 1) {
      const i = pending[j]
      results[i] = output.texts[j] ?? ""
      await cacheSet(keys[i][scopeIdx], { text: results[i], ts: Date.now() })
    }
  }

  return { texts: results, engine: engineId, model, detected, cached, degraded }
}

/** OSM 瓦片下载（带内存缓存，避免同一区域反复下载）。 */
const tileCache = new Map<string, string>()

async function fetchTiles(urls: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(urls.length).fill(null)
  const pending: { idx: number; url: string }[] = []
  for (let i = 0; i < urls.length; i += 1) {
    const hit = tileCache.get(urls[i])
    if (hit) out[i] = hit
    else pending.push({ idx: i, url: urls[i] })
  }

  // 并发限制 2，尊重 OSM 瓦片服务政策
  const queue = [...pending]
  const worker = async () => {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      try {
        const res = await fetch(job.url, {
          headers: { Accept: "image/png,image/*;q=0.8" }
        })
        if (!res.ok) return
        const buf = await res.arrayBuffer()
        let binary = ""
        const bytes = new Uint8Array(buf)
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
        }
        const dataUrl = `data:image/png;base64,${btoa(binary)}`
        tileCache.set(job.url, dataUrl)
        out[job.idx] = dataUrl
        // 缓存上限 200 张，超出丢最早的
        if (tileCache.size > 200) {
          const first = tileCache.keys().next().value
          if (first) tileCache.delete(first)
        }
      } catch {
        // 单张失败返回 null，调用方降级
      }
    }
  }
  await Promise.all([worker(), worker()])
  return out
}

export async function handleRequest(req: BgRequest): Promise<BgResult<any>> {
  try {
    switch (req.type) {
      case "ping":
        return { ok: true, data: "pong" }

      case "getSettings":
        return { ok: true, data: await getSettings() }

      case "setSettings": {
        const next = await setSettings(req.patch)
        applyQueueLimit(next)
        return { ok: true, data: next }
      }

      case "clearCache":
        await cacheClear()
        return { ok: true, data: true }

      // 静态地图瓦片下载：页面 CSP 拦截 tile.openstreetmap.org，
      // 由 SW（host_permissions 管辖）下载后转 base64 dataURL 回传
      case "fetchTiles":
        return { ok: true, data: await fetchTiles(req.urls) }

      case "translate":
        return { ok: true, data: await handleTranslate(req) }

      /* ------------------------------ 定时消息 ------------------------------ */
      case "scheduleList":
        return { ok: true, data: await loadSchedules() }

      case "scheduleUpsert": {
        const list = await loadSchedules()
        // 查重：已有"内容相同且待发送"的任务时拒绝再建。
        // 关键：同一客户可能被记录成两种标识（xxx@c.us 或 @lid/显示名，
        // 取决于创建时 WPP 反查是否成功），只按 chatKey 精确匹配会漏——
        // 必须按「JID 或 显示名」双匹配，否则两条任务各发一次 = 双发
        const dup = list.find(
          (x) =>
            x.id !== req.job.id &&
            x.status === "pending" &&
            (x.chatKey === req.job.chatKey ||
              (req.job.chatName && x.chatName === req.job.chatName)) &&
            x.text === req.job.text
        )
        if (dup) {
          return {
            ok: false,
            error: "该客户已存在相同内容的待发送任务（列表中可查看），如需重发请先删除旧任务"
          }
        }
        const i = list.findIndex((x) => x.id === req.job.id)
        if (i >= 0) list[i] = req.job
        else list.push(req.job)
        await saveSchedules(list)
        // pending 且在未来：注册闹钟（MV3 最小 30s，Chrome 会自动放宽）；
        // 其他状态清掉对应闹钟
        if (req.job.status === "pending") {
          chrome.alarms.create(alarmNameOf(req.job.id), { when: req.job.sendAt })
        } else {
          await chrome.alarms.clear(alarmNameOf(req.job.id))
        }
        return { ok: true, data: list }
      }

      case "scheduleDelete": {
        const list = (await loadSchedules()).filter((x) => x.id !== req.id)
        await saveSchedules(list)
        await chrome.alarms.clear(alarmNameOf(req.id))
        return { ok: true, data: list }
      }

      default:
        return { ok: false, error: "未知请求" }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function initRouter() {
  applyQueueLimit(await getSettings())
  // 过期缓存清理：防止 IndexedDB 无限增长；同时修复连接句柄失效。
  void cachePrune(CACHE_TTL_MS).catch(() => {})

  // 一次性迁移：彻底废弃旧的"相识天数(firstSeen)"方案，清空被误判（如 184 天）
  // 的 firstSeen:* 污染数据；新统计改为按联系人维护的"实际互动天数(active_dates:*)"，
  // 由内容脚本只增不减地写入。只执行一遍，避免 SW 每次重启都删。
  try {
    const migrated = await getItem<boolean>("activeDatesMigrationV2")
    if (!migrated) {
      await removeAllFirstSeen()
      await setItem("activeDatesMigrationV2", true)
    }
  } catch {
    /* 迁移失败不阻塞启动 */
  }
}
