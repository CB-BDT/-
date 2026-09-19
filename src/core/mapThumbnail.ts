/**
 * 静态地图缩略图生成器 —— 原生 Location 消息同款规格。
 *
 * 原理：手机端按消息 payload 的 jpegThumbnail 渲染卡片图，因此必须：
 * - 严格 2:1 宽高比（300x150），否则手机端会出现拉伸/黑边
 * - 图片中心精准对准经纬度，中心绘制红色大头针（与原生一致）
 * - 输出无前缀的 base64 JPEG
 *
 * 瓦片来源 OSM：页面 CSP 不放行 tile.openstreetmap.org，
 * 由 background SW 下载转 dataURL（见 router.ts fetchTiles），本地 canvas 拼接。
 */
import { callBg } from "./messages"

const TILE = 256
const THUMB_W = 300
const THUMB_H = 150
const ZOOM = 15

/** Web 墨卡托投影：经度 → 瓦片浮点坐标 */
function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z)
}

/** Web 墨卡托投影：纬度 → 瓦片浮点坐标 */
function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, z)
  )
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** 原生同款红色大头针：水滴形（圆头 + 收尖）+ 白色内孔 */
function drawPin(ctx: CanvasRenderingContext2D, cx: number, tipY: number) {
  const r = 11
  const headY = tipY - 26

  ctx.fillStyle = "#ea4335"
  ctx.beginPath()
  ctx.moveTo(cx, tipY)
  ctx.bezierCurveTo(cx - r * 0.9, tipY - 14, cx - r, headY + r * 0.6, cx - r, headY)
  ctx.arc(cx, headY, r, Math.PI, 0, false)
  ctx.bezierCurveTo(cx + r, headY + r * 0.6, cx + r * 0.9, tipY - 14, cx, tipY)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.arc(cx, headY, 4.5, 0, Math.PI * 2, false)
  ctx.fill()
}

/**
 * 生成原生规格的静态地图缩略图。
 * @returns 无前缀 base64 JPEG；任一环节失败返回 null（调用方降级发送无缩略图消息）
 */
export async function buildMapThumbnail(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const n = Math.pow(2, ZOOM)
    const xf = lngToTileX(lng, ZOOM)
    const yf = latToTileY(lat, ZOOM)
    const tx = Math.floor(xf)
    const ty = Math.floor(yf)
    // 经纬度在瓦片内的像素偏移
    const px = (xf - tx) * TILE
    const py = (yf - ty) * TILE

    // 3x3 瓦片确保覆盖 300x150 画布（多余部分画到画布外自动裁剪）
    const urls: string[] = []
    const coords: { dx: number; dy: number }[] = []
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = (tx + dx + n) % n
        const y = ty + dy
        if (y < 0 || y >= n) continue
        urls.push(`https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png`)
        coords.push({ dx, dy })
      }
    }

    const res = await callBg<string[]>({ type: "fetchTiles", urls })
    if (!res.ok || !res.data) return null

    const canvas = document.createElement("canvas")
    canvas.width = THUMB_W
    canvas.height = THUMB_H
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    // 底色：瓦片缺失时不出现黑边
    ctx.fillStyle = "#e9eef2"
    ctx.fillRect(0, 0, THUMB_W, THUMB_H)

    const cx = THUMB_W / 2
    const cy = THUMB_H / 2
    const imgs = await Promise.all(
      res.data.map((u) => (u ? loadImage(u) : Promise.resolve(null)))
    )
    imgs.forEach((img, i) => {
      if (!img) return
      const { dx, dy } = coords[i]
      ctx.drawImage(img, cx - px + dx * TILE, cy - py + dy * TILE)
    })

    drawPin(ctx, cx, cy)

    return canvas.toDataURL("image/jpeg", 0.88).replace(/^data:image\/jpeg;base64,/, "")
  } catch {
    return null
  }
}
