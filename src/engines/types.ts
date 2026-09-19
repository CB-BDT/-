/** 引擎标识："google" | "lingva" | "deepl" | "deepseek" | "custom:<id>"（用户自定义 OpenAI 兼容模型） */
export type EngineId = "google" | "deepl" | "deepseek" | (string & {})

/** 说话者性别（出站翻译用词形约束；入站翻译不传） */
export type SpeakerGender = "female" | "male" | "neutral"

export class HttpError extends Error {
  constructor(
    public status: number,
    message?: string
  ) {
    super(message ?? `HTTP ${status}`)
    this.name = "HttpError"
  }
}

/**
 * 用户配置类错误（Key 未设置、鉴权失败 401/403、参数非法 400、模型不存在 404 等）。
 * 它与 HttpError 的关键区别：**绝不能被自动降级 / 重试掩盖**。
 * 一旦发生必须暴露给用户，否则"DeepSeek 没接好"会静默退回 Google 译文。
 */
export class ConfigError extends Error {
  constructor(
    message?: string,
    public status?: number
  ) {
    super(message ?? "翻译引擎配置错误")
    this.name = "ConfigError"
  }
}

export interface TranslateParams {
  texts: string[]
  target: string
  source?: string
  signal?: AbortSignal
  /** 说话者性别：仅出站（用户本人发言）翻译时传入，
   *  约束形容词/分词/名词使用阴性或阳性词形。 */
  gender?: SpeakerGender
}

export interface TranslateOutput {
  texts: string[]
  detected?: string
}

export interface Engine {
  id: EngineId
  label: string
  /**
   * 参与缓存 Hash 的引擎作用域。换模型 / 换接口版本时必须变化，
   * 否则会读到旧模型的低质量缓存。
   */
  cacheScope(): string | Promise<string>
  translate(p: TranslateParams): Promise<TranslateOutput>
}
