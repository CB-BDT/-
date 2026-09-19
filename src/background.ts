import { handleRequest, initRouter } from "~bg/router"
import { setUiLang, t, tf } from "~core/i18n"
import { getSettings, type Settings } from "~core/settings"
import { ALARM_PREFIX, alarmNameOf, loadSchedules, patchScheduleJob } from "~core/schedule"
import { SETTINGS_STORAGE_KEY } from "~core/storage"
import { joinEndpoint } from "~engines/custom"
import type { BgRequest } from "~core/messages"

initRouter()

/**
 * 界面语言：后台是独立的 JS 上下文，语言状态不共享，
 * 必须自己读一次并跟随设置变更，否则它回给页面的错误提示
 * （未配置 AI 模型 / 页面无响应等）会停留在默认中文。
 */
async function syncUiLang() {
  try {
    setUiLang((await getSettings()).uiLang)
  } catch {
    /* 读取失败沿用默认中文 */
  }
}

void syncUiLang()
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_STORAGE_KEY]) void syncUiLang()
})

/** AI 总结实际使用的接口：跟随全局主引擎（自定义模型）；
 *  谷歌/Lingva/DeepL 翻译无生成能力或配置丢失时退回第一个自定义模型；
 *  一个自定义模型都没有时返回 null（调用方提示用户去设置页添加）。 */
function resolveActiveAI(settings: Settings) {
  if (typeof settings.engine === "string" && settings.engine.startsWith("custom:")) {
    const m = (settings.customModels ?? []).find(
      (x) => `custom:${x.id}` === settings.engine
    )
    if (m) {
      return {
        endpoint: joinEndpoint(m.baseUrl),
        key: m.apiKey,
        model: m.model,
        label: m.label || t("自定义模型")
      }
    }
  }
  // 无生成能力 / 配置丢失：退回第一个自定义模型
  const fallback = (settings.customModels ?? [])[0]
  if (fallback) {
    return {
      endpoint: joinEndpoint(fallback.baseUrl),
      key: fallback.apiKey,
      model: fallback.model,
      label: fallback.label || t("自定义模型")
    }
  }
  return null
}
const SUMMARY_SYSTEM_PROMPT =
  "你是一个专业的 CRM 与沟通分析助手，请根据提供的聊天记录和用户的要求进行精准总结。" +
  "使用与用户要求相同的语言（默认简体中文），结构清晰，可使用 Markdown 标题、列表与加粗；" +
  "不要编造聊天记录中不存在的事实，信息不足时明确标注。"

/**
 * AI 聊天总结专用长连接（SSE 流式）。
 * content 侧 connect("ai-summary") → postMessage({prompt, transcript})，
 * SW 以 stream:true 请求 AI 模型（OpenAI 兼容接口），逐块回 {type:"chunk",text}，
 * 结束 {type:"done"}，失败 {type:"error",error}。
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ai-summary") return

  const ac = new AbortController()
  port.onDisconnect.addListener(() => ac.abort())

  port.onMessage.addListener((req: { prompt?: string; transcript?: string }) => {
    void (async () => {
      try {
        const settings = await getSettings()
        const ai = resolveActiveAI(settings)
        if (!ai) {
          port.postMessage({
            type: "error",
            error: t("未配置 AI 模型，请到设置页添加自定义模型（OpenAI 兼容接口）")
          })
          return
        }
        if (!ai.key) {
          port.postMessage({
            type: "error",
            error: tf("未配置「{label}」的 API Key，请先在设置中填写", { label: ai.label })
          })
          return
        }
        const userPrompt = `${(req.prompt ?? "").trim()}\n\n以下是聊天记录：\n\n${req.transcript ?? ""}`

        const res = await fetch(ai.endpoint, {
          method: "POST",
          signal: ac.signal,
          credentials: "omit",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ai.key}`
          },
          body: JSON.stringify({
            model: ai.model,
            temperature: 0.3,
            stream: true,
            messages: [
              { role: "system", content: SUMMARY_SYSTEM_PROMPT },
              { role: "user", content: userPrompt }
            ]
          })
        })

        if (!res.ok || !res.body) {
          const raw = await res.text().catch(() => "")
          let detail = raw.slice(0, 300)
          try {
            const parsed: { error?: { message?: string }; message?: string } = JSON.parse(raw)
            detail = parsed?.error?.message ?? parsed?.message ?? detail
          } catch {
            /* 保留原文 */
          }
          port.postMessage({
            type: "error",
            error: `${ai.label} ${res.status}${detail ? `：${detail}` : ""}`
          })
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        const handleLine = (line: string): boolean => {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data:")) return true
          const payload = trimmed.slice(5).trim()
          if (payload === "[DONE]") return false
          try {
            const json: {
              choices?: { delta?: { content?: string } }[]
            } = JSON.parse(payload)
            const delta = json?.choices?.[0]?.delta?.content
            if (delta) port.postMessage({ type: "chunk", text: delta })
          } catch {
            /* 心跳/不完整分片，忽略 */
          }
          return true
        }

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl)
            buffer = buffer.slice(nl + 1)
            if (!handleLine(line)) {
              port.postMessage({ type: "done" })
              return
            }
          }
        }
        if (buffer.trim()) handleLine(buffer)
        port.postMessage({ type: "done" })
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        port.postMessage({
          type: "error",
          error: err instanceof Error ? err.message : String(err)
        })
      }
    })()
  })
})

