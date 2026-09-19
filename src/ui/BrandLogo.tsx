import { useId } from "react"

/**
 * CB BDT 品牌标记（插件专属视觉标识）。
 *
 * 为什么用内联 SVG 而不是引图片：
 * - 扩展的 UI 全部渲染在 Shadow DOM 里，引外部图片要么进 web_accessible_resources、
 *   要么打成 data URI，都会增加构建与权限复杂度；内联 SVG 免打包、任意尺寸不虚。
 * - 渐变 id 用 useId 加后缀：同一页面可能存在多个实例，id 冲突会让渐变互相覆盖。
 *
 * 造型：钢制齿轮环（冷钛蓝渐变）+ 内圈铜环 + CB 字标（铜橙渐变），
 * 与 assets 里那张「CB BDT」钢印 logo 同一套语言。
 */
export function BrandLogo({ size = 24 }: { size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const steel = `url(#${uid}steel)`
  const copper = `url(#${uid}copper)`

  // 8 个轮齿：绕中心 (32,32) 每 45° 旋转一个圆角矩形
  const teeth = Array.from({ length: 8 }, (_, i) => (
    <rect
      key={i}
      x="28.5"
      y="1.5"
      width="7"
      height="13"
      rx="2.5"
      fill={steel}
      transform={`rotate(${i * 45} 32 32)`}
    />
  ))

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="CB BDT"
      style={{ display: "block", flex: "0 0 auto" }}>
      <defs>
        {/* 比参考稿的深色端略提亮，保证浅色/深色主题下都能看清 */}
        <linearGradient id={`${uid}steel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5c8299" />
          <stop offset="100%" stopColor="#3a5769" />
        </linearGradient>
        <linearGradient id={`${uid}copper`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c4713c" />
          <stop offset="100%" stopColor="#8c4722" />
        </linearGradient>
      </defs>
      {teeth}
      <circle cx="32" cy="32" r="19" fill="none" stroke={steel} strokeWidth="8" />
      <circle cx="32" cy="32" r="14" fill="none" stroke={copper} strokeWidth="2.4" />
      <text
        x="32"
        y="37.6"
        textAnchor="middle"
        fontSize="16"
        fontWeight="800"
        letterSpacing="-0.4"
        fill={copper}
        fontFamily="'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
        CB
      </text>
    </svg>
  )
}
