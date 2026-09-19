import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { PlasmoCSConfig } from "plasmo"

import { getAdapter } from "~adapters"
import { composerApi, getComposer } from "~core/composer"
import {
  buildLabel,
  deleteRecord,
  getByKey,
  loadCrm,
  lookup,
  migrateNameKey,
  nameKey,
  resolveKey,
  saveRecord,
  subscribe,
  type ContactRecord
} from "~core/crm"
import { collectDiagnostics, fillScanStats } from "~core/diagnostics"
import {
  activeDayCount,
  dateStringFromRow,
  readActiveDates,
  todayString,
  writeActiveDates
} from "~core/activeDates"
import {
  type DeviceType,
  type RawMsgId,
  detectDevice,
  detectDeviceFromMsgs,
  detectDeviceFromRows,
  deviceIcon,
  deviceLabel,
  parseDataId
} from "~core/deviceDetector"
import {
  cachedProfile,
  getProfile,
  indexName,
  jidByName,
  mergeProfile,
  preloadAllProfiles,
  preloadNameIndex
} from "~core/contactProfile"
import { countryToLang, langName } from "~core/lang"
import { buildMapThumbnail } from "~core/mapThumbnail"
import { callBg, type TranslateData } from "~core/messages"
import type { ChatHistoryMsg } from "~core/aiSummary"
import { loadSchedules, patchScheduleJob, type ScheduleJob } from "~core/schedule"
import { getScheduleMedia } from "~core/mediaStore"
import { findBadgeHost, observeMain, scanMessages } from "~core/observer"
import { analyzePhone } from "~core/phone"
import { CHAT_ID_RE, SEL, getChatListRows, queryFirst } from "~core/selectors"
import { DEFAULT_SETTINGS, engineOptions, getSettings, type Settings } from "~core/settings"
import { setUiLang, t, tf } from "~core/i18n"
import { getItem, setItem, SETTINGS_STORAGE_KEY } from "~core/storage"
import { shouldTranslate } from "~core/text"
import { createViewportWatcher } from "~core/viewport"
import type { EngineId } from "~engines/types"
import { ContactModal } from "~ui/ContactModal"
import { HeaderBadge, type HeaderBadgeProps } from "~ui/HeaderBadge"
import {
  createEditButton,
  createDeviceLine,
  placeEditButtonOnAvatar
} from "~ui/listRow"
import { mountBadge, type BadgeHandle } from "~ui/badgeMount"
import { syncNoteBar, teardownNoteBar } from "~ui/noteBarMount"
import { showToast } from "~ui/toast"
import type { BadgeState } from "~ui/MessageBadge"
import { MODAL_CSS } from "~ui/modalMount"
import { createShadowMount } from "~ui/shadow"
import { TOOLBAR_CSS } from "~ui/toolbarMount"
import { QUICK_REPLY_CSS } from "~ui/quickReplyMount"
import { TranslateToolbar } from "~ui/TranslateToolbar"
import { ScheduleModal } from "~ui/ScheduleModal"
import { QuickReplyPanel } from "~ui/QuickReplyPanel"
import { toggleDiag } from "~ui/diagPanel"

export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"],
  run_at: "document_idle",
  all_frames: false
}

const HEADER_HOST_ID = "wa-copilot-header"
const TOOLBAR_HOST_ID = "wa-copilot-toolbar"
const PANEL_HOST_ID = "wa-copilot-quickreply"
const HEADER_POLL_MS = 2000
const MESSAGE_POLL_MS = 2000

let settings: Settings = DEFAULT_SETTINGS

async function refreshSettings() {
  try {
    settings = await getSettings()
    // 界面语言必须与设置同步：i18n 模块持有当前语言，所有 t() 依赖它。
    // 放在这里可保证「读设置」「切语言」「重渲染」三者一致。
    setUiLang(settings.uiLang)
  } catch {
    /* 读取失败时沿用上一次的值 */
  }
}

/** 自定义模型（有生成能力、费 token）：徽章侧首次使用需二次确认 */
function isCustomEngine(id: string): boolean {
  return id.startsWith("custom:")
}

/** 引擎 id 的显示名（徽章译文出处、失败提示用）。
 *  模型已被从设置里删除时查不到 label，退到 id 尾段兜底，不抛错。 */
function engineLabel(id: string, s: Settings): string {
  if (id === "google") return t("谷歌翻译")
  if (id === "lingva") return t("Lingva 翻译")
  if (id === "deepl") return "DeepL"
  if (isCustomEngine(id)) {
    const m = (s.customModels ?? []).find((x) => `custom:${x.id}` === id)
    return m?.label || m?.model || id.slice("custom:".length)
  }
  return id
}

/** 引擎「有效标识」：引擎 id + 自定义模型作用域（接口地址|模型名）。
 *  切引擎、换中转站、改模型名都会改变它，需要重译；
 *  只改 Key 不改变（Key 不影响译文结果，无需重译）。 */
function engineScope(s: Settings): string {
  if (typeof s.engine === "string" && s.engine.startsWith("custom:")) {
    const m = (s.customModels ?? []).find((x) => `custom:${x.id}` === s.engine)
    return m ? `${s.engine}|${m.baseUrl}|${m.model}` : s.engine
  }
  return s.engine
}

function isDarkTheme(): boolean {
  return (
    document.documentElement.classList.contains("dark") ||
    document.body.classList.contains("dark")
  )
}

/**
 * 统一同步入口，带重入锁。三个同步函数都会写 DOM，
 * 加锁确保一轮同步期间不会被自己触发的新一轮同步打断。
 */
let syncing = false

function runSync() {
  if (syncing) return
  syncing = true
  try {
    syncMessages()
    syncListNotes()
    ensureToolbar()
  } finally {
    syncing = false
  }
}

/* ------------------------------------------------------------------ header */

let headerHost: HTMLElement | null = null
let headerRoot: Root | null = null
let lastHeaderKey = ""

// 实际互动天数：内存缓存已加载的日期集合，避免每次 tick/sync 都读 chrome.storage。
interface ActiveMemo {
  dates: string[]
  loaded: boolean
}
const activeMemo = new Map<string, ActiveMemo>()

// 对方设备类型：纯被动从 DOM data-id 属性解析，不调 WPP API。
// 按聊天缓存最近一次推断结果，内存即可（每次 syncMessages 会刷新）。
const deviceCache = new Map<string, DeviceType>()
// 已尝试过 WPP 号码反查的聊天（无论成败，本页面会话内不再重试）
const phoneWppTried = new Set<string>()
// 已尝试过 WPP 设备检测的聊天（无论成败，本页面会话内不再重试）。
// 检测不出的聊天（对方从未发消息等）若不记忆，tickHeader 每 2s 都会
// 重调一次 WPP API；一次记忆 + 档案持久化 = 加载一次记录好。
const deviceWppTried = new Set<string>()
// 设备诊断日志已打过的 chatId 集合（每聊天只打一次，避免刷屏）
const deviceDiagLogged = new Set<string>()

// 最近的设备检测诊断信息（供自动上报，便于远程排障）
const lastDeviceDiag: {
  wppError?: string
  rawMsgs?: RawMsgId[]
  domCount?: number
  domDataIds?: string[]
  domError?: string
  result?: DeviceType | null
} = {}

const phoneInfoCache = new Map<string, ReturnType<typeof analyzePhone>>()
const migratedChats = new Set<string>()

async function ensureActiveLoaded(chatId: string): Promise<string[]> {
  const m = activeMemo.get(chatId)
  if (m?.loaded) return m.dates
  const dates = await readActiveDates(chatId)
  activeMemo.set(chatId, { dates, loaded: true })
  return dates
}

/** 当前该聊天的累计互动天数（已加载则用缓存，避免高频读存储）。 */
async function currentActiveDays(chatId: string): Promise<number> {
  const dates = await ensureActiveLoaded(chatId)
  return activeDayCount(dates)
}

/**
 * 把一批"刚观察到的日期"并入该聊天的互动集合。
 * 只增不减：daily 全量情况或有新日期才写一次存储。
 */
async function recordChatActivity(chatId: string, newDates: Set<string>) {
  if (chatId === "" || newDates.size === 0) return
  const base = await ensureActiveLoaded(chatId)
  let changed = false
  const merged = new Set(base)
  for (const d of newDates) {
    if (!merged.has(d)) {
      merged.add(d)
      changed = true
    }
  }
  if (!changed) return
  const next = Array.from(merged).sort()
  activeMemo.set(chatId, { dates: next, loaded: true })
  await writeActiveDates(chatId, next)
}

// tickHeader 与 ensureToolbar 每秒都会取一次号码，libphonenumber 解析不便宜，
// 按原始号码串做一层缓存。
function analyzeCached(raw: string | null) {
  const key = raw ?? ""
  const hit = phoneInfoCache.get(key)
  if (hit !== undefined) return hit
  const info = analyzePhone(raw)
  phoneInfoCache.set(key, info)
  return info
}

function maybeMigrate(id: string | null, name: string | null) {
  if (!id || !name || migratedChats.has(id)) return
  migratedChats.add(id)
  void migrateNameKey(id, name)
}

/**
 * 每个会话在工具栏手动选过的发送目标语言（chatKey → langCode），chrome.storage 持久化。
 * onChanged 同步内存：组件写盘后这里立即生效，切回会话时 initialOverride 直接命中。
 */
let chatLangOverrides: Record<string, string> = {}

