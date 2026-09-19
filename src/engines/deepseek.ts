import { t, tf } from "~core/i18n"

import { ConfigError, HttpError, type Engine, type SpeakerGender } from "./types"

const ENDPOINT = "https://api.deepseek.com/chat/completions"

const LANG_NAMES: Record<string, string> = {
  "zh-CN": "Simplified Chinese (简体中文)",
  "zh-TW": "Traditional Chinese (繁體中文)",
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  ru: "Russian",
  uk: "Ukrainian",
  ar: "Arabic",
  tr: "Turkish",
  fa: "Persian",
  hi: "Hindi",
  ur: "Urdu",
  bn: "Bengali",
  id: "Indonesian",
  ms: "Malay",
  th: "Thai",
  vi: "Vietnamese",
  ja: "Japanese",
  ko: "Korean",
  pl: "Polish"
}

function langLabel(target: string): string {
  return LANG_NAMES[target] ?? target
}

/**
 * 说话者性别对译文词形的约束（仅出站翻译传入时生效）。
 * 性别差异在各语言中的载体完全不同，不能只举一个词：
 *  - 罗曼语：表语形容词/分词阴性词尾；法/意复合过去时必须配合
 *  - 斯拉夫语：第一人称过去时动词本身变性（强制性最高、出现频率最高）
 *  - 德语：职业/身份名词阴性形式
 *  - 闪含/南亚：形容词与（部分）动词一致
 *  - 日韩：无词形变化，只有语气层面的女性化礼貌体
 */
function genderDirective(gender: SpeakerGender): string {
  if (gender === "female") {
    return [
      "说话者（即译文中的第一人称「我」）是一位女性。",
      "即使中文原文没有任何性别标记（如「我到了」「我很高兴」「我做过了」），",
      "译入下列语言时也必须严格使用与女性说话者一致的语法形式：",
      "1. 西班牙语、葡萄牙语：描述说话者自身的形容词与分词性表语一律用阴性，",
      "例如 contenta、cansada、interesada、fascinada、atraída、enganchada、ocupada、",
      "casada、soltera、enferma；身份/职业名词用阴性形式（amiga、clienta、médica、jefa）。",
      "2. 意大利语：形容词用阴性（contenta、interessata、stanca、occupata）；",
      "用 essere 构成的近过去时，过去分词必须用阴性（sono arrivata、sono andata、sono nata）。",
      "3. 法语：表语形容词加阴性词尾（contente、intéressée、fatiguée、occupée、ravie）；",
      "用 être 构成的复合过去时，过去分词必须与女性主语配合",
      "（je suis arrivée、je suis allée、je suis entrée、je suis née）；身份名词用阴性形式。",
      "4. 德语：职业与身份名词必须使用女性形式（Ärztin、Lehrerin、Freundin、Kundin、Chefin）。",
      "5. 俄语、波兰语等斯拉夫语言：第一人称过去时动词必须使用女性变位——",
      "这是强制性最高的规则，几乎每一句过去式都要体现：",
      "俄语 я сделала、пришла、была、смогла、хотела，短尾形容词 рада、занята、довольна；",
      "波兰语 zrobiłam、byłam、chciałam、mogłam、jestem zadowolona。",
      "6. 阿拉伯语：描述说话者的形容词用阴性（سعيدة、مهتمة、متعبة、مشغولة）。",
      "7. 印地语、孟加拉语：可变性别形容词与完成体按女性一致（如印地语 मैं व्यस्त हूँ 中按女性形态选择）。",
      "8. 日语、韩语：不使用男性化的粗俗终助词或表达，使用自然、得体的女性礼貌语气。"
    ].join("")
  }
  if (gender === "male") {
    return [
      "说话者（即译文中的第一人称「我」）是一位男性。",
      "即使中文原文没有任何性别标记，译入下列语言时也必须使用与男性说话者一致的语法形式：",
      "1. 西班牙语、葡萄牙语：描述说话者的形容词与分词性表语用阳性",
      "（contento、cansado、interesado、fascinado、atraído、enganchado、ocupado、soltero）；",
      "身份/职业名词用阳性形式（amigo、cliente、médico、jefe）。",
      "2. 意大利语：形容词阳性（contento、interessato、stanco）；essere 近过去时分词阳性",
      "（sono arrivato、sono andato、sono nato）。",
      "3. 法语：表语形容词阳性（content、intéressé、fatigué、occupé、ravi）；",
      "être 复合过去时分词阳性（je suis arrivé、je suis allé、je suis entré、je suis né）。",
      "4. 德语：职业与身份名词使用阳性/泛指形式（Arzt、Lehrer、Freund、Kunde、Chef）。",
      "5. 俄语、波兰语等斯拉夫语言：第一人称过去时动词必须使用男性变位：",
      "俄语 я сделал、пришёл、был、смог、хотел，短尾形容词 рад、занят、доволен；",
      "波兰语 zrobiłem、byłem、chciałem、mogłem。",
      "6. 阿拉伯语：描述说话者的形容词用阳性（سعيد、مهتم、متعب、مشغول）。",
      "7. 印地语、孟加拉语：可变性别形容词与完成体按男性一致。",
      "8. 日语、韩语：使用自然的男性/中性礼貌语气。"
    ].join("")
  }
  return ""
}

