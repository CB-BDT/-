import { looksLikePhone } from "~core/phone"
import { CHAT_ID_RE, SEL, queryFirst } from "~core/selectors"

import type { MsgNode, WppAdapter } from "./types"

/** 单聊 chatId 形如 59171234567@c.us，号码就藏在里面 */
export const DIRECT_CHAT_RE = /^(\d{7,15})@c\.us$/

export function phoneFromChatId(chatId: string | null): string | null {
  if (!chatId) return null
  const match = chatId.match(DIRECT_CHAT_RE)
  return match ? `+${match[1]}` : null
}

function readHeaderTitle(): string | null {
  const el = queryFirst(SEL.headerTitle)
  if (!el) return null
  const text = (el.getAttribute("title") || el.textContent || "").trim()
  return text || null
}

function findActiveChatId(): string | null {
  const rows = document.querySelectorAll<HTMLElement>("#main [data-id]")
  for (const row of Array.from(rows)) {
    const raw = row.getAttribute("data-id")
    if (!raw) continue
    const match = raw.match(CHAT_ID_RE)
    if (match) return match[1]
  }
  return null
}

export const domAdapter: WppAdapter = {
  kind: "dom",

  getActiveChatId(): string | null {
    return findActiveChatId()
  },

  getActiveChatName(): string | null {
    return readHeaderTitle()
  },

  /**
   * 号码来源优先级：
   * 1. Header 标题本身是号码（未存通讯录）
   * 2. 从 chatId 反解（已存通讯录时 Header 只有姓名，但 chatId 仍带号码）
   * 3. 联系人详情抽屉已打开时读抽屉
   */
  getActivePhone(): string | null {
    const title = readHeaderTitle()
    if (title && looksLikePhone(title)) return title

    const fromChatId = findActiveChatId()?.match(DIRECT_CHAT_RE)
    if (fromChatId) return `+${fromChatId[1]}`

    const drawer = queryFirst(SEL.contactInfoPhone)
    const drawerText = drawer?.getAttribute("title") || drawer?.textContent || ""
    if (drawerText && looksLikePhone(drawerText)) return drawerText.trim()

    return null
  },

  onIncomingMessage(_cb: (m: MsgNode) => void): () => void {
    return () => {}
  }
}