// storage 变更监听统一注册（与底部 settings 监听合并成同一个 listener，
// 减少重复注册）：chatLangs 由 TranslateToolbar 写盘后这里立即同步内存

/**
 * 发送目标语言优先级：
 * 工具栏手选（按会话记住）> 手机号归属国语言 > CRM 手设 > 全局默认
 */
function resolveOutgoingTarget(
  chatId: string | null,
  name: string | null,
  country: string | null
): string {
  if (country) return countryToLang(country)
  const found = lookup(chatId, name)
  if (found?.record.targetLang) return found.record.targetLang
  return settings.outgoingFixedTarget
}

function teardownHeader() {
  try {
    headerRoot?.unmount()
  } catch {
    /* ignore */
  }
  headerRoot = null
  headerHost?.remove()
  headerHost = null
  // 备注条是 header 的兄弟节点，header 没了它也必须一起走
  teardownNoteBar()
}

function mountHeader(header: HTMLElement) {
  teardownHeader()
  const host = document.createElement("div")
  host.id = HEADER_HOST_ID
  host.style.cssText =
    "display:flex;align-items:center;flex:0 0 auto;align-self:center;margin-left:8px;"
  const shadow = host.attachShadow({ mode: "open" })
  const mount = document.createElement("div")
  shadow.appendChild(mount)

  // 找到联系人名字元素，插在它右边（而不是 header 末尾）
  const titleEl = header.querySelector<HTMLElement>(
    'span[title], [data-testid="conversation-info-header-chat-title"], [dir="auto"]'
  )
  if (titleEl && titleEl.parentElement) {
    titleEl.parentElement.insertAdjacentElement("afterend", host)
  } else {
    // 兜底：找不到名字元素就放 header 末尾
    header.appendChild(host)
  }

  headerHost = host
  headerRoot = createRoot(mount)
}

/**
 * 设备结果统一落盘 + 列表即时刷新。
 * 三重 key 保险，解决"Header 检测到设备但列表不显示"：
 *  1. chatId（消息区 JID，可能 @c.us / @lid）
 *  2. nameKey(name)（列表行无 data-id 时 resolveKey 用的就是这个）
 *  3. 名字→JID 索引（列表渲染第三级桥接）
 * 写入后立即重绘列表，不必等 observer 事件。
 */
function persistDevice(chatId: string, name: string | null, dev: DeviceType) {
  if (!chatId || !dev || dev === "Unknown") return
  deviceCache.set(chatId, dev)
  void mergeProfile(chatId, { device: dev })
  if (name) {
    const nk = nameKey(name)
    if (nk !== chatId) void mergeProfile(nk, { device: dev, name })
    void indexName([name], chatId)
  }
  // 列表 DOM 已稳定，observer 不会再触发，主动重绘
  syncListNotes()
}

async function tickHeader() {
  if (document.hidden) return

  const header = queryFirst(SEL.header)
  if (!header) {
    if (headerHost) teardownHeader()
    lastHeaderKey = ""
    return
  }

  const adapter = getAdapter()
  const rawId = adapter.getActiveChatId()
  const name = adapter.getActiveChatName()
  const chatId = rawId ?? name

  if (!chatId) {
    if (headerHost) teardownHeader()
    lastHeaderKey = ""
    return
  }

  maybeMigrate(rawId, name)

  // 联系人档案缓存优先：命中后号码/国家/语言/设备直接用缓存，
  // 不再触发 DOM 爬取或 WPP 请求（一次获取，永久生效）
  const profile = await getProfile(chatId)

  // 号码识别：DOM 优先 → 档案缓存 → WPP API 反查（@lid / 已存名字场景）。
  // 反查键放宽到 chatId（含纯名字场景）：即使消息 data-id 解析不出 JID，
  // 也能靠 relay 优先取「当前活跃聊天」对象拿到真实号码。
  let phone = adapter.getActivePhone()
  if (!phone && profile?.phone) phone = profile.phone
  if (!phone && wppReady && !phoneWppTried.has(chatId)) {
    phoneWppTried.add(chatId)
    try {
      const viaApi = await callWppGetPhone(rawId ?? chatId)
      if (viaApi?.phone) phone = viaApi.phone
      if (viaApi?.name) void mergeProfile(chatId, { name: viaApi.name })
    } catch {
      // 查询失败不再重试该聊天（除非刷新页面）
    }
  }
  const geo = analyzeCached(phone)
  const activeDays = await currentActiveDays(chatId)

  // 设备检测：WPP API 为主，DOM data-id 兜底。
  // WPP 就绪时通过 API 拿真实消息对象 ID（最可靠）。
  // WPP 未就绪时从 DOM data-id 属性推断（可能不准但聊胜于无）。
  let device = deviceCache.get(chatId) ?? profile?.device ?? null
  if (!device) {
    // 方案 1：WPP API（最可靠）。每聊天只试一次（成功→档案落盘永久命中；
    // 失败/判不出→本页面会话不再重试，避免 tickHeader 周期性重复调用）
    if (wppReady && chatId && !deviceWppTried.has(chatId)) {
      deviceWppTried.add(chatId)
      try {
        const rawMsgs = await callWppGetDevice(chatId)
        const dev = detectDeviceFromMsgs(rawMsgs)
        if (dev && dev !== "Unknown") {
          device = dev as DeviceType
          persistDevice(chatId, name, dev as DeviceType)
        } else {
          // 判定不出也要留痕，诊断上报里能看到真实消息 ID
          lastDeviceDiag.rawMsgs = rawMsgs.slice(-5)
        }
      } catch (err) {
        lastDeviceDiag.wppError = err instanceof Error ? err.message : String(err)
        // WPP 调用失败，走 DOM 兜底
      }
    }
  }
  // 方案 2：DOM data-id 兜底
  if (!device) {
    try {
      const rows = queryFirst(SEL.main)
      if (rows) {
        const els = rows.querySelectorAll("[data-id]")
        lastDeviceDiag.domCount = els.length
        if (els.length > 0) {
          const dataIds: { dataId: string; incoming: boolean }[] = []
          els.forEach((el) => {
            const did = el.getAttribute("data-id") || ""
            if (did) dataIds.push({ dataId: did, incoming: did.startsWith("false_") })
          })
          if (dataIds.length > 0) {
            lastDeviceDiag.domDataIds = dataIds.slice(-5).map((d) => d.dataId)
            const dev = detectDeviceFromRows(dataIds)
            if (dev !== "Unknown") {
              device = dev
              persistDevice(chatId, name, dev)
            } else if (!deviceDiagLogged.has(chatId)) {
              deviceDiagLogged.add(chatId)
              console.log("[wa-copilot] 设备解析失败，data-id 样例:", dataIds.slice(0, 3).map((d) => d.dataId))
            }
          }
        }
      }
    } catch (err) {
      lastDeviceDiag.domError = err instanceof Error ? err.message : String(err)
      // 设备检测失败不阻塞其他功能
    }
  }
  lastDeviceDiag.result = device

  // 档案落盘：phone/country/lang/name 只填空不回退，device 允许更新。
  // 无变化时 mergeProfile 内部零写入，不产生存储抖动。
  void mergeProfile(chatId, {
    phone: geo?.e164 ?? undefined,
    country: geo?.country ?? undefined,
    lang: geo?.country ? langName(countryToLang(geo.country)) : undefined,
    name: name ?? undefined,
    device: device ?? undefined
  }).catch(() => {})

  // 备注也要进签名：用户改完备注后 tickHeader 需要重绘一次顶栏区
  const noteLabel = buildLabel(lookup(rawId, name)?.record ?? { updatedAt: 0 })

  const key = [
    chatId,
    geo?.e164 ?? "",
    geo?.country ?? "",
    activeDays,
    device ?? "",
    noteLabel,
    // 顶栏胶囊含「互动 N 天」，切语言也要重绘
    settings.uiLang
  ].join("|")

  if (!headerHost || !headerHost.isConnected || headerHost.parentElement !== header) {
    mountHeader(header)
    lastHeaderKey = ""
  }

  // 备注条同步必须放在下面的签名短路之前：它内部要做「节点是否还在」的连接性
  // 校验，若放在短路之后，WhatsApp 重渲染删掉节点时签名没变就永远不会补挂。
  // 内部对「文本/主题/位置都没变」的情况会立即返回，开销可忽略。
  syncNoteBar(header, noteLabel, isDarkTheme())

  if (key === lastHeaderKey) return
  lastHeaderKey = key

  const props: HeaderBadgeProps = {
    flag: geo?.flag ?? "",
    countryName: geo?.countryName ?? "",
    langName: langName(countryToLang(geo?.country)),
    phone: geo?.e164 ?? null,
    activeDays
    // 设备标签已挪到左侧好友列表徽章；客户备注已挪到顶栏下方独立备注条
  }

  headerRoot?.render(createElement(HeaderBadge, props))
}

/* ---------------------------------------------------------------- messages */

type EntryStatus = "pending" | "loading" | "done" | "error"

interface Entry {
  msgId: string
  text: string
  row: HTMLElement
  handle: BadgeHandle | null
  status: EntryStatus
  /** 本条消息已译出的各引擎译文（会话内存缓存：切回旧引擎零请求直接切） */
  texts: Partial<Record<EngineId, string>>
  /** 当前展示的是哪个引擎的译文 */
  shown: EngineId
  /** 待确认的目标引擎（自定义模型首次使用，费 token 需二次确认）；null = 无 */
  pendingEngine: EngineId | null
  /** 单引擎请求进行中（徽章按钮显示 ⏳） */
  engineBusy: boolean
}

