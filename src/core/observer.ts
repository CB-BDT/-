import { SEL, queryAll, queryFirst, queryFirstIn } from "./selectors"

const QUOTED_SEL = ['[data-testid="quoted-message"]', ".quoted-mention"].join(",")

/** 时间戳 / 已读状态等元信息，不能混进待翻译文本 */
const META_SEL = [
  '[data-testid="msg-meta"]',
  '[data-testid="msg-time"]',
  '[data-testid="msg-dblcheck"]',
  '[data-testid="msg-check"]',
  '[data-icon^="msg-"]'
].join(",")

/** 出现这些图标说明是"我发出的"消息 */
const OUTGOING_ICON_SEL = [
  '[data-testid="msg-dblcheck"]',
  '[data-testid="msg-check"]',
  '[data-testid="msg-time"]',
  '[data-icon="msg-dblcheck"]',
  '[data-icon="msg-check"]'
].join(",")

const ROW_ID_RE = /^(?:true|false)_.+_.+$/
const MAIN_SEL = SEL.main.join(",")

export interface ScannedMessage {
  row: HTMLElement
  msgId: string
  incoming: boolean
  text: string
  textHost: HTMLElement
}

function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

function insideQuoted(el: HTMLElement, row: HTMLElement): boolean {
  let node: HTMLElement | null = el
  while (node && node !== row) {
    if (node.matches(QUOTED_SEL)) return true
    node = node.parentElement
  }
  return false
}

export function extractVisibleText(root: HTMLElement): string {
  // 根节点自身可能就是引用块（findTextHost 兜底时可能返回它），必须先挡住
  if (root.matches(QUOTED_SEL)) return ""

  let out = ""

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ""
      return
    }
    if (!(node instanceof HTMLElement)) return

    const tag = node.tagName
    if (tag === "IMG") {
      out += node.getAttribute("alt") ?? ""
      return
    }
    if (tag === "BR") {
      out += "\n"
      return
    }
    if (node.getAttribute("aria-hidden") === "true") return
    if (node.matches(QUOTED_SEL) || node.matches(META_SEL)) return
    // Shadow DOM 宿主：内容在影子树里，光 DOM 侧没有文本，直接跳过
    if (node.shadowRoot) return
    // Lexical 占位符可能是 contenteditable 内的真实节点
    if (typeof node.className === "string" && node.className.includes("placeholder")) {
      return
    }

    for (const child of Array.from(node.childNodes)) walk(child)
  }

  for (const child of Array.from(root.childNodes)) walk(child)
  return out
}

/** 从文本容器向上找到消息行；优先认 data-id，其次认 .message-in/.message-out */
export function findRow(textHost: HTMLElement): HTMLElement {
  let node: HTMLElement | null = textHost
  let fallback: HTMLElement = textHost.parentElement ?? textHost

  while (node && !node.matches(MAIN_SEL)) {
    const dataId = node.getAttribute("data-id")
    if (dataId && ROW_ID_RE.test(dataId)) return node

    if (node.classList.contains("message-in") || node.classList.contains("message-out")) {
      fallback = node
    }
    node = node.parentElement
  }

  return fallback
}

function isIncoming(row: HTMLElement, textHost: HTMLElement): boolean {
  const dataId = row.getAttribute("data-id")
  if (dataId) return dataId.startsWith("false_")

  let node: HTMLElement | null = textHost
  while (node && node !== row.parentElement) {
    if (node.classList.contains("message-in")) return true
    if (node.classList.contains("message-out")) return false
    node = node.parentElement
  }

  // 拿不到方向时，看有没有"我发出的"已读/时间图标
  if (row.querySelector(OUTGOING_ICON_SEL)) return false

  // 兜底当作接收消息：宁可多翻，不可漏翻
  return true
}

function stableId(row: HTMLElement, textHost: HTMLElement): string {
  const direct = row.getAttribute("data-id")
  if (direct) return direct

  const inner = queryFirstIn(row, ["[data-id]"])?.getAttribute("data-id")
  if (inner) return inner

  const prePlain = queryFirstIn(row, ["[data-pre-plain-text]"])?.getAttribute(
    "data-pre-plain-text"
  )

  const text = extractVisibleText(textHost).trim()
  return `tx:${hashString(`${prePlain ?? ""}\u0000${text}`)}`
}

export function findBadgeHost(row: HTMLElement): HTMLElement {
  for (const selector of SEL.badgeHost) {
    if (row.matches(selector)) return row
    const el = row.querySelector<HTMLElement>(selector)
    if (el) return el
  }
  return row
}

