export const SEL = {
  main: ["#main"],

  /** Observer 的监听范围：优先只盯消息列表，避免 header/footer 的自有改动触发扫描 */
  messageList: [
    '#main [data-testid="conversation-panel-messages"]',
    "#main .copyable-area",
    '#main [role="application"]',
    "#main"
  ],

  header: ["#main header", "header"],

  headerTitle: [
    '#main header span[title]',
    '[data-testid="conversation-info-header-chat-title"]',
    '#main header [dir="auto"]'
  ],

  /** 消息文本容器，按"由内到外"优先级排列 */
  messageText: [
    '[data-testid="selectable-text"]',
    "span.selectable-text",
    '[data-testid="msg-text"]',
    "div.copyable-text"
  ],

  /** 译文徽章插入点，按"由内到外"优先级排列 */
  badgeHost: [
    '[data-pre-plain-text]',
    ".copyable-text",
    '[data-testid="msg-container"]',
    '[data-testid="msg-text"]'
  ],

  messageRow: [
    "#main [data-id]",
    '[data-testid="msg-container"]',
    ".message-in",
    ".message-out"
  ],

  incomingMessage: ['#main .message-in', '#main [data-id^="false_"]', ".message-in"],

  prePlain: ['#main [data-pre-plain-text]', "[data-pre-plain-text]"],

  composer: [
    '#main footer [contenteditable="true"][data-lexical-editor="true"]',
    '[data-testid="conversation-compose-box-input"]',
    '#main footer [contenteditable="true"]',
    '#main [contenteditable="true"][data-lexical-editor="true"]',
    'footer [contenteditable="true"]'
  ],

  footer: ["#main footer", "footer"],

  sendButton: [
    '[data-testid="send"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="发送"]',
    '[data-icon="send"]'
  ],

  chatListItem: [
    '[data-testid="cell-frame-container"]',
    '[data-testid="chat-list-cell"]',
    '#pane-side [role="listitem"]',
    'div[role="listitem"]'
  ],

  listItemName: [
    '[data-testid="cell-frame-title"]',
    '[data-testid="chat-list-title"]',
    "span[title]"
  ],

  /** 已保存联系人：详情抽屉里的号码 */
  contactInfoPhone: [
    '[data-testid="contact-info"] [data-testid="cell-frame-secondary-detail"]',
    '[data-testid="contact-info"] span[dir="auto"]'
  ]
} as const

export function queryFirst(selectors: readonly string[]): HTMLElement | null {
  for (const s of selectors) {
    const el = document.querySelector(s)
    if (el) return el as HTMLElement
  }
  return null
}

export function queryAll(selectors: readonly string[]): HTMLElement[] {
  const seen = new Set<Element>()
  const out: HTMLElement[] = []
  for (const s of selectors) {
    document.querySelectorAll(s).forEach((el) => {
      if (seen.has(el)) return
      seen.add(el)
      out.push(el as HTMLElement)
    })
  }
  return out
}

export function queryFirstIn(
  root: ParentNode,
  selectors: readonly string[]
): HTMLElement | null {
  for (const s of selectors) {
    const el = root.querySelector(s)
    if (el) return el as HTMLElement
  }
  return null
}

export const CHAT_ID_RE = /^(?:true|false)_(.+?@[a-z.]+)_/

/**
 * 自适应获取左侧会话列表行。
 * WhatsApp 频繁改 data-testid，硬编码选择器一旦改名就命中 0。
 * 这里在多选择器基础上，用「位置 + 结构」双重过滤兜底：
 *  - 必须位于页面左栏（x 中心 < 视口 58%，排除右侧消息区/联系人抽屉）
 *  - 必须有合理宽度，且含头像或标题
 */
export function getChatListRows(): HTMLElement[] {
  const candidates = queryAll(SEL.chatListItem)
  const vw = window.innerWidth || 1
  const out: HTMLElement[] = []
  const seen = new Set<HTMLElement>()
  for (const el of candidates) {
    if (seen.has(el)) continue
    seen.add(el)
    const r = el.getBoundingClientRect()
    if (r.width < 150 || r.height < 40) continue
    if (r.left < -1 || r.top < 0) continue
    // 行中心必须在左栏区域
    if (r.left + r.width / 2 > vw * 0.58) continue
    // 结构特征：含标题 span[title] 或头像
    const hasTitle = !!el.querySelector('span[title]')
    const hasAvatar =
      !!el.querySelector('img') ||
      !!el.querySelector('[data-testid*="avatar"]') ||
      !!el.querySelector('span[data-icon]')
    if (!hasTitle && !hasAvatar) continue
    out.push(el)
  }
  return out
}
