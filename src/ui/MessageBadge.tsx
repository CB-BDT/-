import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from "react"
import { createPortal } from "react-dom"

import { t, tf } from "~core/i18n"
import type { EngineOption } from "~core/settings"

export type BadgeState =
  | {
      status: "loading"
      /** 自定义模型请求：显示 ✨ 与模型名，与免费引擎的普通加载态区分 */
      kind?: "google" | "ai"
      label?: string
    }
  | {
      status: "done"
      text: string
      /** 译文出处的显示名（tooltip 与按钮兜底用） */
      engine?: string
      /** 当前展示的引擎 id */
      shown?: string
      /** 待确认的目标引擎 id（自定义模型首次选择）；null/undefined = 无待确认 */
      pendingEngine?: string | null
    }
  | { status: "error"; message: string }

export interface MessageBadgeProps {
  state: BadgeState
  onRetry: () => void
  /** 菜单点选引擎：父级决定「内存缓存直接切 / 直接翻译 / 进入待确认」 */
  onPickEngine: (id: string) => void
  /** 待确认态点「确认使用」：真正发起该自定义模型请求 */
  onConfirmEngine: () => void
  /** 引擎列表（谷歌 / Lingva / DeepL / 自定义模型），与工具栏同源 */
  engines: EngineOption[]
  /** 本条消息已缓存译文的引擎 id：自定义模型已有译文时免二次确认 */
  cachedEngines: string[]
  /** 单引擎请求进行中（按钮显示 ⏳ 并禁用） */
  engineBusy?: boolean
}

const wrap: CSSProperties = {
  marginTop: 5,
  paddingTop: 4,
  borderTop: "1px dashed rgba(134,150,160,0.45)",
  fontSize: 13.5,
  lineHeight: "21px",
  // 浅色气泡深灰；深色主题由 badgeMount 的 :host-context 覆盖变量为浅灰
  color: "var(--wac-text, #3b4a54)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily:
    "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  userSelect: "text",
  position: "relative"
}

// 右侧预留 60px：WhatsApp 气泡右下角的时间戳（23:14）是浮层，
// 不留白译文会压到时间
const textStyle: CSSProperties = { paddingRight: 60 }

const tagStyle: CSSProperties = {
  display: "inline-block",
  marginRight: 5,
  padding: "1px 6px",
  borderRadius: 6,
  fontSize: 11,
  lineHeight: "16px",
  fontWeight: 600,
  color: "#fff",
  background: "#a85d2f",
  verticalAlign: "1px"
}

// ------------------------------ 收纳式引擎选择器 ------------------------------

const pickerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginTop: 5,
  paddingRight: 60
}

const pickerBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 28,
  padding: "0 12px",
  borderRadius: 999,
  // 冷钛蓝：插件注入的控件，和 WhatsApp 原生绿明显不同
  border: "1px solid #3a5769",
  background: "rgba(58,87,105,0.1)",
  color: "#3a5769",
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: "18px",
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
  transition: "filter .18s cubic-bezier(.4,0,.2,1), box-shadow .18s cubic-bezier(.4,0,.2,1)"
}

const pendingTag: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  lineHeight: "16px",
  padding: "1px 7px",
  borderRadius: 999,
  background: "rgba(168,93,47,0.16)",
  color: "#a85d2f"
}

const arrow: CSSProperties = { fontSize: 10, marginLeft: 1 }

// 弹层用 fixed：翻译徽章挂在 WhatsApp 气泡内部，气泡圆角容器可能有
// overflow:hidden，absolute 弹层会被裁掉；fixed 脱离裁剪祖先。
// 另外菜单通过 createPortal 挂到 document.body——WhatsApp 气泡祖先带
// transform（消息滑入动画），会使 shadow 内部的 fixed 相对变换祖先定位、
// 坐标飞到屏幕另一侧；portal 到 body 后包含块永远是真实视口。
// 宽度按「自定义模型名可能很长」放宽，高度不写死：菜单项数量随自定义模型
// 个数变化，改为打开后用 offsetHeight 实测（见 SourcePicker.reposition）。
const MENU_W = 190

function isDarkTheme(): boolean {
  return (
    document.documentElement.classList.contains("dark") ||
    document.body.classList.contains("dark")
  )
}

function menuPalette(dark: boolean) {
  return {
    bg: dark ? "#232f36" : "#f2f3f5",
    text: dark ? "#e8ebed" : "#2b3338",
    border: dark ? "rgba(255,255,255,0.1)" : "rgba(43,51,56,0.08)",
    hoverBg: dark ? "rgba(148,163,184,0.16)" : "rgba(58,87,105,0.08)"
  }
}

