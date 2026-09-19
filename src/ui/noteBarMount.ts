/**
 * 顶栏下方「客户备注条」。
 *
 * 为什么不放在顶栏胶囊里（之前的做法）：
 * 顶栏是固定高度的 flex 行，右侧有通话/视频/搜索/菜单四个原生按钮。
 * 备注（尤其 AI 总结几百字）在胶囊内完全展开会撑爆顶栏高度、顶飞原生按钮，
 * 或被迫截断成 "…"。所以这里给它自己的完整一行。
 *
 * 挂载点是 #main 里 header 的下一个兄弟节点：走 DOM 流（非 fixed/absolute），
 * 聊天区被自然下推，不覆盖任何消息，也不需要任何空间预算。
 */

const HOST_ID = "wa-copilot-notebar"

export const NOTE_BAR_CSS = `
  :host { all: initial; }
  .nb {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    /* 左侧铜橙竖条：与免责面板、提示条同一套 CB BDT 品牌语言 */
    border-left: 3px solid #a85d2f;
    background: rgba(242, 243, 245, .82);
    /* 冷钛蓝文字：既是品牌色，也比原先的 #8696a0 深得多，一眼看清 */
    color: #3a5769;
    font-family: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    font-size: 13px;
    line-height: 1.5;
    /* 完全展开：自动换行、不截断、不省略号（含 AI 总结这类长文本） */
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    /* 允许选中：备注常含 AI 总结，能复制才有用 */
    user-select: text;
  }
  .nb[data-dark="true"] {
    background: rgba(30, 38, 44, .88);
    color: #a9c3d3;
  }
  .nb-text { display: block; }
`

let host: HTMLElement | null = null
let body: HTMLElement | null = null
let label: HTMLElement | null = null
let shownText = ""
let shownDark: boolean | null = null

export function teardownNoteBar(): void {
  host?.remove()
  host = null
  body = null
  label = null
  shownText = ""
  shownDark = null
}

/**
 * 同步备注条。每次 tickHeader 都会调用，因此内部必须幂等且能自愈：
 *  - text 为空        → 销毁，完全不占空间
 *  - 节点被 WhatsApp 重渲染删除 → 重新创建并挂回 header 之后
 *  - 文本/主题/位置都没变       → 立即返回，零副作用
 */
export function syncNoteBar(
  header: HTMLElement,
  text: string,
  dark: boolean
): void {
  if (!text) {
    teardownNoteBar()
    return
  }

  // 定位插入点：优先用 #main 作为父容器，并把锚点取到「header 在 #main 下的
  // 最外层祖先」。WhatsApp 某些版本会给 header 包一层 wrapper，直接插
  // header.nextSibling 会落进 wrapper 内部，可能被其高度/overflow 裁掉。
  const parent = document.getElementById("main") ?? header.parentElement
  if (!parent) {
    teardownNoteBar()
    return
  }
  let anchor: HTMLElement = header
  while (anchor.parentElement && anchor.parentElement !== parent) {
    anchor = anchor.parentElement
  }
  if (anchor.parentElement !== parent) {
    // header 不在 parent 子树内（结构已变），安全退出
    teardownNoteBar()
    return
  }

  if (!host || !host.isConnected) {
    teardownNoteBar()
    const next = document.createElement("div")
    next.id = HOST_ID
    // width 撑满 + flex 0 0 auto：作为 #main（column flex）的独立一行占位，
    // 不参与其它兄弟节点的伸缩计算
    next.style.cssText = "display:block;flex:0 0 auto;width:100%;box-sizing:border-box;"
    const shadow = next.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = NOTE_BAR_CSS
    shadow.appendChild(style)
    const nextBody = document.createElement("div")
    nextBody.className = "nb"
    const nextLabel = document.createElement("span")
    nextLabel.className = "nb-text"
    nextBody.appendChild(nextLabel)
    shadow.appendChild(nextBody)
    host = next
    body = nextBody
    label = nextLabel
  }

  // 位置自愈：必须紧贴锚点（WhatsApp 重排后可能被移到别处或顺序错乱）。
  // 用「元素」兄弟节点判断而非 previousSibling：DOM 里的空白文本节点
  // 会让 previousSibling 不等于锚点，导致每 2s tick 都白插一次。
  if (host.parentElement !== parent || host.previousElementSibling !== anchor) {
    parent.insertBefore(host, anchor.nextElementSibling)
  }

  if (shownDark !== dark) {
    shownDark = dark
    body?.setAttribute("data-dark", dark ? "true" : "false")
  }

  if (shownText !== text) {
    shownText = text
    // textContent 而非 innerHTML：CRM 备注是用户自由输入，绝不做 HTML 解析
    if (label) label.textContent = `\u{1F4DD} ${text}`
  }
}
