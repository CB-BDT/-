import type { CSSProperties, ReactNode } from "react"

export const COLORS = {
  bg: "#ffffff",
  fg: "#2b3338",
  muted: "#5e6b73",
  border: "rgba(43, 51, 56, .08)",
  /** 冷钛蓝：CB BDT 插件主色 */
  accent: "#3a5769",
  steel: "#3a5769",
  /** 金属铜橙：CB BDT 强调色 */
  copper: "#a85d2f",
  danger: "#c62828",
  warn: "#b45309",
  panel: "#e8ebed",
  gradSteel: "linear-gradient(135deg, #4b6d82 0%, #2e4453 100%)",
  gradCopper: "linear-gradient(135deg, #c4713c 0%, #8c4722 100%)",
  glowSteel: "0 4px 8px rgba(46, 68, 83, .3)",
  glowCopper: "0 4px 8px rgba(140, 71, 34, .3)",
  /** 金属浮雕（凸起） */
  emboss: "2px 2px 4px rgba(0, 0, 0, .1), -2px -2px 4px rgba(255, 255, 255, .75)",
  /** 钢印凹陷（输入框） */
  inset: "inset 2px 2px 4px rgba(0, 0, 0, .14), inset -2px -2px 4px rgba(255, 255, 255, .7)"
}

const FONT =
  "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"

export function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section style={{ padding: "4px 16px 14px" }}>
      <h2
        style={{
          margin: "14px 0 3px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: COLORS.muted
        }}>
        {title}
      </h2>
      {hint && (
        <p style={{ margin: "0 0 6px", fontSize: 12.5, lineHeight: 1.6, color: COLORS.muted }}>
          {hint}
        </p>
      )}
      {children}
    </section>
  )
}

export function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "11px 0",
        borderBottom: `1px solid ${COLORS.border}`
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 3, lineHeight: "1.6" }}>
            {hint}
          </div>
        )}
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

export function StackRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div style={{ padding: "11px 0", borderBottom: `1px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 7 }}>{label}</div>
      {children}
      {hint && (
        <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 6, lineHeight: "1.6" }}>
          {hint}
        </div>
      )}
    </div>
  )
}

const controlBase: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid transparent",
  fontSize: 14,
  color: COLORS.fg,
  background: "#eef1f2",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: FONT
}

/** 输入类控件统一凹陷钢印，跟 WhatsApp 的扁平输入框明显区分 */
const inputStyle: CSSProperties = { ...controlBase, boxShadow: COLORS.inset }

export function TextInput({
  value,
  onChange,
  type = "text",
  placeholder,
  mono,
  width
}: {
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  mono?: boolean
  width?: number | string
}) {
  return (
    <input
      type={type}
      className="wac-s-input"
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      style={{
        ...inputStyle,
        width: width ?? "100%",
        fontFamily: mono ? "ui-monospace, Consolas, 'Courier New', monospace" : FONT
      }}
    />
  )
}

export function NumberInput({
  value,
  onChange,
  min = 1,
  max = 8,
  width = 64
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  width?: number
}) {
  return (
    <input
      type="number"
      className="wac-s-input"
      value={value}
      min={min}
      max={max}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isNaN(next)) return
        onChange(Math.min(max, Math.max(min, Math.round(next))))
      }}
      style={{ ...inputStyle, width }}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
  width
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  width?: number | string
}) {
  return (
    <select
      className="wac-s-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ ...inputStyle, width: width ?? "auto", cursor: "pointer" }}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className="wac-s-toggle"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 26,
        flex: "0 0 auto",
        borderRadius: 999,
        border: "none",
        padding: 0,
        cursor: "pointer",
        position: "relative",
        background: checked ? COLORS.steel : "#c3cbcf",
        transition: "background .2s cubic-bezier(.4,0,.2,1), box-shadow .2s cubic-bezier(.4,0,.2,1)"
      }}>
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .18s cubic-bezier(.4,0,.2,1)",
          boxShadow: "0 1px 3px rgba(15,23,42,.25)"
        }}
      />
    </button>
  )
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  full
}: {
  children: ReactNode
  onClick: () => void
  variant?: "default" | "primary" | "ghost"
  disabled?: boolean
  full?: boolean
}) {
  const palette =
    variant === "primary"
      ? { background: COLORS.gradSteel, color: "#fff", border: "1px solid transparent" }
      : variant === "ghost"
        ? { background: "transparent", color: COLORS.muted, border: "1px solid transparent" }
        : { background: "#fff", color: COLORS.fg, border: "1px solid transparent" }

  return (
    <button
      type="button"
      className="wac-s-btn"
      data-variant={variant}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...controlBase,
        ...palette,
        width: full ? "100%" : "auto",
        height: 38,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: 13.5,
        fontWeight: variant === "primary" ? 600 : 500,
        padding: "0 18px",
        boxShadow: variant === "primary" ? COLORS.glowSteel : COLORS.emboss,
        transition:
          "transform .2s cubic-bezier(.4,0,.2,1), filter .2s cubic-bezier(.4,0,.2,1), box-shadow .2s cubic-bezier(.4,0,.2,1), color .2s cubic-bezier(.4,0,.2,1)"
      }}>
      {children}
    </button>
  )
}

export function StatusText({
  tone,
  children
}: {
  tone: "idle" | "ok" | "err" | "busy"
  children: ReactNode
}) {
  const color =
    tone === "ok"
      ? COLORS.copper
      : tone === "err"
        ? COLORS.danger
        : tone === "busy"
          ? COLORS.warn
          : COLORS.muted

  return (
    <span style={{ fontSize: 12.5, color, lineHeight: "1.6", wordBreak: "break-word" }}>
      {children}
    </span>
  )
}
