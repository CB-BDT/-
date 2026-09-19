import { ConfigError, HttpError } from "~engines/types"

export class TaskQueue {
  private active = 0
  private waiting: Array<() => void> = []

  constructor(private limit: number) {}

  setLimit(limit: number) {
    this.limit = Math.max(1, Math.floor(limit) || 1)
    this.drain()
  }

  get size() {
    return this.waiting.length
  }

  private drain() {
    while (this.active < this.limit && this.waiting.length > 0) {
      this.waiting.shift()!()
    }
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1
        task()
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1
            this.drain()
          })
      }
      if (this.active < this.limit) start()
      else this.waiting.push(start)
    })
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])

export interface RetryOptions {
  retries?: number
  baseMs?: number
  signal?: AbortSignal
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true }
    )
  })
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseMs = 400, signal }: RetryOptions = {}
): Promise<T> {
  let attempt = 0

  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (signal?.aborted) throw err

      const status = err instanceof HttpError ? err.status : 0
      // 配置类错误（未配 Key / 鉴权失败 / 模型名错误）重试多少次都一样，
      // 直接抛出让上层暴露给用户，而不是白等几次退避再降级。
      const retryable =
        !(err instanceof ConfigError) && (status === 0 || RETRYABLE.has(status))
      if (!retryable || attempt >= retries) throw err

      const delay = baseMs * 2 ** attempt + Math.random() * 200
      await sleep(delay, signal)
      attempt += 1
    }
  }
}