const menuStyleBase: CSSProperties = {
  position: "fixed",
  width: MENU_W,
  borderRadius: 14,
  boxShadow: "0 16px 48px rgba(15,23,42,0.22), 0 1px 2px rgba(15,23,42,0.08)",
  padding: "6px 0",
  zIndex: 2147483646,
  boxSizing: "border-box"
}

const menuItem: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 13.5,
  lineHeight: "19px",
  transition: "background .18s cubic-bezier(.4,0,.2,1)"
}

// 自定义模型名可能很长：允许换行而不是溢出（高度由 offsetHeight 实测）
const menuItemLabel: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere"
}

const menuItemActive: CSSProperties = { color: "#a85d2f", fontWeight: 600 }

const menuFooter: CSSProperties = { padding: "8px 10px 4px" }

const confirmBtn: CSSProperties = {
  width: "100%",
  height: 36,
  padding: 0,
  background: "linear-gradient(135deg, #c4713c 0%, #8c4722 100%)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 13.5,
  fontWeight: 600,
  fontFamily: "inherit",
  outline: "none",
  boxShadow: "0 4px 8px rgba(140,71,34,0.3)",
  transition: "filter .2s cubic-bezier(.4,0,.2,1)"
}

const retry: CSSProperties = { marginLeft: 6, fontSize: 12.5, opacity: 0.8 }

function stop(e: ReactMouseEvent) {
  e.preventDefault()
  e.stopPropagation()
}

