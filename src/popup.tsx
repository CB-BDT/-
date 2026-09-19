import { BrandLogo } from "~ui/BrandLogo"
import { COLORS } from "~ui/controls"
import { SettingsForm } from "~ui/SettingsForm"

export default function Popup() {
  return (
    <div
      style={{
        width: 400,
        maxHeight: 580,
        overflowY: "auto",
        background: "#eef1f2",
        color: COLORS.fg,
        fontFamily:
          "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        fontSize: 14
      }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "16px 18px 12px",
          background: "#eef1f2",
          borderBottom: `1px solid ${COLORS.border}`
        }}>
        <BrandLogo size={26} />
        <strong style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.2px" }}>CB BDT</strong>
        <span style={{ fontSize: 12.5, color: COLORS.copper, fontWeight: 600 }}>插件设置</span>
      </header>
      <SettingsForm />
    </div>
  )
}