const byRow = new Map<HTMLElement, Entry>()

/** AI 请求超时：后台网络抖动时 20s 必返回，避免按钮一直 loading。
 *  race 结束（任一先到）即清理定时器，不悬挂到期。 */
function withTimeout<T>(p: Promise<T>, ms = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(tf("AI 请求超时（{s}s）", { s: ms / 1000 }))), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

/**
 * 翻译本条消息。
 * - 不传 engineId：走全局引擎链（自动翻译 / 全局切换后重译 / 重试）。带在途
 *   守卫——请求期间全局引擎被切走，这份译文已过期必须丢弃，否则会覆盖新译文。
 * - 传 engineId：用户从徽章菜单点选指定引擎。只译不降级，带 20s 超时；
 *   失败回滚到原译文并 Toast（Key / 模型名错误必须原样暴露，不能静默降级）。
 */
async function translate(entry: Entry, force: boolean, engineId?: EngineId) {
  const explicit = engineId !== undefined
  const scopeAtStart = engineScope(settings)
  const prevShown = entry.shown

  if (explicit) {
    if (entry.engineBusy) return
    entry.engineBusy = true
    entry.pendingEngine = null
    entry.handle?.setEngineBusy(true)
  }

  entry.status = "loading"
  entry.handle?.setState({
    status: "loading",
    kind: engineId && isCustomEngine(engineId) ? "ai" : "google",
    label: engineId ? engineLabel(engineId, settings) : undefined
  })

  const payload = {
    type: "translate" as const,
    texts: [entry.text],
    target: settings.incomingTarget,
    skipCache: force,
    ...(engineId ? { engine: engineId } : {})
  }

  try {
    const res = explicit
      ? await withTimeout(callBg<TranslateData>(payload))
      : await callBg<TranslateData>(payload)

    // 全局链模式专属：在途期间全局引擎被切走 → 丢弃这份过期译文
    if (!explicit && engineScope(settings) !== scopeAtStart) return

    if (!res.ok) throw new Error(res.error)
    const text = res.data.texts[0] ?? ""
    if (!text.trim()) throw new Error(t("引擎返回空译文"))

    // 写入「实际出译文的引擎」槽位：全局链自动降级时可能不是链首引擎
    const actual: EngineId = res.data.engine
    entry.texts[actual] = text
    entry.shown = actual
    entry.status = "done"
    entry.pendingEngine = null
    entry.handle?.setState({
      status: "done",
      text,
      engine: engineLabel(actual, settings),
      shown: actual,
      pendingEngine: null
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (explicit) {
      // 指定引擎失败不降级：回滚原译文（有则回显，无则展示错误态）+ Toast
      entry.shown = prevShown
      if (entry.texts[prevShown]) {
        entry.status = "done"
        renderDone(entry)
      } else {
        entry.status = "error"
        entry.handle?.setState({ status: "error", message: msg })
      }
      showToast(tf("{engine} 翻译失败：{msg}", { engine: engineLabel(engineId, settings), msg }))
    } else {
      entry.status = "error"
      entry.handle?.setState({ status: "error", message: msg })
    }
  } finally {
    if (explicit) {
      entry.engineBusy = false
      entry.handle?.setEngineBusy(false)
    }
  }
}

/** 引擎变化后重译当前会话所有已挂徽章。
 *  旧徽章若保留上一个引擎（默认谷歌）的译文，用户会误以为「聊天记录只能
 *  用谷歌翻译」——切引擎后必须整屏刷新，才能体现引擎切换的全局生效。 */
function retranslateForEngineChange() {
  let n = 0
  for (const entry of byRow.values()) {
    // 各引擎译文（含自定义模型）都绑定旧设置，切换后整体作废。
    // 注意：只清会话内存 Map，后台 IndexedDB 缓存仍在（键含引擎 id 与
    // 模型作用域），点回同一模型仍会命中缓存，不重复消耗 Token。
    entry.texts = {}
    entry.pendingEngine = null
    // 只重译已挂徽章（已上屏）的条目：未上屏的 pending 条目没有 handle，
    // 若在此翻译会把状态推进到 done，onMessageVisible 将不再为它挂徽章；
    // 它们可见时本来就会用新引擎翻译，无需干预
    if (!entry.handle) continue
    n += 1
    // force=false：缓存键含引擎 id 与模型作用域（见 bg/router.ts），
    // 切引擎天然不命中旧引擎缓存；若该引擎此前译过同句还能直接命中省额度
    void translate(entry, false)
  }
  if (n > 0) showToast(tf("已切换翻译引擎，正在重译当前会话（{n} 条）", { n }))
}

/** 用 entry 当前状态刷新徽章 done 视图（含待确认标记）。 */
function renderDone(entry: Entry) {
  const text = entry.texts[entry.shown]
  if (!text) return
  entry.handle?.setState({
    status: "done",
    text,
    engine: engineLabel(entry.shown, settings),
    shown: entry.shown,
    pendingEngine: entry.pendingEngine
  })
}

/**
 * 徽章菜单点选引擎：
 * - 本条已译过该引擎（内存缓存）→ 零请求立即切换；
 * - 自定义模型首次使用（费 token）→ 进入待确认，等用户点「确认使用」；
 * - 谷歌 / Lingva / DeepL → 直接翻译本条消息。
 */
function selectEngine(entry: Entry, id: EngineId) {
  if (entry.engineBusy) return
  if (entry.texts[id]) {
    entry.pendingEngine = null
    entry.shown = id
    renderDone(entry)
    return
  }
  if (isCustomEngine(id)) {
    entry.pendingEngine = id
    renderDone(entry)
    return
  }
  void translate(entry, false, id)
}

function onMessageVisible(row: HTMLElement) {
  const entry = byRow.get(row)
  if (!entry || entry.status !== "pending") return

  // 防重锁：同一 msgId 若已有徽章节点，先移除再挂，保证永远只有一个
  document
    .querySelectorAll(`[data-wa-copilot-badge="${CSS.escape(entry.msgId)}"]`)
    .forEach((node) => node.remove())

  const host = document.createElement("div")
  host.setAttribute("data-wa-copilot-badge", entry.msgId)
  findBadgeHost(row).appendChild(host)

  const state: BadgeState = { status: "loading" }
  entry.handle = mountBadge(host, state, {
    onRetry: () => {
      if (entry.status === "loading") return
      void translate(entry, true)
    },
    onPickEngine: (id) => selectEngine(entry, id),
    onConfirmEngine: () => {
      const target = entry.pendingEngine
      if (target) void translate(entry, false, target)
    },
    // 回调而非快照：设置页增删自定义模型后，storage 变更会让所有徽章 refresh
    getEngines: () => engineOptions(settings),
    getCachedEngines: () => Object.keys(entry.texts)
  })
  entry.status = "loading"

  void translate(entry, false)
}

const watcher = createViewportWatcher({ onEnter: onMessageVisible })

function syncMessages() {
  for (const [row, entry] of Array.from(byRow)) {
    const dataId = row.getAttribute("data-id")
    // 关键：只有"真实 data-id 变成了另一个值"才算节点被复用。
    // 哈希兜底 id 会随渲染抖动变化，绝不能拿它当重建依据，否则会死循环。
    const recycled = dataId !== null && dataId !== entry.msgId
    if (row.isConnected && !recycled) continue
    entry.handle?.destroy()
    byRow.delete(row)
  }

  // 实际互动天数：只采集"当前聊天"名下的消息日期（行内 data-pre-plain-text），
  // 绝不扫其他联系人的节点。收发都算，去重后并入该 chatId 的集合。
  // 同时被动采集对方设备类型（从 data-id 的消息 ID 段推断），不调 WPP API。
  const adapter = getAdapter()
  const chatId = adapter.getActiveChatId() ?? adapter.getActiveChatName() ?? ""
  const dates = new Set<string>()
  const dataIds: { dataId: string; incoming: boolean }[] = []

  for (const message of scanMessages()) {
    const d = dateStringFromRow(message.row)
    if (d) dates.add(d)

    // 收集 data-id 供设备检测（优先入站消息）
    const rawId = message.row.getAttribute("data-id")
    if (rawId) dataIds.push({ dataId: rawId, incoming: message.incoming })

    if (!message.incoming) continue

    const existing = byRow.get(message.row)
    if (existing) {
      const dataId = message.row.getAttribute("data-id")

      if (dataId !== null && dataId !== existing.msgId) {
        // 真实 id 变了：这个 DOM 节点确实被复用给了另一条消息
        existing.handle?.destroy()
        byRow.delete(message.row)
      } else if (existing.text !== message.text && existing.status !== "pending") {
        // 同一节点上文本变了：就地更新，绝不销毁重建（避免 DOM churn 触发 Observer）
        existing.text = message.text
        existing.msgId = message.msgId
        existing.status = "pending"
        // 原文已变：各引擎（含自定义模型）的旧译文全部作废
        existing.texts = {}
        existing.shown = "google"
        existing.pendingEngine = null
        existing.engineBusy = false
        void translate(existing, false)
        continue
      } else {
        continue
      }
    }

    if (!shouldTranslate(message.text)) continue

    byRow.set(message.row, {
      msgId: message.msgId,
      text: message.text,
      row: message.row,
      handle: null,
      status: "pending",
      texts: {},
      shown: "google",
      pendingEngine: null,
      engineBusy: false
    })

    watcher.observe(message.row)
  }

  // 只增不减：有新的日期才落盘，旧记录永不删除、永不倒退。
  if (dates.size > 0) void recordChatActivity(chatId, dates)

  // 设备检测：取最近一条入站消息推断对方设备，有结果才覆盖缓存。
  if (dataIds.length > 0 && chatId !== "") {
    try {
      const dev = detectDeviceFromRows(dataIds)
      if (dev !== "Unknown") deviceCache.set(chatId, dev)
    } catch {
      // 设备检测失败不阻塞消息同步
    }
  }
}

/* ----------------------------------------------------------------- toolbar */

let toolbarHost: HTMLElement | null = null
let toolbarRoot: Root | null = null
let toolbarSig = ""

function teardownToolbar() {
  try {
    toolbarRoot?.unmount()
  } catch {
    /* ignore */
  }
  toolbarRoot = null
  toolbarHost?.remove()
  toolbarHost = null
  toolbarSig = ""
}

function ensureToolbar() {
  const footer = queryFirst(SEL.footer)
  const composer = getComposer()

  if (!footer || !composer) {
    if (toolbarHost) teardownToolbar()
    return
  }

  if (!toolbarHost || !toolbarHost.isConnected || toolbarHost.parentElement !== footer) {
    teardownToolbar()
    const host = document.createElement("div")
    host.id = TOOLBAR_HOST_ID
    host.style.cssText = "display:block;width:100%;flex:0 0 100%;order:-1;"
    const mount = createShadowMount(host, TOOLBAR_CSS)
    footer.insertBefore(host, footer.firstChild)
    toolbarHost = host
    toolbarRoot = createRoot(mount)
  }

  const adapter = getAdapter()
  const rawId = adapter.getActiveChatId()
  const name = adapter.getActiveChatName()
  const chatKey = rawId ?? name ?? ""
  const geo = analyzeCached(adapter.getActivePhone())
  const autoTarget = resolveOutgoingTarget(rawId, name, geo?.country ?? null)
  // 供定时消息弹窗做"发送语言"默认值（同一会话内打开即命中）
  currentAutoTarget = autoTarget
  // 该会话手动选过的语言：优先于自动推断，切回会话时直接选中
  const initialOverride = chatLangOverrides[chatKey] ?? "auto"
  const dark = isDarkTheme()

  const sig = [
    chatKey,
    autoTarget,
    initialOverride,
    settings.autoSend,
    settings.incomingTarget,
    // 主引擎切换后工具栏必须重绘：否则聊天框仍显示旧引擎，需手动再切换
    settings.engine,
    // 界面语言切换后必须重绘，否则界面文案不会更新
    settings.uiLang,
    dark
  ].join("|")

  if (sig === toolbarSig) return
  toolbarSig = sig

  toolbarRoot?.render(
    createElement(TranslateToolbar, {
      api: composerApi,
      settings,
      autoTarget,
      chatKey,
      dark,
      initialOverride,
      onOpenSchedule: openScheduleModal,
      // AI 思考回复：只要最近 50 条足够判断语境，比总结省 token 也更快
      onFetchHistory: async (): Promise<ChatHistoryMsg[]> => {
        return await callWppChatHistory(50)
      }
    })
  )
}

/* ---------------------------------------------------------------- crm list */

interface ListRowEntry {
  key: string
  title: string
  editHost: HTMLElement
  deviceHost: HTMLElement | null
  deviceText: string
}

const listRows = new Map<HTMLElement, ListRowEntry>()
const hoverBound = new WeakSet<HTMLElement>()

function extractChatId(raw: string | null): string | null {
  if (!raw) return null
  const match = raw.match(CHAT_ID_RE)
  if (match) return match[1]
  // 泛化匹配任意 JID 服务器段（c.us / g.us / lid / broadcast），
  // 否则 @lid 隐私格式的联系人在列表里拿不到 id，档案缓存全部 miss
  if (/@[a-z.]+$/i.test(raw)) return raw
  return null
}

function resolveRowIdentity(row: HTMLElement): {
  id: string | null
  name: string | null
  rawDataId: string | null
} {
  const own = row.getAttribute("data-id")
  let rawDataId = own && ROW_DATAID_RE.test(own) ? own : null
  let id = extractChatId(own)
  if (!id || !rawDataId) {
    // 行内可能有多个 [data-id]（头像/预览/消息 key），遍历取第一个
    // 匹配严格消息格式的，而不是只看第一个
    const inners = row.querySelectorAll("[data-id]")
    for (const node of Array.from(inners)) {
      const v = node.getAttribute("data-id")
      if (!v) continue
      if (!id) id = extractChatId(v)
      if (!rawDataId && ROW_DATAID_RE.test(v)) rawDataId = v
      if (id && rawDataId) break
    }
  }

  const nameEl = row.querySelector<HTMLElement>(SEL.listItemName.join(","))
  const name =
    nameEl?.getAttribute("title")?.trim() || nameEl?.textContent?.trim() || null

  return { id, name, rawDataId }
}

/** 列表/消息行 data-id 严格形态：true|false _ <jid含@server> _ <msgId> */
const ROW_DATAID_RE = /^(?:true|false)_[^_@]+@[a-z.]+_/i

function syncListNotes(forceDiag = false) {
  for (const [row, entry] of Array.from(listRows)) {
    if (row.isConnected) continue
    entry.editHost.remove()
    entry.deviceHost?.remove()
    listRows.delete(row)
  }

  const dark = isDarkTheme()
  let devHit = 0
  let nameBridge = 0

  for (const row of getChatListRows()) {
    // 错误边界：单行 DOM 解析异常只跳过该行，绝不让整个列表渲染崩溃
    try {
      const { id, name, rawDataId } = resolveRowIdentity(row)
      const key = resolveKey(id, name)
      if (!key) continue

      let entry = listRows.get(row)

      if (!entry) {
        if (getComputedStyle(row).position === "static") row.style.position = "relative"

        // 处理器读取 listRows 里的当前值，避免虚拟列表复用节点后指向旧联系人
        const editHost = createEditButton(() => {
          const current = listRows.get(row)
          if (current) openModal(current.key, current.title)
        })
        row.appendChild(editHost)
        // 头像角标定位（必须在 appendChild 后、布局可测量时）
        placeEditButtonOnAvatar(row, editHost)

        if (!hoverBound.has(row)) {
          hoverBound.add(row)
          row.addEventListener("mouseenter", () => {
            const current = listRows.get(row)
            if (current) current.editHost.style.display = "block"
          })
          row.addEventListener("mouseleave", () => {
            const current = listRows.get(row)
            if (current) current.editHost.style.display = "none"
          })
        }

        entry = {
          key,
          title: name ?? id ?? t("客户"),
          editHost,
          deviceHost: null,
          deviceText: ""
        }
        listRows.set(row, entry)
      } else if (entry.key !== key) {
        // 节点被复用给了另一个联系人：重置动态行
        entry.key = key
        entry.title = name ?? id ?? t("客户")
        entry.deviceText = ""
        entry.deviceHost?.remove()
        entry.deviceHost = null
      }

      // WhatsApp 重渲染可能把我们的节点清掉，发现掉线就补挂并重新定位
      if (!entry.editHost.isConnected) {
        row.appendChild(entry.editHost)
        placeEditButtonOnAvatar(row, entry.editHost)
      }

      // 设备标签：三级来源，全部纯被动、不依赖 WPP 就绪：
      //  1. 档案缓存（同步零 IO）
      //  2. 本行 data-id 即时判定（列表行 data-id = 最后一条消息的完整
      //     key：false_<对方jid>_<msgId>，含设备特征），判定即落盘三重 key
      //  3. 名字→JID 索引桥接（WPP 预取建立，覆盖"最后一条是自己发的"行）
      let prof = cachedProfile(key) ?? cachedProfile(jidByName(name) ?? "")
      if (!cachedProfile(key) && jidByName(name)) nameBridge += 1

      let dev: DeviceType | null = prof?.device ?? null
      if (!dev && rawDataId) {
        const parsed = parseDataId(rawDataId)
        // 仅信任「对方最后发言」的单聊行：false_=入站。
        // 群聊 data-id 第一段 JID 是 @g.us（其后还跟成员 JID），必须排除
        const isGroup = /^false_[^_@]+@g\.us_/i.test(rawDataId)
        if (parsed && parsed.incoming && !isGroup) {
          const d = detectDevice(rawDataId)
          if (d !== "Unknown") {
            dev = d
            prof = { ...(prof ?? { ts: Date.now() }), device: d }
            // 异步落盘：JID + 名字别名 + 名字索引，刷新/重启后永久生效
            void mergeProfile(parsed.jid, { device: d })
            if (name) {
              void mergeProfile(nameKey(name), { device: d, name })
              void indexName([name], parsed.jid)
            }
          }
        }
      }

      if (dev) devHit += 1
      const devText = dev ? `${deviceIcon(dev)} ${deviceLabel(dev)}`.trim() : ""
      if (
        entry.deviceText !== devText ||
        (devText && (!entry.deviceHost || !entry.deviceHost.isConnected))
      ) {
        entry.deviceHost?.remove()
        entry.deviceHost = null
        entry.deviceText = devText
        if (devText) {
          // 徽章绝对定位于列表项右上（时间戳正下方），挂在 row 根节点
          const host = createDeviceLine(devText, dark)
          row.appendChild(host)
          entry.deviceHost = host
        }
      }
    } catch {
      // 该行渲染失败不影响其他行
    }
  }

  // 一次性诊断：确认渲染链路（行数 / 设备命中 / 名字桥接 / 实际挂载）
  const rowCount = getChatListRows().length
  if (rowCount > 0 && (forceDiag || !listDiagLogged)) {
    listDiagLogged = true
    const mounted = document.querySelectorAll("[data-wa-copilot-device]").length
    console.log(
      `[wa-copilot] 列表渲染诊断：行数=${rowCount} ` +
        `设备档案命中=${devHit} 名字桥接=${nameBridge} 徽章已挂载=${mounted}`
    )
  }
}

/** 列表渲染诊断只打一次 */
let listDiagLogged = false

/** Ctrl+Shift+D 自检浮层的数据收集（真实选择器命中 + DOM 采样 + 存储状态）。 */
async function collectDiagData(): Promise<string> {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const count = (sel: string) => document.querySelectorAll(sel).length

  const selectors = [
    '#pane-side',
    '[data-testid="cell-frame-container"]',
    '[data-testid="chat-list-cell"]',
    '#pane-side [role="listitem"]',
    'div[role="listitem"]'
  ]
  const selLines = selectors
    .map((s) => {
      const n = count(s)
      return `<div class="row">${n > 0 ? '<span class="ok">✓' : '<span class="bad">✗'} ${n}</span> <span class="mut">${esc(s)}</span></div>`
    })
    .join("")

  const rows = getChatListRows()
  const samples = rows
    .slice(0, 3)
    .map((row, i) => {
      const { id, name } = resolveRowIdentity(row)
      const key = resolveKey(id, name)
      const prof =
        (key ? cachedProfile(key) : null) ?? cachedProfile(jidByName(name) ?? "")
      const html = row.outerHTML.replace(/\s+/g, " ").slice(0, 600)
      return (
        `<div class="sec">行${i + 1}：name=${esc(name ?? "(空)")} id=${esc(id ?? "(空)")} ` +
        `device=<span class="${prof?.device ? "ok" : "bad"}">${esc(prof?.device ?? "无档案")}</span></div>` +
        `<pre>${esc(html)}</pre>`
      )
    })
    .join("")

  let profileCount = 0
  let withDevice = 0
  let nameIdxCount = 0
  try {
    const all = (await chrome.storage.local.get(null)) as Record<string, any>
    const pkeys = Object.keys(all).filter((k) => k.startsWith("profile:"))
    profileCount = pkeys.filter((k) => k !== "profile:__name2jid").length
    withDevice = pkeys.filter(
      (k) => k !== "profile:__name2jid" && all[k]?.device
    ).length
    nameIdxCount = all["profile:__name2jid"]
      ? Object.keys(all["profile:__name2jid"]).length
      : 0
  } catch {
    /* ignore */
  }

  const mounted = count("[data-wa-copilot-device]")
  const wppCls = wppReady ? "ok" : "bad"

  return (
    `<div class="sec">运行状态</div>` +
    `<div class="row">WPP：<span class="${wppCls}">${wppReady ? "已就绪" : "未就绪"}</span></div>` +
    `<div class="row">批量预取标志：${String(listDevicesFetched)}</div>` +
    `<div class="row">自适应行探测：<span class="${rows.length ? "ok" : "bad"}">${rows.length} 行</span>　徽章已挂载：<span class="${mounted ? "ok" : "bad"}">${mounted}</span></div>` +
    `<div class="sec">存储（chrome.storage.local）</div>` +
    `<div class="row">档案 ${profileCount} 个，其中含设备 ${withDevice} 个；名字索引 ${nameIdxCount} 条</div>` +
    `<div class="sec">选择器原始命中</div>${selLines}` +
    `<div class="sec">前 3 行真实 DOM 采样</div>${samples || '<div class="bad">自适应探测 0 行（见上方选择器命中）</div>'}` +
    `<div class="mut" style="margin-top:8px">把本面板完整截图发给开发者即可定位问题。再次按 Ctrl+Shift+D 关闭。</div>`
  )
}

/* ------------------------------------------------------------------ modal */

let modalHost: HTMLElement | null = null
let modalRoot: Root | null = null
let modalSeq = 0
let modalTarget: { key: string; title: string } | null = null

function ensureModal() {
  if (modalHost && modalRoot) return
  const host = document.createElement("div")
  host.id = "wa-copilot-modal"
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:none;"
  const mount = createShadowMount(host, MODAL_CSS)
  document.body.appendChild(host)
  modalHost = host
  modalRoot = createRoot(mount)
}

function renderModal() {
  if (!modalRoot || !modalTarget) return

  const target = modalTarget
  const record = getByKey(target.key)

  modalRoot.render(
    createElement(ContactModal, {
      key: `${target.key}#${modalSeq}`,
      title: target.title,
      initial: record ?? { updatedAt: 0 },
      exists: Boolean(record),
      dark: isDarkTheme(),
      onSave: (next: ContactRecord) => {
        void saveRecord(target.key, next).then(closeModal)
      },
      onDelete: () => {
        void deleteRecord(target.key).then(closeModal)
      },
      onClose: closeModal
    })
  )
}

function openModal(key: string, title: string) {
  ensureModal()
  modalTarget = { key, title }
  modalSeq += 1
  if (modalHost) modalHost.style.display = "block"
  renderModal()
}

function closeModal() {
  modalTarget = null
  if (modalHost) modalHost.style.display = "none"
}

/* ---------------------------------------------------------- schedule modal */

let schedHost: HTMLElement | null = null
let schedRoot: Root | null = null
// 当前会话的自动发送目标语言（ensureToolbar 每轮刷新，弹窗打开时取用）
let currentAutoTarget = "en"

function ensureSchedModal() {
  if (schedHost && schedRoot) return
  const host = document.createElement("div")
  host.id = "wa-copilot-schedule"
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:none;"
  const mount = createShadowMount(host, MODAL_CSS)
  document.body.appendChild(host)
  schedHost = host
  schedRoot = createRoot(mount)
}

/**
 * 打开定时消息弹窗。创建任务时即锁死「正规 JID」（xxx@c.us）：
 * 发送 API 底层需要标准 wid，纯显示名会报 invalid wid。DOM 拿不到
 * JID（或拿到 @lid 隐私格式）时，趁用户此刻正开着该聊天，用 WPP
 * 活跃聊天反查 +E.164 拼出 @c.us。创建时刻锁定，到点不再依赖会话状态。
 */
async function openScheduleModal() {
  ensureSchedModal()
  const adapter = getAdapter()
  let rawId = adapter.getActiveChatId()
  const name = adapter.getActiveChatName()
  if (wppReady && (!rawId || !rawId.endsWith("@c.us"))) {
    try {
      const phone = await callWppGetPhone(rawId ?? name ?? "")
      if (phone?.phone) {
        const digits = phone.phone.replace(/\D/g, "")
        if (digits.length >= 5) rawId = `${digits}@c.us`
      }
    } catch {
      /* 反查失败回退原值，发送侧还有会话列表名字匹配兜底 */
    }
  }
  if (schedHost) schedHost.style.display = "block"
  schedRoot?.render(
    createElement(ScheduleModal, {
      key: "schedule",
      dark: isDarkTheme(),
      chatKey: rawId ?? name ?? "",
      chatName: name ?? "",
      autoTarget: currentAutoTarget,
      onClose: () => {
        if (schedHost) schedHost.style.display = "none"
      }
    })
  )
}

/* ------------------------------------------------------- quick reply panel */

let panelHost: HTMLElement | null = null
let panelRoot: Root | null = null
let panelCollapsed = false
let panelSig = ""

function teardownPanel() {
  try {
    panelRoot?.unmount()
  } catch {
    /* ignore */
  }
  panelRoot = null
  panelHost?.remove()
  panelHost = null
  panelSig = ""
  panelGeomSig = ""
  // 兜底：旧版本给 #app 加过 margin-right 挤压，这里清掉，避免残留空白
  const app = document.getElementById("app") || document.body
  app.style.marginRight = "0px"
}

const PANEL_MIN_WIDTH = 260
const PANEL_MAX_WIDTH = 460
// 浮动抽屉与视口/输入区的留白
const PANEL_GAP = 12
// 折叠态：右下角悬浮圆钮的直径（要容纳放大后的 logo + 手指点击提示）
const PANEL_COLLAPSED_SIZE = 64
// 面板宽度可拖拽调整（左缘手柄），默认 320；
// 用户拖过的宽度持久化在 chrome.storage.local（wac:panelWidth）。
let panelWidth = 320
// 拖拽调宽进行中：禁用过渡动画，让宽度实时跟手
let panelDragging = false
// 几何签名：轮询每 2s 都会走一遍，同值直接跳过，避免反复写 CSSOM
let panelGeomSig = ""

function clampPanelWidth(w: number): number {
  // 浮动抽屉是覆盖式悬浮的：上限比"挤压式"更收紧（38%），
  // 否则小屏下会把聊天区遮掉大半
  const max = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, Math.floor(window.innerWidth * 0.38)))
  return Math.round(Math.min(Math.max(w, PANEL_MIN_WIDTH), max))
}

