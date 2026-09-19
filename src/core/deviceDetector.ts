/**
 * 对方设备类型检测（纯被动 DOM 观察，不调 WPP API）
 *
 * 原理：WhatsApp Web 消息行的 data-id 形如
 *   `false_86138XXXXXXXX@c.us_3EB03F4D2A5B6C7D8E9F`
 *   `false_120363XXXXXXXX@g.us_86138XXXXXXXX_3EB03F4D2A5B6C7D8E9F`
 *
 * 最后一个 `_` 之后就是消息 ID，其特征可区分发送设备：
 *   - iOS:  以 3EB0 开头，恰好 20 位纯大写 HEX
 *   - Android: 以 3EB0 开头，长度 >20 或包含小写字母/下划线
 *   - Web/Desktop: JID 段含 ":1"/":2" 等设备后缀
 *   - 兜底: Android（WhatsApp Android 市场份额最高）
 *
 * 仅读取已渲染的 DOM 属性，不调用任何 WhatsApp 内部接口，风控风险为零。
 */

export type DeviceType = "iOS" | "Android" | "Web" | "Desktop" | "Unknown"

interface ParsedDataId {
  /** 对方 JID（如 8613800138888@c.us），群聊含发件人 JID */
  jid: string
  /** 消息 ID（如 3EB03F4D2A5B6C7D8E9F） */
  msgId: string
  /** 是否为入站消息（对方发的） */
  incoming: boolean
}

/** 从 data-id 中提取 JID 和消息 ID。 */
export function parseDataId(dataId: string): ParsedDataId | null {
  // 格式: [true|false]_<jid>_<msgId>  或  [true|false]_<groupJid>_<participantJid>_<msgId>
  // 消息 ID 本身可能含下划线（Android），不能简单 split("_")。
  // 策略：找到最后一次出现的 "@c.us_" 或 "@g.us_"，它之后就是消息 ID；
  //       它之前最近的一个 "_" 之后、到该 "@xxx" 结束，就是发送者 JID。

  const incoming = dataId.startsWith("false_")

  // 找最后一次 "@<server>_"（c.us / g.us / lid / broadcast 等任意服务器段）。
  // 新版 WhatsApp 对部分联系人使用 @lid 隐私格式，必须泛化匹配，
  // 否则这些聊天的设备检测永远返回 Unknown。
  const re = /@[^_]+_/g
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(dataId)) !== null) {
    lastMatch = m
  }
  if (!lastMatch) return null

  // msgId = 匹配点之后的所有内容
  const msgStart = lastMatch.index + lastMatch[0].length
  const msgId = dataId.substring(msgStart)
  if (!msgId) return null

  // 发送者 JID = 最后一个 "_" 之后、到 "@c.us"/"@g.us" 结束
  const beforeMatch = dataId.substring(0, lastMatch.index) // 不含 @
  const lastUnder = beforeMatch.lastIndexOf("_")
  if (lastUnder === -1) return null
  // JID = 从 lastUnder+1 到 lastMatch.index + "@xxx" 的长度（含 @c.us / @g.us）
  const jid = dataId.substring(lastUnder + 1, lastMatch.index + lastMatch[0].length - 1)
  if (!jid) return null

  return { jid, msgId, incoming }
}

/** 根据 JID 和消息 ID 判断设备类型。 */
export function detectDevice(dataId: string): DeviceType {
  const parsed = parseDataId(dataId)
  if (!parsed) return "Unknown"

  const { jid, msgId } = parsed

  // 1. JID 含设备后缀（:1=Web, :2=Desktop，多端登录场景）
  const colonIdx = jid.indexOf(":")
  if (colonIdx !== -1) {
    const suffix = jid.substring(colonIdx + 1).split("@")[0]
    if (suffix === "1") return "Web"
    if (suffix === "2") return "Desktop"
    // 其他数字也视为桌面端
    if (/^\d+$/.test(suffix)) return "Desktop"
  }

  // 2. 消息 ID 前缀特征
  if (msgId.startsWith("3EB0")) {
    // iOS: 恰好 20 位纯大写 HEX
    if (msgId.length === 20 && /^[0-9A-F]+$/.test(msgId)) {
      return "iOS"
    }
    // Android: 长度 >20 或含小写字母/下划线
    if (msgId.length > 20 || msgId.includes("_") || /[a-z]/.test(msgId)) {
      return "Android"
    }
  }

  // 兜底：WhatsApp Android 用户占比最高
  return "Android"
}

/** 批量推断：取最近一条入站消息的设备类型为准。 */
export function detectDeviceFromRows(
  rows: { dataId: string; incoming: boolean }[]
): DeviceType {
  // 优先取最后一条入站（对方发的）消息
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i]
    if (!r.incoming) continue
    const dev = detectDevice(r.dataId)
    if (dev !== "Unknown") return dev
  }
  // 全是出站消息时也试一下
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const dev = detectDevice(rows[i].dataId)
    if (dev !== "Unknown") return dev
  }
  return "Unknown"
}

/** WPP getMessages 回传的原始消息 ID 信息（relay.js 只回传不判定）。 */
export interface RawMsgId {
  /** 纯消息 ID，如 3EB03F4D2A5B6C7D8E9F */
  id: string
  /** 序列化 key，如 false_86139111111@c.us_3EB03F4D2A5B6C7D8E9F */
  serialized?: string
  fromMe: boolean
}

/**
 * 从 WPP 原始消息列表推断对方设备：取最近一条对方发的消息。
 * 优先用 serialized（信息最全），退化为纯 id。
 */
export function detectDeviceFromMsgs(msgs: RawMsgId[]): DeviceType {
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i]
    if (m.fromMe) continue
    // serialized 形如 false_<jid>_<msgId>，直接复用 data-id 判定
    const dev = m.serialized
      ? detectDevice(m.serialized)
      : detectDeviceFromBareId(m.id)
    if (dev !== "Unknown") return dev
  }
  return "Unknown"
}

/** 只有纯消息 ID（无 JID 段）时的判定。 */
function detectDeviceFromBareId(msgId: string): DeviceType {
  if (!msgId) return "Unknown"
  // 3EB0 系 ID：iOS 恰好 20 位纯大写 HEX，其余（更长/含小写/下划线/== 结尾）为 Android/Web
  if (msgId.startsWith("3EB0")) {
    if (msgId.length === 20 && /^[0-9A-F]+$/.test(msgId)) return "iOS"
    if (msgId.length > 20 || msgId.includes("_") || msgId.endsWith("==") || /[a-z]/.test(msgId)) {
      return "Android"
    }
  }
  // 兜底：WhatsApp Android 用户占比最高
  return "Android"
}

/* ------------------------------ UI 辅助 ------------------------------ */

const DEVICE_ICON: Record<DeviceType, string> = {
  iOS: "\u{1F34F}",        // 🍏
  Android: "\u{1F916}",    // 🤖
  Web: "\u{1F4BB}",        // 💻
  Desktop: "\u{1F5A5}\uFE0F", // 🖥️
  Unknown: "\u{2754}"      // ❔
}

const DEVICE_LABEL: Record<DeviceType, string> = {
  iOS: "iOS",
  Android: "Android",
  Web: "Web",
  Desktop: "Desktop",
  Unknown: ""
}

export function deviceIcon(d: DeviceType): string {
  return DEVICE_ICON[d] ?? ""
}

export function deviceLabel(d: DeviceType): string {
  return DEVICE_LABEL[d] ?? ""
}
