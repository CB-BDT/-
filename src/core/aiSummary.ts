/**
 * AI 聊天总结：聊天记录格式化 + 与 background 的 SSE 流式端口。
 *
 * 记录提取由 whatsapp.ts 经 relay（WPP.chat.getMessages）完成，
 * 本模块只负责：
 *  - 把扁平消息数组格式化为 [发送者] [时间]: 内容 的对话文本
 *  - 上下文截断（条数 + 字符数双上限，防止超过模型 Context Window）
 *  - 长连接流式接收 DeepSeek 返回
 */

import { t } from "./i18n"

export interface ChatHistoryMsg {
  /** true = 我自己发的 */
  fromMe: boolean
  body: string
  /** WhatsApp 时间戳（秒） */
  t: number
  type?: string
}

const DEFAULT_MAX_MSGS = 100
const DEFAULT_MAX_CHARS = 12000

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** t（秒）→ "MM-DD HH:MM"；无时间戳时返回空串 */
function formatTime(t: number): string {
  if (!t) return ""
  const d = new Date(t * 1000)
  if (Number.isNaN(d.getTime())) return ""
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`
}

/**
 * 格式化为按时间排列的对话文本：
 *   [我] 09-15 14:30: xxx
 *   [客户] 09-15 14:31: yyy
 * 超出条数/字符预算时从最旧的消息开始丢弃（保留最新上下文）。
 */
export function formatTranscript(
  msgs: ChatHistoryMsg[],
  maxMsgs: number = DEFAULT_MAX_MSGS,
  maxChars: number = DEFAULT_MAX_CHARS
): { text: string; count: number; dropped: number } {
  // 先做条数截断（保留最新 maxMsgs 条）
  const sliced = msgs.slice(-maxMsgs)
  const dropped = msgs.length - sliced.length

  // 渲染为行，再从最新行向前累加做字符预算截断
  const lines: string[] = sliced.map((m) => {
    const who = m.fromMe ? "我" : "客户"
    const time = formatTime(m.t)
    const head = time ? `[${who}] [${time}]: ` : `[${who}]: `
    return head + m.body.replace(/\r\n?/g, "\n")
  })

  const picked: string[] = []
  let used = 0
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const next = used + lines[i].length + 1
    if (next > maxChars && picked.length > 0) break
    picked.unshift(lines[i])
    used = next
  }

  const charDropped = lines.length - picked.length
  const head =
    dropped > 0 || charDropped > 0
      ? `（已截取最近 ${picked.length} 条，更早的 ${dropped + charDropped} 条因长度限制省略）\n`
      : ""

  return { text: head + picked.join("\n"), count: picked.length, dropped: dropped + charDropped }
}

/** 流式总结事件 */
export type SummaryEvent =
  | { type: "chunk"; text: string }
  | { type: "done" }
  | { type: "error"; error: string }

/**
 * 发起流式 AI 总结。返回 cancel() 用于中断（关闭面板/再次点击）。
 * 端口断开/请求失败均以 error 事件结束，UI 侧恢复可交互状态。
 */
export function streamSummary(
  prompt: string,
  transcript: string,
  onEvent: (e: SummaryEvent) => void
): () => void {
  let finished = false
  let port: chrome.runtime.Port | null = null

  try {
    port = chrome.runtime.connect({ name: "ai-summary" })
  } catch (err) {
    onEvent({ type: "error", error: err instanceof Error ? err.message : String(err) })
    return () => {}
  }

  port.onMessage.addListener((msg: SummaryEvent) => {
    if (msg.type === "done" || msg.type === "error") finished = true
    onEvent(msg)
  })
  port.onDisconnect.addListener(() => {
    if (!finished) {
      finished = true
      onEvent({ type: "error", error: t("连接已断开（可能是扩展后台休眠），请重试") })
    }
  })

  port.postMessage({ prompt, transcript })

  return () => {
    if (finished) return
    finished = true
    try {
      port?.disconnect()
    } catch {
      /* 已断开 */
    }
  }
}