/** 启动时恢复用户上次拖定的面板宽度（未设置过则沿用默认 320）。 */
async function loadPanelWidth() {
  try {
    const saved = await getItem<number>("panelWidth")
    if (typeof saved === "number") panelWidth = clampPanelWidth(saved)
  } catch {
    /* 读取失败沿用默认 */
  }
}

/** 输入区（含插件工具栏）的实时高度。抽屉底边据此上移，
 *  保证输入框、表情键、发送键永远不被面板压住。 */
function composerZoneHeight(): number {
  const footer = queryFirst(SEL.footer)
  const h = footer?.getBoundingClientRect().height ?? 0
  // 取不到时给一个保守值，宁可少占一点也不压住输入区
  return Math.round(h > 0 ? h : 120)
}

/**
 * 浮动抽屉几何。方案 B（覆盖式悬浮）：不再给 WhatsApp 主容器加 margin-right，
 * 面板以毛玻璃卡片浮在聊天区右侧——背后有内容透过，毛玻璃质感才成立；
 * 但底边随输入区高度动态上移，且四周留 12px 呼吸位，绝不遮挡输入与发送。
 */
function applyPanelWidth(animate = true) {
  const host = panelHost
  if (!host) return

  const collapsed = panelCollapsed
  const w = collapsed ? PANEL_COLLAPSED_SIZE : panelWidth
  const bottom = composerZoneHeight() + PANEL_GAP
  const sig = `${w}|${bottom}|${collapsed}`
  if (sig === panelGeomSig) return
  panelGeomSig = sig

  host.style.transition =
    animate && !panelDragging
      ? "width .22s cubic-bezier(.4,0,.2,1), bottom .22s cubic-bezier(.4,0,.2,1)"
      : "none"
  host.style.right = `${PANEL_GAP}px`
  host.style.bottom = `${bottom}px`
  host.style.width = `${w}px`
  if (collapsed) {
    host.style.top = "auto"
    host.style.height = `${PANEL_COLLAPSED_SIZE}px`
  } else {
    host.style.top = `${PANEL_GAP}px`
    host.style.height = "auto"
  }
}