/** 菜单项：portal 到 body 后 Shadow 样式表的 :hover 失效，用 state 实现 */
function MenuItem({
  label,
  checked,
  palette,
  onClick
}: {
  label: string
  checked: boolean
  palette: ReturnType<typeof menuPalette>
  onClick: (e: ReactMouseEvent) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{
        ...menuItem,
        background: hover ? palette.hoverBg : "transparent",
        color: checked ? "#a85d2f" : palette.text,
        ...(checked ? menuItemActive : null)
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={stop}
      onClick={onClick}
    >
      <span style={menuItemLabel}>{label}</span>
      {checked && <span>✓</span>}
    </div>
  )
}

function SourcePicker({
  engines,
  shown,
  engineName,
  pendingEngine,
  cachedEngines,
  engineBusy,
  onPickEngine,
  onConfirmEngine
}: {
  /** 全引擎列表（谷歌 / Lingva / DeepL / 自定义模型），与工具栏同源 */
  engines: EngineOption[]
  /** 当前展示的引擎 id */
  shown: string
  /** 展示引擎的显示名兜底：该模型已被从设置里删除时列表里查不到 */
  engineName: string
  /** 待确认的目标引擎 id（null = 无） */
  pendingEngine: string | null
  /** 本条已缓存译文的引擎 id */
  cachedEngines: string[]
  engineBusy: boolean
  onPickEngine: (id: string) => void
  onConfirmEngine: () => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const [dark, setDark] = useState(false)
  // 内联样式没法写 :hover，按钮/确认键的悬停反馈用状态模拟
  const [btnHover, setBtnHover] = useState(false)
  const [confirmHover, setConfirmHover] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 高度实测：菜单项数量随自定义模型个数变化，不能再写死常量，
  // 否则项数多时会向上越界、项数少时会离按钮太远
  const reposition = () => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const GAP = 6
    const h = menuRef.current?.offsetHeight ?? 120
    const placeUp = r.top > h + GAP + 8
    setCoords({
      left: Math.max(6, Math.min(r.left, window.innerWidth - MENU_W - 8)),
      top: placeUp ? r.top - h - GAP : r.bottom + GAP
    })
  }

  // 打开期间：聊天区内部滚动或窗口变化时，菜单跟随按钮。
  // 依赖 engines.length / pendingEngine：待确认按钮出现会使菜单变高，需重定位
  useLayoutEffect(() => {
    if (!open) return
    reposition()
    // WhatsApp 滚动容器是内部 div，window 上的 scroll 事件不冒泡，
    // 必须 capture 阶段监听
    window.addEventListener("resize", reposition)
    window.addEventListener("scroll", reposition, true)
    return () => {
      window.removeEventListener("resize", reposition)
      window.removeEventListener("scroll", reposition, true)
    }
  }, [open, engines.length, pendingEngine])

  // 点组件外部 / Esc 关闭
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const path = e.composedPath ? e.composedPath() : []
      if (
        !path.includes(btnRef.current as EventTarget) &&
        !path.includes(menuRef.current as EventTarget)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    // 延迟一帧注册，避免本次"打开菜单"的点击立即触发关闭
    const t = setTimeout(() => document.addEventListener("click", onDocClick), 0)
    document.addEventListener("keydown", onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener("click", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const shownOption = engines.find((e) => e.id === shown)
  // 展示的是自定义模型译文 → 紫色实心按钮
  const isAI = !!shownOption?.isAI
  const pendingOption = pendingEngine
    ? engines.find((e) => e.id === pendingEngine)
    : undefined
  // 待确认态：按钮显示待确认的目标引擎（紫，非实心）
  const showPending = pendingEngine !== null
  const showAI = isAI || showPending
  const palette = menuPalette(dark)

  const toggle = () => {
    if (engineBusy) return
    if (!open) {
      // 打开瞬间同步算好坐标并读取主题，避免首帧 0,0 闪烁
      setDark(isDarkTheme())
      reposition()
    }
    setOpen((v) => !v)
  }

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        style={{
          ...menuStyleBase,
          top: coords.top,
          left: coords.left,
          background: palette.bg,
          border: `1px solid ${palette.border}`
        }}
        // portal 在 light DOM(body)，阻断冒泡防止穿透到 WhatsApp 页面
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {engines.map((o) => (
          <MenuItem
            key={o.id}
            label={o.isAI ? `✨ ${o.label}` : o.label}
            checked={!showPending && o.id === shown}
            palette={palette}
            onClick={(e) => {
              stop(e)
              onPickEngine(o.id)
              // 自定义模型且本条尚无它的译文：父级会进入待确认，
              // 菜单保留以显示底部「确认使用」；其余情况立即收起
              if (o.isAI && !cachedEngines.includes(o.id)) return
              setOpen(false)
            }}
          />
        ))}
        {showPending && (
          <div style={{ ...menuFooter, borderTop: `1px solid ${palette.border}` }}>
            <button
              type="button"
              style={{
                ...confirmBtn,
                filter: confirmHover ? "brightness(1.1)" : undefined
              }}
              onMouseEnter={() => setConfirmHover(true)}
              onMouseLeave={() => setConfirmHover(false)}
              onMouseDown={stop}
              onClick={(e) => {
                stop(e)
                setOpen(false)
                onConfirmEngine()
              }}
            >
              {t("确认使用")}
            </button>
          </div>
        )}
      </div>,
      document.body
    )

  return (
    <div style={pickerRow}>
      <button
        ref={btnRef}
        type="button"
        style={{
          ...pickerBtn,
          ...(showAI
            ? {
                borderColor: "#a85d2f",
                background: isAI ? "#a85d2f" : "rgba(168,93,47,0.12)",
                color: isAI ? "#fff" : "#a85d2f"
              }
            : null),
          filter: btnHover && !engineBusy ? "brightness(0.95)" : undefined,
          opacity: engineBusy ? 0.7 : 1,
          cursor: engineBusy ? "wait" : "pointer"
        }}
        disabled={engineBusy}
        onMouseEnter={() => setBtnHover(true)}
        onMouseLeave={() => setBtnHover(false)}
        onMouseDown={stop}
        onClick={(e) => {
          stop(e)
          toggle()
        }}
      >
        {engineBusy
          ? "⏳"
          : showPending
            ? `✨ ${pendingOption?.label ?? pendingEngine}`
            : (shownOption?.label ?? engineName)}
        {showPending && <span style={pendingTag}>{t("待确认")}</span>}
        <span style={arrow}>▾</span>
      </button>
      {menu}
    </div>
  )
}

export function MessageBadge({
  state,
  onRetry,
  onPickEngine,
  onConfirmEngine,
  engines,
  cachedEngines,
  engineBusy
}: MessageBadgeProps) {
  if (state.status === "loading") {
    return (
      <div style={wrap} className="wac-pulse">
        {state.kind === "ai"
          ? tf("✨ {label} 翻译中…", { label: state.label || "AI" })
          : t("翻译中…")}
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div style={wrap}>
        <span title={state.message}>{t("翻译失败")}</span>
        <button type="button" className="wac-retry" style={retry} onClick={onRetry}>
          {t("重试")}
        </button>
      </div>
    )
  }

  const shown = state.shown ?? "google"
  const isAI = !!engines.find((e) => e.id === shown)?.isAI

  return (
    <div style={wrap}>
      <div style={textStyle} title={state.engine ? `via ${state.engine}` : undefined}>
        {isAI && <span style={tagStyle}>AI</span>}
        {state.text}
      </div>

      <SourcePicker
        engines={engines}
        shown={shown}
        engineName={state.engine ?? shown}
        pendingEngine={state.pendingEngine ?? null}
        cachedEngines={cachedEngines}
        engineBusy={!!engineBusy}
        onPickEngine={onPickEngine}
        onConfirmEngine={onConfirmEngine}
      />
    </div>
  )
}
