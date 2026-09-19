const HAN_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g
const KANA_RE = /[\u3040-\u30ff\u31f0-\u31ff]/g
const LETTER_RE = /\p{L}/gu
const MEANINGFUL_RE = /[\p{L}\p{N}]/gu

/**
 * 是否"用户已经看得懂、不需要翻译"的文本。
 * 判定：汉字占实义字符 ≥30%，且不含假名（含假名说明是日语，仍需翻译）。
 * 韩文谚文不属于汉字区，因此韩语不会被误判。
 */
export function isMostlyCJK(text: string): boolean {
  const han = (text.match(HAN_RE) ?? []).length
  if (han === 0) return false

  const kana = (text.match(KANA_RE) ?? []).length
  if (kana > 0) return false

  const total = (text.match(MEANINGFUL_RE) ?? []).length || 1
  return han / total >= 0.3
}

/**
 * 判断一条接收消息是否值得翻译：
 * - 少于 2 个字母（纯 emoji / 纯标点 / 纯数字如电话号码）直接跳过
 * - 已经主要是中文的跳过（对方在用中文，无需翻译）
 */
export function shouldTranslate(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2) return false

  const letters = (trimmed.match(LETTER_RE) ?? []).length
  if (letters < 2) return false

  return !isMostlyCJK(trimmed)
}
