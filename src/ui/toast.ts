/**
 * 轻量页面 Toast：Shadow DOM 隔离，2.6s 自动消失。
 * 用于 AI 精译失败等非阻断提示（失败后自动恢复谷歌译文）。
 */
const HOST_ID = "wa-copilot-toast"

const CSS = `
:host { all: initial; }
.t {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
  z-index: 2147483647; max-width: 80vw;
  background: rgba(30, 38, 44, 0.94); color: #e8ebed;
  font: 13.5px/1.55 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 11px 18px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,.1);
  /* 左侧铜橙竖条：CB BDT 插件的提示条标识 */
  border-left: 3px solid #a85d2f;
  box-shadow: 0 12px 32px rgba(43,51,56,.32);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  pointer-events: none; white-space: pre-wrap; word-break: break-word;
  animation: tin .18s ease-out;
}
@keyframes tin { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
`

let host: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function ensure(): ShadowRoot {
  if (host && shadowRoot) return shadowRoot
  host = document.createElement("div")
  host.id = HOST_ID
  host.setAttribute("data-wa-copilot-toast", "")
  shadowRoot = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = CSS
  shadowRoot.appendChild(style)
  document.documentElement.appendChild(host)
  return shadowRoot
}

export function showToast(message: string, durationMs = 2600): void {
  const root = ensure()
  if (timer) clearTimeout(timer)
  root.querySelector(".t")?.remove()
  const el = document.createElement("div")
  el.className = "t"
  el.textContent = message
  root.appendChild(el)
  timer = setTimeout(() => el.remove(), durationMs)
}
