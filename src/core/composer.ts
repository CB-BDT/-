import { extractVisibleText } from "./observer"
import { SEL, queryFirst } from "./selectors"

export interface ComposerApi {
  element(): HTMLElement | null
  read(): string
  replace(text: string): Promise<boolean>
  send(): Promise<boolean>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getComposer(): HTMLElement | null {
  return queryFirst(SEL.composer)
}

function isEditable(el: HTMLElement): boolean {
  return el.isContentEditable || el.getAttribute("contenteditable") === "true"
}

function resolveEditable(el: HTMLElement): HTMLElement {
  if (isEditable(el)) return el
  const inner = el.querySelector<HTMLElement>('[contenteditable="true"]')
  return inner ?? el
}

function normalize(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * 不用 innerText：它会强制同步布局（工具栏 400ms 轮询一次代价明显）。
 * extractVisibleText 走纯 DOM 遍历，同时能正确还原 <br> 换行与 emoji。
 */
export function readComposerText(): string {
  const el = getComposer()
  if (!el) return ""
  return normalize(extractVisibleText(resolveEditable(el)))
}

function selectAllEditable(el: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
}

function matches(el: HTMLElement, expected: string): boolean {
  return normalize(extractVisibleText(el)) === normalize(expected)
}

function insertByLines(text: string): boolean {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  let any = false
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) document.execCommand("insertLineBreak", false)
    if (lines[i].length > 0 && document.execCommand("insertText", false, lines[i])) {
      any = true
    }
  }
  return any
}

interface Strategy {
  name: string
  run: (el: HTMLElement, text: string) => Promise<boolean>
}

/**
 * WhatsApp Web 用 Lexical 富文本编辑器。直接写 textContent / value 不会同步到
 * editorState，随后会被下一次渲染覆盖。这里按"最原生 → 最兜底"依次尝试，
 * 每一步都用 DOM 内容回读校验，只有真正生效才返回成功。
 */
const STRATEGIES: Strategy[] = [
  {
    name: "execCommand:delete+insert",
    async run(el, text) {
      el.focus()
      selectAllEditable(el)
      try {
        document.execCommand("delete", false)
      } catch {
        /* ignore */
      }
      let ok = false
      try {
        ok = document.execCommand("insertText", false, text)
      } catch {
        ok = false
      }
      if (!ok) ok = insertByLines(text)
      await sleep(50)
      return matches(el, text)
    }
  },
  {
    name: "beforeinput:insertText",
    async run(el, text) {
      el.focus()
      selectAllEditable(el)
      const init = {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text
      }
      try {
        el.dispatchEvent(new InputEvent("beforeinput", init))
        el.dispatchEvent(new InputEvent("input", init))
      } catch {
        return false
      }
      await sleep(60)
      return matches(el, text)
    }
  },
  {
    name: "paste",
    async run(el, text) {
      el.focus()
      selectAllEditable(el)
      try {
        const data = new DataTransfer()
        data.setData("text/plain", text)
        const event = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data
        } as unknown as ClipboardEventInit)
        el.dispatchEvent(event)
      } catch {
        return false
      }
      await sleep(80)
      return matches(el, text)
    }
  },
  {
    name: "direct-dom",
    async run(el, text) {
      try {
        el.textContent = ""
        const lines = text.replace(/\r\n?/g, "\n").split("\n")
        lines.forEach((line, index) => {
          if (index > 0) el.appendChild(document.createElement("br"))
          el.appendChild(document.createTextNode(line))
        })
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: text
          })
        )
      } catch {
        return false
      }
      await sleep(50)
      return matches(el, text)
    }
  }
]

export async function replaceComposerText(text: string): Promise<boolean> {
  const el = getComposer()
  if (!el) return false

  const editable = resolveEditable(el)

  for (const strategy of STRATEGIES) {
    try {
      if (await strategy.run(editable, text)) {
        console.log(`[wa-copilot] 写入输入框成功（策略 ${strategy.name}）`)
        return true
      }
    } catch (err) {
      console.warn(`[wa-copilot] 写入策略 ${strategy.name} 抛错`, err)
    }
  }

  console.warn("[wa-copilot] 全部写入策略失败，当前输入框内容：", readComposerText())
  return false
}

export function dispatchEnter(el: HTMLElement) {
  const init = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    composed: true
  } as unknown as KeyboardEventInit

  el.dispatchEvent(new KeyboardEvent("keydown", init))
  el.dispatchEvent(new KeyboardEvent("keyup", init))
}

export function clickSendButton(): boolean {
  const node = queryFirst(SEL.sendButton)
  if (!node) return false
  const button = (node.closest("button") ?? node) as HTMLElement
  button.click()
  return true
}

/**
 * 轮询等待输入框被清空（发送成功的判据）。
 * WhatsApp 处理发送是异步的，固定 sleep 一个值必然踩坑：等太短会误判
 * 成"没发出去"，等太长又拖慢交互。轮询到清空即返回，最多等 timeoutMs。
 */
async function waitComposerCleared(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await sleep(60)
    if (!readComposerText()) return true
    if (Date.now() >= deadline) return false
  }
}

/**
 * 发送消息：**只保留一个触发源，绝不串联 Enter 和发送按钮**。
 *
 * 原实现先派发 Enter，220ms 后输入框没清空再点发送按钮。但 WhatsApp
 * 处理 Enter 是异步的，耗时超过 220ms 时输入框仍在，按钮于是又发了一次
 * —— 同一条消息出现两条（如 Buenas noches 重复）。
 *
 * 现在：优先点 WhatsApp 自己的发送按钮（语义明确，一次点击只触发一次
 * 发送）；按钮不存在时才退回 Enter——此时尚未触发过任何发送，串联导致的
 * 重复风险不存在。触发后只做轮询验证，验证失败也不再补发，宁可不发也
 * 绝不重复发。
 */
export async function sendComposerMessage(): Promise<boolean> {
  const el = getComposer()
  if (!el) return false
  if (!readComposerText()) return false

  if (clickSendButton()) {
    return waitComposerCleared(2000)
  }

  const editable = resolveEditable(el)
  editable.focus()
  dispatchEnter(editable)
  return waitComposerCleared(2000)
}

export const composerApi: ComposerApi = {
  element: getComposer,
  read: readComposerText,
  replace: replaceComposerText,
  send: sendComposerMessage
}