/** 拖拽左缘手柄调宽：x 为鼠标视口横坐标。
 *  面板右侧留了 PANEL_GAP，故可视宽 = 视口宽 - x - 留白。
 *  done=true 表示松手收尾：解除拖拽态并持久化宽度。 */
function handlePanelResize(x: number, done: boolean) {
  panelDragging = !done
  panelWidth = clampPanelWidth(window.innerWidth - x - PANEL_GAP)
  applyPanelWidth(false)
  if (done) {
    void setItem("panelWidth", panelWidth).catch(() => {
      /* 持久化失败不影响本次会话使用 */
    })
  }
}

function ensurePanel() {
  const main = queryFirst(SEL.main)
  if (!main) {
    if (panelHost) teardownPanel()
    const app = document.getElementById("app") || document.body
    app.style.marginRight = "0px"
    return
  }

  // 面板是覆盖式浮动抽屉（position:fixed），不插入 WhatsApp DOM 内部
  if (!panelHost || !panelHost.isConnected) {
    teardownPanel()
    const host = document.createElement("div")
    host.id = PANEL_HOST_ID
    // 定位/尺寸由 applyPanelWidth 统一写入；外观（圆角/毛玻璃/投影）在 QUICK_REPLY_CSS
    host.style.cssText = "position:fixed;z-index:999999;display:flex;"
    const mount = createShadowMount(host, QUICK_REPLY_CSS)
    document.body.appendChild(host)
    panelHost = host
    panelRoot = createRoot(mount)
    panelGeomSig = ""
  }

  // 覆盖式悬浮：清掉可能由旧版本写下的 margin-right 挤压残留
  // （重载扩展不刷新页面时，WhatsApp 的 #app 内联样式会跨版本残留）
  const appEl = document.getElementById("app")
  if (appEl && appEl.style.marginRight !== "0px") appEl.style.marginRight = "0px"

  // 同步抽屉几何（覆盖式悬浮 + 输入区避让）
  applyPanelWidth(true)

  const dark = isDarkTheme()
  // uiLang 进签名：切语言时面板文案需要重绘
  const sig = [dark, panelCollapsed, wppReady, settings.uiLang].join("|")
  if (sig === panelSig) return
  panelSig = sig

  panelRoot?.render(
    createElement(QuickReplyPanel, {
      api: composerApi,
      dark,
      collapsed: panelCollapsed,
      onToggle: () => {
        panelCollapsed = !panelCollapsed
        panelSig = ""
        ensurePanel()
      },
      onResizeWidth: handlePanelResize,
      wppReady,
      onFetchHistory: async (): Promise<ChatHistoryMsg[]> => {
        // 0 = 尽可能多（relay 按 2000 条兜底）：总结需要该客户的完整上下文，
        // 不再只取最近 100 条；超长会话由下方 formatTranscript 的字符预算截断
        return await callWppChatHistory(0)
      },
      onSaveSummary: async (summary: string): Promise<void> => {
        await saveSummaryToNote(summary)
      },
      onPreviewLocation: async (lat, lng) => {
        // 原生规格缩略图（300x150 2:1，中心红 Pin），失败返回 null 由面板降级
        try {
          const b64 = await buildMapThumbnail(lat, lng)
          return b64 ? `data:image/jpeg;base64,${b64}` : null
        } catch {
          return null
        }
      },
      onSendLocation: async (lat, lng, thumbnail) => {
        const adapter = getAdapter()
        const chatId = adapter.getActiveChatId() ?? adapter.getActiveChatName() ?? ""
        if (!chatId) throw new Error(t("无法确定当前聊天"))
        // 纯地图位置：name/address 留空，卡片不带文字（与原生纯位置一致）
        await callWppSendLocation(chatId, lat, lng, "", "", thumbnail)
      }
    })
  )
}

