import type { CSSProperties } from "react"

import { tf } from "~core/i18n"

export interface HeaderBadgeProps {
  flag: string
  countryName: string
  langName: string
  phone: string | null
  activeDays: number | null
  // 设备标签已挪到左侧好友列表徽章显示，顶栏不再展示；
  // 客户备注也已移出顶栏——长备注在固定高度的胶囊里只能截断，
  // 现改为顶栏下方的独立备注条（见 noteBarMount.ts）
}

// maxWidth + overflow hidden 是保护性的：胶囊是 nowrap，极长国家名
// 不应把顶栏右侧的通话/搜索按钮顶飞
const wrap: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginLeft: 8,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  lineHeight: "18px",
  whiteSpace: "nowrap",
  maxWidth: 320,
  overflow: "hidden",
  background: "rgba(134,150,160,0.16)",
  color: "#8696a0",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  userSelect: "none",
  pointerEvents: "none"
}

const sep: CSSProperties = {
  width: 1,
  height: 10,
  flex: "0 0 auto",
  background: "rgba(134,150,160,0.5)"
}

/** 可截断的文本段：超出宽度显示 …，完整内容见 title */
const ellipsis: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0
}

export function HeaderBadge({
  flag,
  countryName,
  langName,
  phone,
  activeDays
}: HeaderBadgeProps) {
  const hasGeo = Boolean(countryName)
  if (!hasGeo && activeDays === null) return null

  const title = [phone, hasGeo ? `${countryName} · ${langName}` : ""]
    .filter(Boolean)
    .join("  ")

  return (
    <span style={wrap} title={title}>
      {hasGeo && (
        <span style={ellipsis}>
          {flag} {countryName} · {langName}
        </span>
      )}
      {hasGeo && activeDays !== null && <span style={sep} />}
      {activeDays !== null && <span>💬 {tf("互动 {days} 天", { days: activeDays })}</span>}
    </span>
  )
}