/** 注册 MAIN 世界 content script：wa-js 库 + relay 脚本。
 *  用 chrome.scripting.registerContentScripts 而非 manifest，
 *  因为 MV3 manifest 的 world:"MAIN" 在 Plasmo 中不被正确注册。 */
async function registerWppBridge() {
  try {
    // 检查是否已注册
    const existing = await chrome.scripting.getRegisteredContentScripts()
    if (existing.some((s) => s.id === "wpp-bridge")) {
      // 已注册，刷新（更新代码）
      await chrome.scripting.unregisterContentScripts({ ids: ["wpp-bridge"] })
    }
    await chrome.scripting.registerContentScripts([
      {
        id: "wpp-bridge",
        matches: ["https://web.whatsapp.com/*"],
        js: ["assets/wppconnect-wa.js", "assets/relay.js"],
        runAt: "document_start",
        world: "MAIN",
        allFrames: false
      }
    ])
    console.log("[wa-copilot] WPP bridge content script 已注册（MAIN world）")
  } catch (err) {
    console.error("[wa-copilot] 注册 WPP bridge 失败:", err)
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initRouter()
  void registerWppBridge()
  console.log("[wa-copilot] installed")
})

// 扩展启动时也注册（处理浏览器重启场景）
void registerWppBridge()

/* ------------------------------ 定时消息派发 ------------------------------ */

// 页面未打开/无响应时的重试间隔（1/2/5 分钟封顶），最多 10 次后标失败
const SCHED_RETRY_DELAYS = [60_000, 120_000, 300_000]
const SCHED_MAX_RETRIES = 10

/**
 * 闹钟到点：把待发任务派发给 WhatsApp Web 页面执行。
 *
 * 关键约束：MV3 SW 空闲 30s 就会被杀，这里绝不做长等待/长 sleep——
 * 防风控随机延迟（5–45s）与实际发送、状态落盘全部在页面侧完成
 * （页面环境没有生命周期限制）。SW 只做"查页面 + 转发指令"的瞬时动作，
 * content 收到后立即 ack，其余自理。
 */
async function dispatchScheduled(id: string) {
  const job = (await loadSchedules()).find((x) => x.id === id)
  // 只处理 pending；sending/sent/failed/已删除说明页面侧已收尾或正处理
  if (!job || job.status !== "pending") return
  console.log("[wa-copilot] 定时任务闹钟触发：", job.chatName, `(${id})`)

  let tabId: number | undefined
  try {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" })
    // 优先当前活跃标签页（用户正在看的）；否则任意一个
    tabId =
      tabs.find((t) => t.active && typeof t.id === "number")?.id ??
      tabs.find((t) => typeof t.id === "number")?.id
  } catch {
    /* 查询失败按未打开处理 */
  }

  if (typeof tabId !== "number") {
    const retries = (job.retries ?? 0) + 1
    if (retries > SCHED_MAX_RETRIES) {
      await patchScheduleJob(id, { status: "failed", error: t("WhatsApp 页面长时间未打开，已取消发送") })
      return
    }
    await patchScheduleJob(id, { retries })
    const delay = SCHED_RETRY_DELAYS[Math.min(retries - 1, SCHED_RETRY_DELAYS.length - 1)]
    console.log(`[wa-copilot] 页面未打开，${Math.round(delay / 1000)}s 后重试（第 ${retries} 次）`)
    chrome.alarms.create(alarmNameOf(id), { when: Date.now() + delay })
    return
  }

  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: "wac:sendSchedule",
      id
    })) as { ok?: boolean } | undefined
    // content 受理后立即 ack，错峰延迟 + 发送 + 状态更新都在页面侧完成
    if (!res?.ok) {
      console.warn("[wa-copilot] 定时任务派发未受理：", res)
    }
  } catch (err) {
    // 页面刚刷新 / 扩展重载后旧 content 失联：短间隔重试而不是直接判死
    const retries = (job.retries ?? 0) + 1
    if (retries > SCHED_MAX_RETRIES) {
      await patchScheduleJob(id, {
        status: "failed",
        error: tf("页面无响应：{err}", {
          err: err instanceof Error ? err.message : String(err)
        })
      })
      return
    }
    await patchScheduleJob(id, { retries })
    chrome.alarms.create(alarmNameOf(id), { when: Date.now() + 60_000 })
  }
}

// 闹钟监听必须顶层注册（MV3 SW 随时被回收，靠它重新唤醒）
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return
  void dispatchScheduled(alarm.name.slice(ALARM_PREFIX.length))
})

chrome.runtime.onMessage.addListener(
  (message: BgRequest, _sender, sendResponse) => {
    handleRequest(message).then(sendResponse, (err) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      })
    )
    return true
  }
)