/* ------------------------------------------------------------------ bridge */

function logDiagnostics() {
  const report = collectDiagnostics()
  const scanned = scanMessages()
  fillScanStats(
    report,
    scanned.length,
    scanned.filter((message) => message.incoming).length
  )
  console.log("[wa-copilot] 诊断报告 ↓")
  console.log(JSON.stringify(report, null, 2))
}

// WPP (wa-js) 是否已就绪（MAIN 世界 bridge 通知）
let wppReady = false

// 待处理的 WPP 调用回调
const wppCallbacks = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let wppCallSeq = 0

/** 注入 wa-js 库到 MAIN 世界 + 注入指令中转脚本。 */
function injectWppBridge() {
  // 1. 注入 wa-js 库（MAIN 世界）
  const script = document.createElement("script")
  script.src = chrome.runtime.getURL("assets/wppconnect-wa.js")
  script.onload = () => {
    console.log("[wa-copilot] wa-js 库已加载到 MAIN 世界")
    injectRelayScript()
  }
  script.onerror = () => {
    console.error("[wa-copilot] wa-js 库加载失败")
  }
  ;(document.head || document.documentElement).appendChild(script)
}

/** 注入 relay 脚本到 MAIN 世界：监听 postMessage 指令，代执行 WPP API。
 *  注意：必须用外部文件（script src）而非内联代码 —— WhatsApp 的 CSP
 *  会拒绝执行内联脚本（"Refusing to execute inline script"），
 *  但允许 chrome-extension:// 协议的外部脚本。 */
function injectRelayScript() {
  const relay = document.createElement("script")
  relay.src = chrome.runtime.getURL("assets/relay.js")
  relay.onload = () => {
    console.log("[wa-copilot] relay 脚本已注入 MAIN 世界")
  }
  relay.onerror = () => {
    console.error("[wa-copilot] relay 脚本加载失败（检查 web_accessible_resources 是否包含 assets/relay.js）")
  }
  ;(document.head || document.documentElement).appendChild(relay)
}

/** 统一 bridge 调用：注册 callId → postMessage 指令 → 超时保护。
 *  正常响应 / 出错 / 超时三条路径都会清理定时器，不再悬挂到期。
 *  5 个指令（SEND_LOCATION / GET_DEVICE / GET_CHAT_HISTORY / LIST_DEVICES /
 *  GET_PHONE）共用同一套逻辑，避免 5 份近似拷贝各自漂移出 bug。 */
function callWpp<T>(
  type: string,
  o: {
    payload?: Record<string, unknown>
    timeoutMs: number
    timeoutMsg: string
    notReady?: string
    parse?: (v: unknown) => T
  }
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!wppReady) {
      reject(new Error(o.notReady ? t(o.notReady) : t("WPP 未就绪")))
      return
    }
    const callId = `wpp-${++wppCallSeq}`
    const timer = setTimeout(() => {
      wppCallbacks.delete(callId)
      reject(new Error(t(o.timeoutMsg)))
    }, o.timeoutMs)
    wppCallbacks.set(callId, {
      resolve: (v) => {
        clearTimeout(timer)
        resolve(o.parse ? o.parse(v) : (v as T))
      },
      reject: (e) => {
        clearTimeout(timer)
        reject(e)
      }
    })
    window.postMessage(
      { source: "wa-copilot", type, callId, ...(o.payload ?? {}) },
      "*"
    )
  })
}

/** 通过 bridge 向 MAIN 世界发送定位消息（纯 JSON 指令，可克隆）。
 *  thumbnail 为原生规格（2:1、无前缀 base64 JPEG）地图缩略图，可空。 */
function callWppSendLocation(
  chatId: string,
  lat: number,
  lng: number,
  name?: string,
  address?: string,
  thumbnail?: string
): Promise<unknown> {
  return callWpp("SEND_LOCATION", {
    payload: { chatId, lat, lng, name, address, thumbnail },
    timeoutMs: 10000,
    timeoutMsg: "WPP 调用超时（10s）",
    notReady: "WPP 未就绪，无法发送定位"
  })
}

