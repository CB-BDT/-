/**
 * 定时消息：用户设定时间（可选时区，默认北京时间）+ 自定义内容，
 * 到点后自动发送给指定客户。
 *
 * 存储：chrome.storage.local 单键 `wac:schedules` → ScheduleJob[]。
 * 触发：background 用 chrome.alarms 注册（`wac-sched-<id>`，MV3 SW 睡眠
 * 也能被唤醒）；到点后派发给 WhatsApp Web 页面里的 content script 执行。
 * 兜底：页面加载 / WPP 就绪时检查过期未发的任务立即补发（覆盖闹钟
 * 期间页面被关、浏览器重启等场景）。
 *
 * 防风控：发送前加 5–45s 随机延迟（同一时刻的多个任务天然错开）；
 * 页面内补发逐条间隔数秒。UI 同时提示用户不要给多个客户设完全相同的时刻。
 */
import { getItem, setItem } from "./storage"

export type ScheduleStatus = "pending" | "sending" | "sent" | "failed" | "canceled"

export interface ScheduleJob {
  id: string
  /** 发送目标：chatId（JID 优先，退回名字键） */
  chatKey: string
  /** 显示名（列表展示用） */
  chatName: string
  /** 消息内容 */
  text: string
  /** 发送时刻（UTC 时间戳 ms） */
  sendAt: number
  /** 设定时的时区（IANA 名，展示/复算用） */
  tz: string
  status: ScheduleStatus
  error?: string
  /** 页面未打开时的后台重试次数 */
  retries?: number
  /** 页面侧认领任务的时间戳：sending + 新近 claimedAt 表示正在处理中，
   *  其他路径（闹钟派发 / 页面补发）看到会跳过，防止双发 */
  claimedAt?: number
  /** 认领令牌：并发认领时"最后写赢"，写后读回不匹配者让位 */
  claimToken?: string
  createdAt: number
  sentAt?: number

  /* ---- 媒体附件（图片/视频，Blob 存 IndexedDB，此处只存引用 id） ---- */
  /** IndexedDB mediaStore 的附件 id */
  mediaId?: string
  /** 原文件名（展示 + 发送） */
  mediaName?: string
  /** image | video */
  mediaType?: string

  /* ---- 翻译确认（创建时翻译好，到点直接发译文） ---- */
  /** 发送语言（供列表展示"以 xx 语发送"） */
  sendLang?: string
  /** 若发送译文：原文（展示用） */
  originText?: string
}

const KEY = "schedules"

/** 每个 job 对应的 chrome.alarms 名称（background / router 共用） */
export const alarmNameOf = (id: string) => `wac-sched-${id}`
export const ALARM_PREFIX = "wac-sched-"

export async function loadSchedules(): Promise<ScheduleJob[]> {
  const v = await getItem<ScheduleJob[]>(KEY)
  return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string") : []
}

export async function saveSchedules(list: ScheduleJob[]): Promise<void> {
  await setItem(KEY, list)
}

/** 按 id 原地打补丁（不存在则忽略），返回更新后的完整列表。 */
export async function patchScheduleJob(
  id: string,
  patch: Partial<Omit<ScheduleJob, "id">>
): Promise<ScheduleJob[]> {
  const list = await loadSchedules()
  const i = list.findIndex((x) => x.id === id)
  if (i >= 0) list[i] = { ...list[i], ...patch }
  await saveSchedules(list)
  return list
}

/** 常用时区（面向外贸/客服场景的高频国家；默认北京时间） */
export const TZ_OPTIONS: { tz: string; label: string }[] = [
  { tz: "Asia/Shanghai", label: "中国北京时间 (UTC+8)" },
  { tz: "Asia/Tokyo", label: "日本东京 (UTC+9)" },
  { tz: "Asia/Seoul", label: "韩国首尔 (UTC+9)" },
  { tz: "Asia/Singapore", label: "新加坡 (UTC+8)" },
  { tz: "Asia/Hong_Kong", label: "中国香港 (UTC+8)" },
  { tz: "Asia/Taipei", label: "中国台北 (UTC+8)" },
  { tz: "Asia/Bangkok", label: "泰国曼谷 (UTC+7)" },
  { tz: "Asia/Ho_Chi_Minh", label: "越南胡志明 (UTC+7)" },
  { tz: "Asia/Jakarta", label: "印尼雅加达 (UTC+7)" },
  { tz: "Asia/Manila", label: "菲律宾马尼拉 (UTC+8)" },
  { tz: "Asia/Kuala_Lumpur", label: "马来西亚吉隆坡 (UTC+8)" },
  { tz: "Asia/Kolkata", label: "印度孟买/新德里 (UTC+5:30)" },
  { tz: "Asia/Dubai", label: "阿联酋迪拜 (UTC+4)" },
  { tz: "Asia/Riyadh", label: "沙特利雅得 (UTC+3)" },
  { tz: "Europe/Moscow", label: "俄罗斯莫斯科 (UTC+3)" },
  { tz: "Europe/Istanbul", label: "土耳其伊斯坦布尔 (UTC+3)" },
  { tz: "Europe/Cairo", label: "埃及开罗 (UTC+2)" },
  { tz: "Europe/London", label: "英国伦敦 (UTC+0/1)" },
  { tz: "Europe/Paris", label: "法国巴黎 (UTC+1/2)" },
  { tz: "Europe/Berlin", label: "德国柏林 (UTC+1/2)" },
  { tz: "Europe/Madrid", label: "西班牙马德里 (UTC+1/2)" },
  { tz: "America/New_York", label: "美国纽约 (UTC-5/-4)" },
  { tz: "America/Chicago", label: "美国芝加哥 (UTC-6/-5)" },
  { tz: "America/Denver", label: "美国丹佛 (UTC-7/-6)" },
  { tz: "America/Los_Angeles", label: "美国洛杉矶 (UTC-8/-7)" },
  { tz: "America/Sao_Paulo", label: "巴西圣保罗 (UTC-3)" },
  { tz: "America/Mexico_City", label: "墨西哥城 (UTC-6)" },
  { tz: "Australia/Sydney", label: "澳大利亚悉尼 (UTC+10/11)" },
  { tz: "Pacific/Auckland", label: "新西兰奥克兰 (UTC+12/13)" },
  { tz: "Africa/Lagos", label: "尼日利亚拉各斯 (UTC+1)" },
  { tz: "UTC", label: "UTC 标准时间" }
]

/** 某时区在指定 UTC 时刻的偏移量（ms，东八区为 +8h）。 */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0")
  // 把目标时区的墙钟当成 UTC 拼时间戳，与真实 UTC 的差即偏移
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  )
  return wallAsUtc - utcMs
}

/**
 * 目标时区的 datetime-local 字符串（"YYYY-MM-DDTHH:mm"）→ UTC 时间戳。
 * 迭代两次消化夏令时边界，返回 NaN 表示格式非法。
 */
export function zonedTimeToUtc(local: string, tz: string): number {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return NaN
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let ts = asUtc
  for (let i = 0; i < 2; i += 1) ts = asUtc - tzOffsetMs(ts, tz)
  return ts
}

/** 目标时区「当前时刻 + 默认提前量」的 datetime-local 值（表单默认值）。 */
export function defaultLocalInTz(tz: string, addMinutes = 60): string {
  const now = Date.now() + addMinutes * 60_000
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(new Date(now))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`
}

/** UTC 时间戳 → 目标时区显示（MM-DD HH:mm，供列表展示）。 */
export function formatInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(ms))
}

/** 生成 job id */
export function newScheduleId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