/** 翻译系统提示词（DeepSeek 与自定义 OpenAI 兼容模型共用） */
export function systemPrompt(target: string, gender: SpeakerGender): string {
  const directive = genderDirective(gender)
  return [
    "你是一个精通多国语言的翻译助手，",
    `请将用户发送的内容精准翻译为${langLabel(target)}，`,
    directive,
    "保持语气自然、符合即时通讯聊天习惯。仅输出翻译结果本身，",
    "不要添加任何解释、注释、拼音或引号；完整保留 emoji、换行、链接、数字与原有格式。",
    "若内容本身已经是目标语言，则原样返回。"
  ].join("")
}

export interface DeepseekConfig {
  key: string
  model: string
}

export function createDeepseekEngine(
  getConfig: () => Promise<DeepseekConfig>
): Engine {
  return {
    id: "deepseek",
    label: t("DeepSeek AI 翻译"),

    async cacheScope() {
      const { model } = await getConfig()
      return model || "deepseek-flash"
    },

    async translate({ texts, target, signal, gender = "neutral" }) {
      const { key, model } = await getConfig()
      if (!key) throw new ConfigError(t("未配置 DeepSeek API Key，请在设置中填写"))

      const out: string[] = []

      for (const text of texts) {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          signal,
          credentials: "omit",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            // 不做任何模型名硬编码限制，直接用用户填写的标识符
            model: model || "deepseek-flash",
            temperature: 0,
            stream: false,
            messages: [
              { role: "system", content: systemPrompt(target, gender) },
              { role: "user", content: text }
            ]
          })
        })

        if (!res.ok) {
          const raw = await res.text().catch(() => "")
          let detail = raw.slice(0, 300)
          try {
            const parsed: any = JSON.parse(raw)
            detail = parsed?.error?.message ?? parsed?.message ?? detail
          } catch {
            /* 保留原始响应片段 */
          }
          // 鉴权 / 参数 / 模型名相关的 4xx 属于"用户配置问题"，
          // 抛 ConfigError 让上层暴露给用户，绝不静默降级到 Google。
          if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
            throw new ConfigError(
              `DeepSeek ${res.status}${detail ? `：${detail}` : ""}` +
                t("（请检查 Key 与模型标识符）"),
              res.status
            )
          }
          throw new HttpError(
            res.status,
            `DeepSeek ${res.status}${detail ? `：${detail}` : ""}`
          )
        }

        const json: any = await res.json()
        const content = (json?.choices?.[0]?.message?.content ?? "").trim()

        if (!content) {
          throw new ConfigError(
            tf("DeepSeek 返回空内容（模型 {model}），请确认模型标识符可用", {
              model: model || "deepseek-flash"
            })
          )
        }

        out.push(content)
      }

      return { texts: out }
    }
  }
}