/** 通过 bridge 调 WPP.chat.getMessages 获取原始消息 ID 数据（设备判定在本地做）。 */
function callWppGetDevice(chatId: string): Promise<RawMsgId[]> {
  return callWpp<RawMsgId[]>("GET_DEVICE", {
    payload: { chatId },
    timeoutMs: 8000,
    timeoutMsg: "WPP 设备检测超时",
    parse: (v) => (Array.isArray(v) ? (v as RawMsgId[]) : [])
  })
}

interface ListDeviceMsg extends RawMsgId {
  jid: string
  notifyName?: string
  savedName?: string
}

/** 通过 bridge 拉取当前活跃聊天最近 N 条消息（AI 总结 / AI 回复用）。
 *  count <= 0 表示「尽可能多」：relay 侧按 2000 条上限兜底，等价于全量。
 *  大数量拉取明显更慢（本地 Store 遍历 + 跨世界克隆），故超时按量放宽。 */
function callWppChatHistory(count = 100): Promise<ChatHistoryMsg[]> {
  const big = count <= 0 || count > 500
  return callWpp<ChatHistoryMsg[]>("GET_CHAT_HISTORY", {
    payload: { count },
    timeoutMs: big ? 60000 : 20000,
    timeoutMsg: "拉取聊天记录超时",
    parse: (v) => (Array.isArray(v) ? (v as ChatHistoryMsg[]) : [])
  })
}

/** 把 AI 总结结果追加保存到当前聊天客户的 CRM 备注（note 字段）。 */
async function saveSummaryToNote(summary: string): Promise<void> {
  const adapter = getAdapter()
  const rawId = adapter.getActiveChatId()
  const name = adapter.getActiveChatName()
  const key = resolveKey(rawId, name)
  if (!key) throw new Error(t("无法识别当前聊天，不能保存备注"))

  const found = lookup(rawId, name)
  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`
  const block = `${tf("【AI 总结 {stamp}】", { stamp })}\n${summary.trim()}`

  const record: ContactRecord = found
    ? { ...found.record }
    : { updatedAt: Date.now() }
  record.note = record.note ? `${record.note}\n\n${block}` : block
  await saveRecord(key, record)
}

/** 通过 bridge 批量预取所有会话最后一条消息的 ID（列表设备标签用）。 */
function callWppListDevices(): Promise<ListDeviceMsg[]> {
  return callWpp<ListDeviceMsg[]>("LIST_DEVICES", {
    // 含深挖分批（最多 120 聊天），放宽超时
    timeoutMs: 25000,
    timeoutMsg: "WPP 列表预取超时",
    parse: (v) => (Array.isArray(v) ? (v as ListDeviceMsg[]) : [])
  })
}

// 批量预取只做一次；失败时重置标志允许下轮重试
let listDevicesFetched = false

async function prefetchListDevices() {
  if (listDevicesFetched || !wppReady || document.hidden) return
  listDevicesFetched = true
  try {
    const rows = await callWppListDevices()
    // 先建 名字→JID 索引（列表项 DOM 可能拿不到 data-id，靠名字桥接）
    await Promise.all(
      rows.map((r) =>
        indexName([r.notifyName ?? null, r.savedName ?? null], r.jid).catch(() => {})
      )
    )
    let ok = 0
    const samples: string[] = []
    for (const r of rows) {
      // fromMe 的 lastMessage 判不出对方设备，detectDeviceFromMsgs 内部会跳过
      const dev = detectDeviceFromMsgs([r])
      if (dev !== "Unknown") {
        ok += 1
        await mergeProfile(r.jid, { device: dev })
        if (samples.length < 3) samples.push(`${r.jid}=${dev}`)
      }
    }
    // 关键：预取是异步完成的（此时 DOM 早已稳定，observer 不会再触发），
    // 必须主动重绘一次列表，设备徽章才会出现
    syncListNotes(true)
    console.log(
      `[wa-copilot] 列表设备预取完成：${rows.length} 个会话，${ok} 个判定成功`,
      samples
    )
  } catch (err) {
    console.warn("[wa-copilot] 列表设备预取失败：", err)
    listDevicesFetched = false
  }
}

/** 通过 bridge 调 WPP 取联系人真实号码（+E.164）和 WhatsApp 显示名。
 *  DOM 拿不到号码时（如已存名字的联系人 / @lid 格式），用 API 反查。 */
interface WppPhoneResult {
  phone: string | null
  name: string | null
}

function callWppGetPhone(chatId: string): Promise<WppPhoneResult | null> {
  return callWpp<WppPhoneResult | null>("GET_PHONE", {
    payload: { chatId },
    timeoutMs: 8000,
    timeoutMsg: "WPP 号码查询超时",
    parse: (v) =>
      v && typeof v === "object"
        ? (v as WppPhoneResult)
        : typeof v === "string"
          ? { phone: v, name: null }
          : null
  })
}

/** 通过 bridge 给指定聊天发送纯文本 / 媒体（定时消息用）。
 *  media 存在时走 sendFileMessage（图片/视频 + caption），否则 sendTextMessage。 */
function callWppSendMessage(
  chatId: string,
  text: string,
  media?: { dataUrl: string; mediaType: string; filename?: string; mimetype?: string }
): Promise<unknown> {
  return callWpp("SEND_MESSAGE", {
    payload: { chatId, text, ...media },
    // 媒体要上传到 WhatsApp 服务器，放宽超时
    timeoutMs: media ? 30000 : 15000,
    timeoutMsg: "定时消息发送超时"
  })
}

/** Blob → dataUrl（FileReader，供 relay 的 sendFileMessage 消费）。 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error(t("文件读取失败")))
    reader.readAsDataURL(blob)
  })
}

/* ---------------------------- 定时消息：派发与补发 ---------------------------- */

/** sending 且 5 分钟内有认领时间戳 = 正在处理，其他路径跳过（防双发） */
const SCHED_CLAIM_TTL = 300_000

/** 本页面正在发送中的定时任务 id（进程内互斥：闹钟派发与补发并发时，
 *  同一任务只允许一条执行路径真正发送） */
const schedInFlight = new Set<string>()

/**
 * 认领任务（三重防御防双发）：
 *  1. 进程内 Set 互斥——同页面的 listener 与 catchUp 并发直接挡住
 *  2. 状态检查——pending，或 sending 但认领超时（上次处理者中断，接管续发）
 *  3. 写后读回校验——并发双方都读到 pending 时，各自写入随机 claimToken
 *     再读回比对；不匹配者说明被后写方覆盖，让位（最后写赢，绝不双发）
 */
async function claimSchedule(id: string): Promise<ScheduleJob | null> {
  if (schedInFlight.has(id)) return null
  const job = (await loadSchedules()).find((x) => x.id === id)
  if (!job) return null
  const now = Date.now()
  const claimable =
    job.status === "pending" ||
    (job.status === "sending" && now - (job.claimedAt ?? 0) > SCHED_CLAIM_TTL)
  if (!claimable) return null
  schedInFlight.add(id)
  const token = Math.random().toString(36).slice(2)
  await patchScheduleJob(id, { status: "sending", claimedAt: now, claimToken: token })
  const back = (await loadSchedules()).find((x) => x.id === id)
  if (!back || back.claimToken !== token) {
    // 被并发方后写覆盖认领：让位
    schedInFlight.delete(id)
    return null
  }
  return { ...job, status: "sending", claimedAt: now, claimToken: token }
}

/** 跨标签页互斥锁（Web Locks API）：同一任务同一时刻只允许一个
 *  WhatsApp 标签页/窗口持有并发送。双屏并排窗口、多标签页场景下，
 *  两个页面各自跑补发检查也不再竞争（ifAvailable：拿不到锁立即放弃，
 *  不排队）。锁覆盖「终验 → 发送 → 落终态」全程。 */
async function withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T | null> {
  const locks = (navigator as { locks?: LockManager }).locks
  if (!locks) return fn()
  try {
    const res = await locks.request(`wa-sched-${jobId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return null
      return fn()
    })
    return res ?? null
  } catch {
    return fn()
  }
}

/** 定时发送全局串行队列：所有任务排队执行。前一条已落终态（sent/failed）
 *  后，下一条的幂等检查才能可靠看到它的 sent 记录——这是"多条相同任务
 *  在出口处只发一条"的前提（并发跑的话两条会同时通过检查）。
 *  外层再套跨标签页锁：同任务跨页面也只发一次。 */
let schedQueue: Promise<void> = Promise.resolve()

function enqueueScheduleRun(job: ScheduleJob, jitterLo = 5000, jitterHi = 45000): Promise<void> {
  schedQueue = schedQueue.then(async () => {
    await withJobLock(job.id, () => runClaimedSchedule(job, jitterLo, jitterHi))
  })
  return schedQueue
}

/** 认领后的统一收尾：随机错峰延迟 → 终验 + 幂等闸门 → 发送（含媒体）→
 *  落终态 + Toast。finally 清理进程内在发集合。 */
