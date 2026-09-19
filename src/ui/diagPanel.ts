/**
 * 自检浮层：Ctrl+Shift+D 唤出/关闭。
 * 把设备标签链路的关键运行状态 + 真实聊天行 DOM 采样直接画在页面上，
 * 方便用户截图反馈，无需开 F12 复制日志。
 */
const HOST_ID = "wa-copilot-diag"

const CSS = `
:host { all: initial; }
.box {
  position: fixed; top: 60px; right: 16px; z-index: 2147483647;
  width: 560px; max-width: 94vw; max-height: 82vh; overflow: auto;
  background: #111b21; color: #e9edef;
  font: 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;
  border: 1px solid #2a3942; border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,.5); padding: 12px 14px;
}
.hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.hd b { color: #00a884; font-size: 13px; }
.hd span { cursor:pointer; color:#8696a0; padding:0 6px; font-size:14px; }
.sec { margin: 8px 0 4px; color:#00a884; font-weight:600; }
.ok { color:#25d366; } .bad { color:#f15c6d; } .mut { color:#8696a0; }
pre {
  white-space: pre-wrap; word-break: break-all; margin: 4px 0 10px;
  background:#0b141a; border:1px solid #222d34; border-radius:6px;
  padding:6px 8px; font-size:11px; max-height:220px; overflow:auto;
}
.row { margin: 2px 0; }
`

let host: HTMLElement | null = null

export function isDiagOpen(): boolean {
  return !!host
}

export function toggleDiag(renderData: () => string | Promise<string>): void {
  if (host) {
    closeDiag()
    return
  }
  host = document.createElement("div")
  host.id = HOST_ID
  host.setAttribute("data-wa-copilot-diag", "")
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = CSS
  const box = document.createElement("div")
  box.className = "box"
  box.innerHTML =
    '<div class="hd"><b>WA Copilot 自检</b><span id="close" title="关闭">✕</span></div>' +
    '<div id="body"><div class="mut">加载中...</div></div>'
  shadow.appendChild(style)
  shadow.appendChild(box)
  document.documentElement.appendChild(host)
  const close = shadow.getElementById("close")
  close?.addEventListener("click", () => closeDiag())
  void refresh(renderData)
}

async function refresh(renderData: () => string | Promise<string>) {
  if (!host) return
  const body = host.shadowRoot?.getElementById("body")
  if (!body) return
  try {
    body.innerHTML = await renderData()
  } catch (err) {
    body.innerHTML = `<span class="bad">自检数据收集失败：${String(err)}</span>`
  }
}

export function closeDiag(): void {
  host?.remove()
  host = null
}
