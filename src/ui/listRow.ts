import { t } from "~core/i18n"

const EDIT_CSS = `
  :host { all: initial; }
  .wac-edit {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1.5px solid #fff;
    border-radius: 50%;
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
    background: rgba(0, 128, 105, .95);
    color: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,.25);
  }
  .wac-edit:hover { background: #019a7d; }
`

export function createEditButton(onClick: () => void): HTMLElement {
  const host = document.createElement("div")
  host.setAttribute("data-wa-copilot-edit", "")
  // 定位坐标由 placeEditButtonOnAvatar 按头像实际位置设置。
  // 默认放头像右上角角标；绝不使用 right 居中——那会压到 WhatsApp
  // 原生的时间/已读勾/已编辑铅笔等右侧元信息列。
  host.style.cssText =
    "position:absolute;z-index:8;display:none;"

  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = EDIT_CSS
  shadow.appendChild(style)

  const button = document.createElement("button")
  button.type = "button"
  button.className = "wac-edit"
  button.title = t("编辑客户备注")
  button.textContent = "✎"
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  // 阻止鼠标按下穿透（避免触发 WhatsApp 行选中/拖拽）
  button.addEventListener("mousedown", (event) => event.stopPropagation())
  shadow.appendChild(button)

  return host
}

/**
 * 把编辑角标定位到列表项头像的右上角。
 * 头像区域永远不被时间戳/已读勾/已编辑标记占用，是唯一安全的位置。
 * 沿 DOM 向上找第一个 36~64px 的正方形祖先（头像容器尺寸稳定，不依赖
 * 图片是否加载完成）；找不到时回退到行左侧中部。
 */
export function placeEditButtonOnAvatar(row: HTMLElement, host: HTMLElement): void {
  const rowRect = row.getBoundingClientRect()
  const img = row.querySelector("img")
  let box: DOMRect | null = null
  let node: Element | null = img
  while (node && node !== row) {
    const rr = (node as HTMLElement).getBoundingClientRect()
    if (rr.width >= 36 && rr.width <= 64 && Math.abs(rr.width - rr.height) < 6) {
      box = rr
      break
    }
    node = node.parentElement
  }
  if (box && box.width > 0) {
    // 角标凸出头像右上角约一半
    host.style.left = `${box.right - rowRect.left - 11}px`
    host.style.top = `${box.top - rowRect.top - 7}px`
    host.style.right = "auto"
    host.style.transform = "none"
  } else {
    // 回退：行左 padding 处垂直居中（不会撞右侧原生元素）
    host.style.left = "9px"
    host.style.top = "50%"
    host.style.right = "auto"
    host.style.transform = "translateY(-50%)"
  }
}

/** 会话列表项里的设备徽章（如 "🤖 Android"）。
 *  位于时间戳下方，但必须避开第二行右侧的原生列（已读勾/未读计数/
 *  已编辑铅笔/语音图标，约 30px 宽），故 right 留到 42px；
 *  半透明底色徽章即使与预览文本轻微重叠也保持可读。 */
export function createDeviceLine(text: string, dark: boolean): HTMLElement {
  const el = document.createElement("div")
  // note 属性：observer 的 SELF_SEL 已忽略；device 属性：诊断统计用
  el.setAttribute("data-wa-copilot-note", "")
  el.setAttribute("data-wa-copilot-device", "")
  el.textContent = text
  el.style.cssText = [
    "position:absolute",
    "right:42px",
    "top:31px",
    "z-index:2",
    "max-width:46%",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "font-size:10px",
    "line-height:16px",
    "padding:0 6px",
    "border-radius:8px",
    "pointer-events:none",
    "white-space:nowrap",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    `color:${dark ? "#00a884" : "#008069"}`,
    `background:${dark ? "rgba(42,57,66,0.92)" : "rgba(240,242,245,0.92)"}`
  ].join(";")
  return el
}
