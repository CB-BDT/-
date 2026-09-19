import { getAllByPrefix, getItem, removeItem, setItem } from "./storage"

/**
 * 实际互动天（Active Days）统计
 *
 * 统计的是"与该好友产生实际对话/互动的累计天数"——即双方有消息往来的
 * 去重日期总数，而不是"最早一条消息到现在过了多少天"。
 *
 * 存储：wac:active_dates:{chatId} -> string[]（形如 ["2026-09-10","2026-09-12"]），
 * 只增不减：任何时刻都只做并集合并，绝不做删除、绝不倒退。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function toDateString(ts: number): string {
  const d = new Date(ts)
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

/** 今天（系统日期，YYYY-MM-DD） */
export function todayString(): string {
  return toDateString(Date.now())
}

/* -------------------------- WhatsApp 日期解析 -------------------------- */

const YEAR_MIN = 2009

function yearAt(nums: number[]): number {
  const upper = new Date().getFullYear() + 1
  return nums.findIndex((n) => n >= YEAR_MIN && n <= upper)
}

function resolveYMD(nums: number[], locale: string): Date | null {
  const yearIdx = yearAt(nums)
  if (yearIdx === -1) return null
  const year = nums[yearIdx]
  const rest = nums.filter((_, i) => i !== yearIdx)

  let day: number
  let month: number

  if (yearIdx === 0) {
    month = rest[0]
    day = rest[1]
  } else if (rest[0] > 12) {
    day = rest[0]
    month = rest[1]
  } else if (rest[1] > 12) {
    month = rest[0]
    day = rest[1]
  } else if (/^en-US/i.test(locale)) {
    month = rest[0]
    day = rest[1]
  } else {
    day = rest[0]
    month = rest[1]
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  return date
}

/**
 * WhatsApp 的 data-pre-plain-text 日期格式随显示语言变化，常见有：
 *   英文（时间在前）："[09:55, 8/25/2026]"
 *   中文等（日期在前）："[2026/8/25 09:55]" 或 "[2026/8/25, 09:55]"
 *   纯日期（英/美式）："[8/25/2026]" / "[25/08/2026]" / "[2026/8/25]"
 * 逐段尝试"整体 + 按逗号切分的每段"，谁解析出合法日期就用谁，
 * 避免只认某一种固定格式导致解析失败。
 */
export function parsePrePlainDate(raw: string, locale: string): Date | null {
  const bracket = raw.match(/\[([^\]]+)\]/)
  if (!bracket) return null

  const inner = bracket[1]
  const candidates = [inner, ...inner.split(",").map((s) => s.trim())]

  for (const cand of candidates) {
    const nums = cand.match(/\d+/g)?.map(Number)
    if (!nums || nums.length < 3) continue
    const date = resolveYMD(nums, locale)
    if (date) return date
  }

  return null
}

/** 从一条消息行（row）里取出它的对话日期（YYYY-MM-DD），解析不到返回 null。 */
export function dateStringFromRow(row: HTMLElement): string | null {
  const el = row.querySelector<HTMLElement>("[data-pre-plain-text]")
  const raw = el?.getAttribute("data-pre-plain-text")
  if (!raw) return null
  const date = parsePrePlainDate(raw, navigator.language || "en-US")
  if (!date) return null
  const s = toDateString(date.getTime())
  return DATE_RE.test(s) ? s : null
}

/* ------------------------------ 存储读写 ------------------------------ */

function keyOf(chatId: string): string {
  return `active_dates:${chatId}`
}

export async function readActiveDates(chatId: string): Promise<string[]> {
  const v = await getItem<string[]>(keyOf(chatId))
  return Array.isArray(v)
    ? v.filter((s) => typeof s === "string" && DATE_RE.test(s))
    : []
}

/** 只增不减：写入前先去重、只保留合法日期、排序，绝不删除已有记录。 */
export async function writeActiveDates(chatId: string, dates: string[]): Promise<void> {
  const clean = Array.from(
    new Set(dates.map((d) => d.trim()).filter((d) => DATE_RE.test(d)))
  ).sort()
  await setItem(keyOf(chatId), clean)
}

export function activeDayCount(dates: string[]): number {
  return dates.length
}

/* --------------------------- 旧数据清理 --------------------------- */

/** 清空旧的 firstSeen:* 污染数据（被误判为"184 天"等）。 */
export async function removeAllFirstSeen(): Promise<void> {
  const entries = await getAllByPrefix<unknown>("firstSeen:")
  for (const key of Object.keys(entries)) await removeItem(key)
}