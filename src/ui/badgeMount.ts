import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { EngineOption } from "~core/settings"

import { MessageBadge, type BadgeState } from "./MessageBadge"

const SHADOW_CSS = `
  :host { all: initial; }
  /* 深色主题：页面 html/body 带 .dark，入站气泡为深色底，译文用浅灰。
     下拉菜单通过 portal 挂在 body，主题色在组件内 JS 检测处理 */
  :host-context(html.dark), :host-context(body.dark) { --wac-text: #aebac1; }
  .wac-pulse { animation: wacPulse 1.2s ease-in-out infinite; }
  @keyframes wacPulse { 0%,100% { opacity: .45 } 50% { opacity: .95 } }
  .wac-retry {
    background: none; border: none; padding: 0; margin: 0;
    cursor: pointer; color: inherit; font: inherit;
    text-decoration: underline; text-underline-offset: 2px;
  }
  .wac-retry:hover { opacity: 1; }
  button:hover { filter: brightness(1.08); }
`

export interface BadgeActions {
  onRetry: () => void
  /** 菜单选择一个引擎（谷歌 / Lingva / DeepL / 自定义模型） */
  onPickEngine: (id: string) => void
  /** 待确认态点「确认使用」：真正发起自定义模型请求 */
  onConfirmEngine: () => void
  /** 引擎列表。回调而非快照：设置里增删自定义模型后，refresh() 即可拿到最新列表 */
  getEngines: () => EngineOption[]
  /** 本条消息已缓存译文的引擎 id：自定义模型已有译文时免二次确认 */
  getCachedEngines: () => string[]
}

export interface BadgeHandle {
  setState(state: BadgeState): void
  /** 更新局部 UI 状态（单引擎请求进行中），不改变主翻译状态 */
  setEngineBusy(busy: boolean): void
  /** 设置变更后重渲染（引擎列表 / 已缓存引擎为实时读取） */
  refresh(): void
  destroy(): void
}

export function mountBadge(
  host: HTMLElement,
  initial: BadgeState,
  actions: BadgeActions
): BadgeHandle {
  const shadow = host.attachShadow({ mode: "open" })

  const style = document.createElement("style")
  style.textContent = SHADOW_CSS
  shadow.appendChild(style)

  const mount = document.createElement("div")
  shadow.appendChild(mount)

  const root: Root = createRoot(mount)
  let current = initial
  let engineBusy = false

  const render = () =>
    root.render(
      createElement(MessageBadge, {
        state: current,
        engineBusy,
        engines: actions.getEngines(),
        cachedEngines: actions.getCachedEngines(),
        onRetry: actions.onRetry,
        onPickEngine: actions.onPickEngine,
        onConfirmEngine: actions.onConfirmEngine
      })
    )

  render()

  return {
    setState(state) {
      current = state
      render()
    },
    setEngineBusy(busy) {
      engineBusy = busy
      render()
    },
    refresh() {
      render()
    },
    destroy() {
      try {
        root.unmount()
      } catch {
        /* ignore */
      }
      host.remove()
    }
  }
}