export function scanMessages(): ScannedMessage[] {
  const candidates = queryAll(SEL.messageText)
  // 只保留最外层的文本容器，避免 .copyable-text 与内部 span 重复计数。
  // querySelectorAll 按文档序返回（父先于子），因此每个候选只需向上查
  // 祖先链是否命中其他候选（O(n·深度)），取代原先两两 contains 的 O(n²)。
  const candSet = new Set<Element>(candidates)
  const hosts = candidates.filter((el) => {
    let p = el.parentElement
    while (p) {
      if (candSet.has(p)) return false
      p = p.parentElement
    }
    return true
  })

  const seenRows = new Set<HTMLElement>()
  const out: ScannedMessage[] = []

  for (const textHost of hosts) {
    const row = findRow(textHost)
    if (seenRows.has(row)) continue

    const text = extractVisibleText(textHost).trim()
    if (!text) continue
    if (insideQuoted(textHost, row)) continue

    seenRows.add(row)
    out.push({
      row,
      msgId: stableId(row, textHost),
      incoming: isIncoming(row, textHost),
      text,
      textHost
    })
  }

  return out
}

/** 插件自己注入的所有节点，Observer 必须完全无视它们，否则会自我触发 */
const SELF_SEL = [
  "[data-wa-copilot-badge]",
  "[data-wa-copilot-note]",
  "[data-wa-copilot-edit]",
  "#wa-copilot-toolbar",
  "#wa-copilot-header",
  "#wa-copilot-modal",
  "#wa-copilot-quickreply",
  "#wa-copilot-quickreply *",
  "[id^=\"wa-copilot\"]",
  "[id^=\"wa-copilot\"] *"
].join(",")

export function isOwnNode(node: Node | null): boolean {
  if (!node) return false
  const el = node instanceof HTMLElement ? node : node.parentElement
  if (!el) return false
  if (el.closest(SELF_SEL)) return true
  // 影子树内部的变动本来就不会被光 DOM 的 Observer 收到，这里再兜一层。
  // 不用 `instanceof ShadowRoot`，避免依赖全局构造器。
  const root = el.getRootNode()
  return root !== document && "host" in root
}

/**
 * 监听消息列表的 DOM 变化。两道防线防止死循环：
 * 1. 过滤掉插件自身节点引发的变动（徽章 / 工具栏 / 弹窗）
 * 2. 只监听消息列表容器，而不是整个 #main —— 工具栏插在 footer，
 *    消息列表之外的改动不再触发扫描
 * 虚拟列表滚动会复用节点，这里只负责"有变化"的信号，
 * 去重与回收判定交给调用方。
 */
export function observeMain(onChange: () => void): () => void {
  let target: HTMLElement | null = null
  let mo: MutationObserver | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  let fireTimes: number[] = []
  let warned = false

  const fire = (mutations: MutationRecord[]) => {
    // 防死循环的第二道闸：只检 target 不够——我们把徽章 appendChild 进消息行时，
    // target 是父节点（消息行），不是徽章自身，isOwnNode 判不到。必须再检查
    // addedNodes/removedNodes：若这次增删的节点全部是插件自己注入的，即纯自我
    // 触发（挂徽章/插工具栏/渲染弹窗），一律忽略，不触发重新扫描。
    const isSelfMutation = (m: MutationRecord): boolean => {
      if (isOwnNode(m.target)) return true
      const added = Array.from(m.addedNodes)
      const removed = Array.from(m.removedNodes)
      if (added.length === 0 && removed.length === 0) return false
      return added.every(isOwnNode) && removed.every(isOwnNode)
    }
    const relevant = mutations.filter((m) => !isSelfMutation(m))
    if (relevant.length === 0) return

    const now = Date.now()
    fireTimes = fireTimes.filter((t) => now - t < 3000)
    fireTimes.push(now)

    if (!warned && fireTimes.length >= 20) {
      warned = true
      console.warn(
        "[wa-copilot] 3 秒内触发了 20 次 DOM 扫描，可能存在循环。最近变动源：",
        relevant.slice(0, 3).map((m) => m.target)
      )
    }

    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onChange()
    }, 400)
  }

  const attach = () => {
    // 页面隐藏时跳过重挂探测：容器不会变，可见后 1s 内自然恢复，
    // 后台标签页不再每秒空查一次
    if (document.hidden) return
    const next = queryFirst(SEL.messageList)
    if (next === target) return
    mo?.disconnect()
    target = next
    if (!next) return
    mo = new MutationObserver(fire)
    // 只监听子节点增删，不监听 characterData —— 文本变动（如 React 更新徽章文字）
    // 会导致自我触发循环。属性变化也不需要。
    mo.observe(next, { childList: true, subtree: true })
  }

  attach()
  const reattach = setInterval(attach, 1000)

  return () => {
    mo?.disconnect()
    clearInterval(reattach)
    if (timer !== null) clearTimeout(timer)
  }
}