async function runClaimedSchedule(job: ScheduleJob, jitterLo = 5000, jitterHi = 45000) {
  // 防风控：随机 5–45s 延迟（页面环境没有 MV3 SW 的 30s 生命周期限制，
  // 延迟必须放在这里而不是后台）
  await new Promise((r) => setTimeout(r, jitterLo + Math.random() * (jitterHi - jitterLo)))
  try {
    // 终验 + 幂等（一次读全量，两个检查共用）：
    // 1. 终验：状态仍是本次认领（claimToken 匹配）才继续，关闭 claim 与
    //    send 之间的全部竞争窗口
    // 2. 幂等闸门：60s 内已有「同一客户（JID 或 显示名匹配）+ 相同内容」
    //    的任务发送成功 → 本条直接标记跳过。就算上游因任何原因建出了
    //    两条相同任务，发送出口也只发出一条——治本兜底
    const all = await loadSchedules()
    const latest = all.find((x) => x.id === job.id)
    if (!latest || latest.status !== "sending" || latest.claimToken !== job.claimToken) {
      return
    }
    const dupSent = all.find(
      (x) =>
        x.id !== job.id &&
        x.status === "sent" &&
        (x.sentAt ?? 0) > Date.now() - 60_000 &&
        x.text === job.text &&
        (x.chatKey === job.chatKey ||
          (job.chatName !== "" && x.chatName === job.chatName))
    )
    if (dupSent) {
      await patchScheduleJob(job.id, {
        status: "sent",
        sentAt: Date.now(),
        error: t("检测到与刚发送任务内容相同，已自动跳过（防重复）")
      })
      console.log(`[wa-copilot] 跳过重复任务 ${job.id.slice(-6)}（同内容刚已发送）`)
      return
    }
    // 媒体附件：IndexedDB 取 Blob → dataUrl → relay sendFileMessage
    let media: { dataUrl: string; mediaType: string; filename?: string; mimetype?: string } | undefined
    if (job.mediaId) {
      const blob = await getScheduleMedia(job.mediaId)
      if (blob) {
        media = {
          dataUrl: await blobToDataUrl(blob),
          mediaType: job.mediaType ?? "auto-detect",
          filename: job.mediaName,
          mimetype: blob.type || undefined
        }
      }
    }
    await callWppSendMessage(job.chatKey, job.text, media)
    await patchScheduleJob(job.id, { status: "sent", sentAt: Date.now(), error: undefined })
    showToast(tf("✅ 定时消息已发送给 {name}", { name: job.chatName }))
    console.log(`[wa-copilot] 定时消息已发送：${job.chatName}（任务 ${job.id.slice(-6)}）`)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await patchScheduleJob(job.id, { status: "failed", error })
    showToast(tf("❌ 定时消息发送失败（{name}）：{err}", { name: job.chatName, err: error }))
    console.warn(`[wa-copilot] 定时消息发送失败（${job.chatName}）：${error}`)
  } finally {
    schedInFlight.delete(job.id)
  }
}

/**
 * 后台闹钟到点后派发到页面：认领任务后【立即 ack】，
 * 错峰延迟与发送收尾在页面侧异步完成（SW 不做长等待，避免被 30s 回收）。
 */
chrome.runtime.onMessage.addListener(
  (msg: { type?: string; id?: string }, _sender, sendResponse) => {
    const schedId = msg?.type === "wac:sendSchedule" ? msg.id : undefined
    if (!schedId) return false
    void (async () => {
      try {
        const job = await claimSchedule(schedId)
        // null = 已被其他路径认领或已处理完毕，同样回 ok（后台无需重试）
        if (!job) {
          sendResponse({ ok: true, note: "已处理" })
          return
        }
        sendResponse({ ok: true })
        void enqueueScheduleRun(job)
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    })()
    return true
  }
)

/**
 * 页面加载 / 变为可见时补发漏掉的任务：覆盖闹钟到点时页面被关、
 * 浏览器重启、SW 派发失败等场景。逐条认领、间隔数秒（防风控）。
 */
async function catchUpSchedules() {
  if (!wppReady || document.hidden) return
  const now = Date.now()
  const due = (await loadSchedules()).filter(
    (x) =>
      x.sendAt <= now + 1000 &&
      (x.status === "pending" ||
        (x.status === "sending" && now - (x.claimedAt ?? 0) > SCHED_CLAIM_TTL))
  )
  if (due.length === 0) return
  for (const item of due) {
    const job = await claimSchedule(item.id)
    if (!job) continue
    // 积压补发的错峰幅度缩小（页面已隔了很久，不必等满 45s）
    await enqueueScheduleRun(job, 3000, 12000)
    await new Promise((r) => setTimeout(r, 4000 + Math.random() * 5000))
  }
}

function onBridgeMessage(event: MessageEvent) {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.source !== "wa-copilot") return

  if (data.type === "WAJS_READY") {
    wppReady = true
    console.log("[wa-copilot] 收到 MAIN 世界通知：WPP 已就绪")
    // 就绪即批量预取会话列表设备档案（好友列表设备标签的数据源）
    void prefetchListDevices()
    // 就绪即补发漏掉的定时消息（闹钟期间页面被关 / 浏览器重启场景）
    void catchUpSchedules()
    return
  }
  if (data.type === "WPP_RESULT" && data.callId) {
    const cb = wppCallbacks.get(data.callId)
    if (!cb) return
    wppCallbacks.delete(data.callId)
    if (data.ok) {
      cb.resolve(data.data)
    } else {
      cb.reject(new Error(data.error || t("WPP 调用失败")))
    }
    return
  }
  if (data.type === "DIAG") logDiagnostics()
}

/* --------------------------------------------------------------- prefetch */

// 批量预取兜底轮询：WPP 就绪晚于页面加载 / 首次失败时自动重试，
// 成功后 prefetchListDevices 内部标志会短路，轮询空转零开销
setInterval(() => void prefetchListDevices(), 30000)
setTimeout(() => void prefetchListDevices(), 4000)
// 名字→JID 索引 + 历史档案 + 会话手选语言预载（列表设备标签/国旗/工具栏依赖内存数据），
// 完成后主动重绘一次，不必等 observer
void Promise.all([
  preloadNameIndex(),
  preloadAllProfiles(),
  getItem<Record<string, string>>("chatLangs")
]).then(([, n, langs]) => {
  if (langs) chatLangOverrides = langs
  console.log(`[wa-copilot] 档案预载完成：${n} 个联系人`)
  syncListNotes()
})

// 自检浮层：Ctrl+Shift+D（Mac: Cmd+Shift+D）唤出，截图反馈设备标签链路问题
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
    e.preventDefault()
    toggleDiag(collectDiagData)
  }
})

// 后台标签页切回来时补发漏掉的定时消息（事件驱动，不做周期轮询）
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void catchUpSchedules()
})

/* --------------------------------------------------------------- bootstrap */

// WPP 注入：background.ts 通过 chrome.scripting.registerContentScripts 已注册
// MAIN world 脚本。这里做兜底：3s 后若 WPP 仍未出现，用 <script> 标签补注入。
setTimeout(() => {
  if (!wppReady) {
    console.log("[wa-copilot] WPP 3s 未就绪，启动 <script> 标签兜底注入")
    injectWppBridge()
  }
}, 3000)
window.addEventListener("message", onBridgeMessage)

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  // 会话手选语言：组件写盘 → 内存立即同步，切回会话时 initialOverride 直接命中
  if (changes["wac:chatLangs"]) {
    chatLangOverrides =
      (changes["wac:chatLangs"].newValue as Record<string, string> | undefined) ?? {}
  }
  if (changes[SETTINGS_STORAGE_KEY]) {
    // 引擎变化（切引擎 / 换中转站 / 改模型名）后必须重译当前会话：
    // 否则已挂的徽章会一直展示上一个引擎的译文
    const prevScope = engineScope(settings)
    void refreshSettings().then(() => {
      ensureToolbar()
      // 界面语言可能在设置页被切换：顶栏胶囊、备注条、右侧面板都要立即重绘，
      // 不必等下一次 2s 轮询（三者的签名里都含 settings.uiLang）
      void tickHeader()
      ensurePanel()
      if (engineScope(settings) !== prevScope) retranslateForEngineChange()
      // 引擎列表本身可能变化（设置页增删自定义模型）：让已挂徽章菜单重渲染，
      // 列表与已缓存引擎均为实时读取，refresh 即可让新模型立刻出现在菜单里
      for (const entry of byRow.values()) entry.handle?.refresh()
    })
  }
})

subscribe(() => {
  toolbarSig = ""
  // 顶栏现在也渲染 CRM 数据（客户备注），所以「CRM 变更」必须一并刷新它：
  // 否则保存备注后要等下一次 2s 轮询，用户会以为没保存成功
  void tickHeader()
  runSync()
})

observeMain(runSync)

void refreshSettings()
  .then(loadCrm)
  .then(loadPanelWidth)
  .then(() => {
    void tickHeader()
    ensurePanel()
    runSync()
  })

setTimeout(() => {
  void tickHeader()
  ensurePanel()
  runSync()
}, 1500)

// 若 8 秒后仍没有任何译文徽章，但确实存在可翻译的接收消息，
// 自动打印诊断报告，省去来回猜测选择器。
setTimeout(() => {
  if (byRow.size > 0) return
  const scanned = scanMessages()
  const pending = scanned.filter((m) => m.incoming && shouldTranslate(m.text))
  if (pending.length === 0) return
  console.warn(
    `[wa-copilot] 检测到 ${pending.length} 条可翻译的接收消息，但译文徽章未挂载。诊断报告：`
  )
  logDiagnostics()
}, 8000)

// 页面隐藏（切到别的标签页）时跳过周期轮询：DOM 不会变，observer
// 仍在监听新消息，回来后 2s 内自然恢复。后台标签页从此零轮询开销。
setInterval(() => {
  if (document.hidden) return
  void tickHeader()
  ensurePanel()
  runSync()
}, HEADER_POLL_MS)

setInterval(() => {
  if (document.hidden) return
  syncMessages()
}, MESSAGE_POLL_MS)
