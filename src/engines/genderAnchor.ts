import type { SpeakerGender } from "./types"

/**
 * 性别「形态示范」锚定句（源语言版本）。
 *
 * Google / DeepL 等 NMT 免费接口没有性别参数。单纯锚定「我是一名女性」
 * 只是名词句，译成俄语是 Я женщина. —— 示范不出过去时动词阴性（пришла）、
 * 法语复合过去时分词（arrivée）等关键形态。
 *
 * 因此锚定句必须在一行内同时覆盖三种性别载体，让引擎自己
 * 在目标语译文中演示出来，随后同请求的正文就会跟随同一形态：
 *   ① 性别自指（名词）
 *   ② 系表形容词（高兴→contenta/рада/سعيدة）
 *   ③ 到达（→法语 arrivée、俄语 пришла、波兰语 dotarłam、意语 arrivata）
 *   ④ 兴趣形容词（感兴趣→interesada/заинтересована/مهتمة）
 * 译完按换行剥离整行；剥离失败时宁可返回全文，也不泄漏半句锚定文。
 */
const ANCHORS: Partial<Record<string, [string, string]>> = {
  zh: [
    "我是女性，我很高兴，我已经到了，我对这个很感兴趣。",
    "我是男性，我很高兴，我已经到了，我对这个很感兴趣。"
  ],
  en: [
    "I am a woman, I am happy, I have arrived, and I am very interested in this.",
    "I am a man, I am happy, I have arrived, and I am very interested in this."
  ]
}

/**
 * 仅对支持的目标语中确有性别形态的语言启用（与 TARGET_LANGUAGES 对齐）：
 * 西/葡/法/意（形容词+分词配合）、德（职业名词阴性）、俄/波（过去时动词变位）、
 * 阿/印地/孟加拉（形容词一致）。
 * 英/中/日/韩/土/波斯/印尼/马来/泰/越/荷兰语：无语法性别或仅语气差异，
 * 锚定无效（日韩）或无必要，一律不加，避免锚定句剥离风险。
 */
const GENDERED_TARGETS = new Set([
  "es", "pt", "fr", "it", "de", "ru", "pl", "ar", "hi", "bn"
])

function normLang(code: string): string {
  return code.split("-")[0].toLowerCase()
}

/**
 * 用示范句包装待译文本，返回 { q, unwrap }。
 * Google 与 DeepL 引擎共用：包装后请求，译文按换行剥离锚定行。
 */
export function wrapWithGender(
  text: string,
  gender: SpeakerGender,
  source: string,
  target: string
): { q: string; unwrap: (translation: string) => string } | null {
  if (gender === "neutral") return null
  if (!GENDERED_TARGETS.has(normLang(target))) return null

  const srcKey = source === "auto" ? "zh" : normLang(source)
  const pair = ANCHORS[srcKey] ?? ANCHORS.en ?? [
    "I am a woman, I am happy, I have arrived, and I am very interested in this.",
    "I am a man, I am happy, I have arrived, and I am very interested in this."
  ]
  const anchor = pair[gender === "female" ? 0 : 1]

  return {
    q: `${anchor}\n${text}`,
    unwrap: (translation: string) => {
      const parts = translation.split("\n")
      // 至少要有「锚定句行 + 正文行」两段才剥离；
      // 引擎未保留换行时返回全文（绝不在句中猜测切点，防止切掉正文）
      if (parts.length < 2) return translation
      return parts.slice(1).join("\n").trim()
    }
  }
}
