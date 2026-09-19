/**
 * 联系人档案缓存：country / lang / device / phone 一次获取，永久生效。
 *
 * 存储：chrome.storage.local，键 `wac:profile:{chatId}`（chatId 优先 JID）。
 * 结构：{ phone, country, lang, device, name, ts }
 *
 * 策略：
 * - phone / country / lang / name 只填空、不回退（避免某次 DOM 抖动把空值写进去）
 * - device 允许更新（对方可能换设备登录）
 * - 内存 memo 层保证高频 tick 不反复读 storage
 */
import type { DeviceType } from "./deviceDetector"
import { nameKey } from "./crm"
import { getItem, setItem } from "./storage"

export interface ContactProfile {
  phone?: string
  country?: string
  lang?: string
  device?: DeviceType
  name?: string
  ts: number
}

const PREFIX = "profile:"

const memo = new Map<string, ContactProfile>()
/** 已经从 storage 读过但为空的 key，避免重复 IO */
const loadedEmpty = new Set<string>()

/** 读档案（带内存缓存）。key 为空或从未写入时返回 null。 */
export async function getProfile(key: string): Promise<ContactProfile | null> {
  if (!key) return null
  const hit = memo.get(key)
  if (hit) return hit
  if (loadedEmpty.has(key)) return null
  try {
    const p = await getItem<ContactProfile>(PREFIX + key)
    if (p && typeof p === "object") {
      memo.set(key, p)
      return p
    }
  } catch {
    /* 存储读取失败不阻塞主流程 */
  }
  loadedEmpty.add(key)
  return null
}

/** 同步版：只读内存 memo（供列表高频渲染使用，不触发 IO）。 */
export function cachedProfile(key: string): ContactProfile | null {
  return memo.get(key) ?? null
}

/**
 * 启动时一次性把 storage 里全部档案载入内存 memo。
 * 列表渲染只读 cachedProfile（同步零 IO），若不预加载，
 * 历史会话（刷新前打开过的聊天写入的 device 等）在列表里永远读不到。
 * chrome.storage.local.get(null) 一次取全部，档案量级很小，开销可忽略。
 */
export async function preloadAllProfiles(): Promise<number> {
  // 先确保名字索引已从 storage 载入，避免并行加载时整体替换 nameIndex
  // 把下面回填的别名冲掉
  await loadNameIndex()
  try {
    const all = await chrome.storage.local.get(null)
    let n = 0
    for (const [k, v] of Object.entries(all)) {
      if (!k.startsWith(PREFIX) || k === NAME_IDX_KEY) continue
      if (v && typeof v === "object") {
        const p = v as ContactProfile
        const key = k.slice(PREFIX.length)
        memo.set(key, p)
        n += 1
        // 自愈：历史档案按 JID 存储，但列表行可能只有名字 key。
        // 档案里带 name 时同步登记 nameKey 别名 + 名字索引
        if (p.name && p.device) {
          memo.set(nameKey(p.name), p)
          nameIndex[p.name.trim().toLowerCase()] = key.toLowerCase()
        }
      }
    }
    return n
  } catch {
    return 0
  }
}

/* ------------------------- 名字 → JID 索引 ------------------------- */
/**
 * 会话列表项 DOM 可能拿不到 data-id（只能拿到名字），
 * 而档案按 JID 存储。批量预取时把联系人名字映射到 JID，
 * 渲染时 id 为空或未命中就按名字桥接，保证设备标签不依赖打开聊天。
 * 存储为单 key（wac:profile:__name2jid）避免碎片化。
 */
const NAME_IDX_KEY = `${PREFIX}__name2jid`

let nameIndex: Record<string, string> = {}
let nameIndexLoaded = false

async function loadNameIndex(): Promise<void> {
  if (nameIndexLoaded) return
  try {
    const v = await getItem<Record<string, string>>(NAME_IDX_KEY)
    if (v && typeof v === "object") nameIndex = v
  } catch {
    /* 读取失败从空开始 */
  }
  nameIndexLoaded = true
}

/** 预取时调用：登记 名字→JID（不覆盖已有映射）。 */
export async function indexName(names: (string | null)[], jid: string): Promise<void> {
  await loadNameIndex()
  let changed = false
  const lowerJid = jid.toLowerCase()
  for (const n of names) {
    if (!n) continue
    const k = n.trim().toLowerCase()
    if (!k || nameIndex[k] === lowerJid) continue
    nameIndex[k] = lowerJid
    changed = true
  }
  if (!changed) return
  try {
    await setItem(NAME_IDX_KEY, nameIndex)
  } catch {
    /* 失败时内存仍生效 */
  }
}

/** 渲染时按名字查 JID（同步，只读内存）。 */
export function jidByName(name: string | null): string | null {
  if (!name || !nameIndexLoaded) return null
  return nameIndex[name.trim().toLowerCase()] ?? null
}

/** 页面启动时预载名字索引（供列表渲染同步查询）。 */
export function preloadNameIndex(): Promise<void> {
  return loadNameIndex()
}

/**
 * 合并写入。phone/country/lang/name 仅在原值为空时写入；
 * device 有新值即更新。无变化时不产生任何写入。
 */
export async function mergeProfile(
  key: string,
  patch: Partial<Omit<ContactProfile, "ts">>
): Promise<void> {
  if (!key) return
  const cur = { ...(await getProfile(key) ?? {}) }
  let changed = false

  for (const k of ["phone", "country", "lang", "name"] as const) {
    const v = patch[k]
    if (v && !cur[k]) {
      cur[k] = v
      changed = true
    }
  }
  if (patch.device && patch.device !== "Unknown" && patch.device !== cur.device) {
    cur.device = patch.device
    changed = true
  }

  if (!changed) return
  const next: ContactProfile = { ...cur, ts: Date.now() }
  memo.set(key, next)
  loadedEmpty.delete(key)
  try {
    await setItem(PREFIX + key, next)
  } catch {
    /* 写入失败时内存仍生效，下次再落盘 */
  }
}
