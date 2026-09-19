import { BrandLogo } from "~ui/BrandLogo"
import { COLORS } from "~ui/controls"
import { SettingsForm } from "~ui/SettingsForm"

export default function Options() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f2f3f5",
        padding: "28px 16px",
        fontFamily:
          "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        fontSize: 14,
        color: COLORS.fg
      }}>
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          background: "#eef1f2",
          borderRadius: 18,
          boxShadow: "3px 3px 6px rgba(0, 0, 0, .12), -3px -3px 6px rgba(255, 255, 255, .8)",
          overflow: "hidden"
        }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${COLORS.border}`
          }}>
          <BrandLogo size={30} />
          <strong style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-.2px" }}>
            CB BDT
          </strong>
          <span style={{ fontSize: 12.5, color: COLORS.copper, fontWeight: 600 }}>
            插件设置
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: COLORS.muted }}>
            与 WhatsApp 原生界面无关
          </span>
        </header>
        <SettingsForm />
      </div>
    </div>
  )
}
