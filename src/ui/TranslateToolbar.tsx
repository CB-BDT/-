import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ChatHistoryMsg } from "~core/aiSummary"
import type { ComposerApi } from "~core/composer"
import { getUiLang, t, tf } from "~core/i18n"
import { TARGET_LANGUAGES, languageLabel } from "~core/languages"
import { callBg, type TranslateData } from "~core/messages"
import type { Settings, SpeakerGender } from "~core/settings"
import { getItem, setItem } from "~core/storage"

import { AiReplyPanel } from "./AiReplyPanel"
import { BrandLogo } from "./BrandLogo"

type Phase = "idle" | "busy" | "ready" | "error"

const GENDER_ORDER: SpeakerGender[] = ["female", "male", "neutral"]

interface EngineMeta {
  engine?: string
  model?: string
  degraded?: boolean
}

function engineName(id?: string, customModels?: { id: string; label?: string; model?: string }[]): string {
  if (id === "google") return "Google"
  if (id && id.startsWith("custom:")) {
    const m = (customModels ?? []).find((x) => `custom:${x.id}` === id)
    return (m && (m.label || m.model)) || t("自定义模型")
  }
  return id ?? ""
}

export interface TranslateToolbarProps {
  api: ComposerApi
  settings: Settings
  autoTarget: string
  chatKey: string
  dark: boolean
  /** 该会话手动选过的语言（无则 "auto"），来自 chrome.storage 持久化 */
  initialOverride: string
  /** 打开定时消息弹窗（whatsapp.ts 侧挂载 ScheduleModal） */
  onOpenSchedule?: () => void
  /** 拉取当前会话最近若干条聊天记录（AI 思考回复用）；缺省则隐藏该入口 */
  onFetchHistory?: () => Promise<ChatHistoryMsg[]>
}

const POLL_MS = 400
const DEBOUNCE_MS = 600

export function TranslateToolbar({
  api,
  settings,
  autoTarget,
  chatKey,
  dark,
  initialOverride,
  onOpenSchedule,
  onFetchHistory
}: TranslateToolbarProps) {
  // label 走 t()：必须在渲染期求值，才能跟随界面语言切换
  const GENDER_META: Record<SpeakerGender, { icon: string; label: string; color: string }> = {
    female: { icon: "\u2640\uFE0F", label: t("女性语气"), color: "#d6336c" },
    male: { icon: "\u2642\uFE0F", label: t("男性语气"), color: "#1971c2" },
    neutral: { icon: "\u26A7", label: t("不指定性别"), color: "var(--wac-muted)" }
  }

  const [override, setOverride] = useState(initialOverride)
  const [draft, setDraft] = useState("")
  const [forward, setForward] = useState("")
  const [back, setBack] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [note, setNote] = useState("")
  const [engineMeta, setEngineMeta] = useState<EngineMeta>({})
  // 当前引擎本地镜像：切换后立即生效（后台翻译读的是最新 settings）
  const [engineId, setEngineId] = useState(settings.engine)
  // 说话者性别：本地镜像 props，切换后立即重译并持久化
  const [gender, setGender] = useState<SpeakerGender>(settings.speakerGender ?? "female")
  // 「重要提示」展开态（常驻按钮 + 就地展开中英说明）
  const [showNotice, setShowNotice] = useState(false)
  // 「功能介绍」展开态（与重要提示互斥，避免两块面板把输入区顶太高）
  const [showFeatures, setShowFeatures] = useState(false)
  // 「AI 思考回复」展开态（三块面板两两互斥）
  const [showReply, setShowReply] = useState(false)

  /** 三块顶部面板互斥：同一时刻只展开一个，避免把输入区顶得过高 */
  const openPanel = useCallback((which: "notice" | "features" | "reply") => {
    setShowNotice((v) => (which === "notice" ? !v : false))
    setShowFeatures((v) => (which === "features" ? !v : false))
    setShowReply((v) => (which === "reply" ? !v : false))
  }, [])

  useEffect(() => {
    setGender(settings.speakerGender ?? "female")
  }, [settings.speakerGender])

  useEffect(() => {
    setEngineId(settings.engine)
  }, [settings.engine])

  /** 聊天框切换引擎：全局生效并持久化，下一次翻译即采用 */
  function pickEngine(value: string) {
    setEngineId(value)
    void callBg({ type: "setSettings", patch: { engine: value } })
  }

  /** 引擎选项列表（与设置页一致）。顺序：谷歌 → Lingva → DeepL → 自定义模型 */
  const engineOptions = useMemo(
    () => [
      { value: "google", label: t("谷歌·免费") },
      { value: "lingva", label: t("Lingva·免费") },
      { value: "deepl", label: "DeepL" },
      ...(settings.customModels ?? []).map((m) => ({
        value: `custom:${m.id}`,
        label: m.label || m.model || t("自定义模型")
      }))
    ],
    [settings.customModels]
  )

  const cycleGender = () => {
    const idx = GENDER_ORDER.indexOf(gender)
    const next = GENDER_ORDER[(idx + 1) % GENDER_ORDER.length]
    setGender(next)
    void callBg({ type: "setSettings", patch: { speakerGender: next } })
  }

  const seq = useRef(0)
  const busyRef = useRef(false)
  const forwardRef = useRef("")
  const applyRef = useRef<() => Promise<void>>(async () => {})
  /** Enter 挂起标记：译文未就绪时按下回车，翻译完成后自动替换并发送 */
  const pendingSendRef = useRef(false)
  /** 当前译文对应的源文（判过期：草稿改了但译文还是旧的） */
  const lastSourceRef = useRef("")
  /** 输入框当前内容镜像（handler 闭包里读最新值，不信 state 快照） */
  const draftRef = useRef("")

  const target = override === "auto" ? autoTarget : override

  useEffect(() => {
    forwardRef.current = forward
  }, [forward])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  // 轮询输入框内容（Lexical 不暴露 value，只能读 DOM）
  useEffect(() => {
    const timer = window.setInterval(() => {
      const text = api.read()
      setDraft((prev) => (prev === text ? prev : text))
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [api])

  // 切换会话时重置预览；语言下拉恢复为「该会话上次手选值」（无则自动跟随手机号国家）
  useEffect(() => {
    seq.current += 1
    setOverride(initialOverride)
    setForward("")
    setBack("")
    setNote("")
    setEngineMeta({})
    setPhase("idle")
    // 会话切换：取消 Enter 挂起，避免译文完成后误发到新会话
    pendingSendRef.current = false
    lastSourceRef.current = ""
  }, [chatKey, initialOverride])

  /** 手选语言按会话落盘；选回「自动」即清除记录，恢复跟随手机号归属国 */
  function pickOverride(value: string) {
    setOverride(value)
    void (async () => {
      if (!chatKey) return
      const map = (await getItem<Record<string, string>>("chatLangs")) ?? {}
      if (value === "auto") delete map[chatKey]
      else map[chatKey] = value
      await setItem("chatLangs", map)
    })()
  }

  useEffect(() => {
    const text = draft.trim()

    if (text.length < 2) {
      seq.current += 1
      setForward("")
      setBack("")
      setNote("")
      setEngineMeta({})
      setPhase("idle")
      return
    }

    const timer = window.setTimeout(() => {
      void run(text, target)
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
    // engineId 变化（聊天框切换引擎）后用新引擎重译
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, target, gender, engineId, settings.incomingTarget])

  async function run(text: string, targetLang: string) {
    const token = ++seq.current
    setPhase("busy")
    setNote("")

    const res = await callBg<TranslateData>({
      type: "translate",
      texts: [text],
      target: targetLang,
      // 这是「我要说的话」→ 外语：按说话者性别约束词形
      gender
    })
    if (token !== seq.current) return

    if (!res.ok) {
      setPhase("error")
      setNote(res.error)
      // Enter 挂起等待翻译：失败即取消，避免用户以为会自动发送
      if (pendingSendRef.current) {
        pendingSendRef.current = false
        setNote(tf("{err}（已取消自动发送，请手动处理）", { err: res.error }))
      }
      return
    }

    const translated = (res.data.texts[0] ?? "").trim()
    if (!translated) {
      setPhase("error")
      setNote(t("引擎返回空译文"))
      if (pendingSendRef.current) {
        pendingSendRef.current = false
        setNote(t("引擎返回空译文（已取消自动发送，请手动处理）"))
      }
      return
    }
    setForward(translated)
    // 记录译文对应的源文，Enter 拦截用它判断译文是否已过期
    lastSourceRef.current = text

    // Enter 挂起等待中：回译只是展示用，不必等它，译文一就绪即发送
    if (pendingSendRef.current) {
      pendingSendRef.current = false
      void applyRef.current()
    }

    // 只读透传后台返回的引擎/模型/降级信息，绝不触碰 wac:settings
    setEngineMeta({
      engine: res.data.engine,
      model: res.data.model,
      degraded: res.data.degraded
    })

    const backRes = await callBg<TranslateData>({
      type: "translate",
      texts: [translated],
      target: settings.incomingTarget
    })
    if (token !== seq.current) return

    setBack(backRes.ok ? (backRes.data.texts[0] ?? "").trim() : "")
    setPhase("ready")
  }

  async function apply() {
    if (busyRef.current) return

    const text = forwardRef.current.trim()
    if (!text) {
      setNote(t("暂无译文"))
      return
    }

    busyRef.current = true
    setPhase("busy")
    try {
      const ok = await api.replace(text)
      if (!ok) {
        setPhase("error")
        setNote(t("写入输入框失败，请手动复制"))
        return
      }

      if (!settings.autoSend) {
        setPhase("ready")
        setNote(t("已替换，请手动发送"))
        return
      }

      const sent = await api.send()
      if (sent) {
        seq.current += 1
        setForward("")
        setBack("")
        setDraft("")
        setPhase("idle")
        setNote(t("已发送"))
      } else {
        setPhase("error")
        setNote(t("自动发送失败，请手动发送"))
      }
    } finally {
      busyRef.current = false
    }
  }

  useEffect(() => {
    applyRef.current = apply
  })

  // autoSend 开启时拦截 Enter：回车一律发送「翻译后的」文本。
  // - 译文已就绪且与当前草稿匹配 → 立即替换并发送
  // - 译文未就绪/翻译中/已过期 → 拦截本次回车并挂起，翻译完成自动发送
  //   （旧逻辑此场景直接放行，导致发出去的是未翻译的中文原文）
  // autoSend 关闭时不拦截，保持 WhatsApp 原生发送行为
  useEffect(() => {
    if (!settings.autoSend) return

    const el = api.element()
    if (!el) return

    const handler = (event: KeyboardEvent) => {
      if (!event.isTrusted) return
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return
      }
      // 输入框为空或仅 1 个字符（引擎不翻，挂起会死等）：放行原生行为
      const draftNow = draftRef.current.trim()
      if (draftNow.length < 2) return

      // 译文就绪且与当前草稿匹配 → 立即发送；
      // 否则（翻译中 / 还没翻 / 草稿刚改过译文已过期）挂起等翻译完成
      const ready =
        !busyRef.current &&
        !!forwardRef.current.trim() &&
        lastSourceRef.current === draftNow

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (ready) {
        void applyRef.current()
      } else {
        pendingSendRef.current = true
        setNote(t("翻译中，完成后自动发送…"))
      }
    }

    el.addEventListener("keydown", handler, true)
    return () => el.removeEventListener("keydown", handler, true)
  }, [settings.autoSend, api, chatKey])

  const preview = phase === "busy" ? t("翻译中…") : forward

  // 免责/功能面板原设计是「中英对照」：下面是固定英文段落。
  // 界面语言为英文时上方文案本身已是英文，再显示一遍会重复，故只在中文界面下保留。
  const zhMode = getUiLang() === "zh-CN"

  return (
    <div className="wac-bar" data-dark={dark ? "true" : undefined}>
      <div className="wac-row">
        {/* 常驻显眼入口：铜橙渐变，和钛蓝工具栏形成对比，第一眼就能看到 */}
        <button
          type="button"
          className="wac-notice-btn"
          aria-expanded={showNotice}
          onClick={() => openPanel("notice")}
          title={t("重要提示：使用前请阅读中英文说明")}>
          {/* \uFE0E 强制文字形态，避免在铜橙底上渲染成彩色 emoji */}
          {"\u26A0\uFE0E"} {t("重要提示")}
        </button>
        <button
          type="button"
          className="wac-soft-btn"
          aria-expanded={showFeatures}
          onClick={() => openPanel("features")}
          title={t("功能介绍与作者联系方式")}>
          {"\u2630"} {t("功能介绍")}
        </button>
        {onFetchHistory && (
          <button
            type="button"
            className="wac-soft-btn"
            aria-expanded={showReply}
            onClick={() => openPanel("reply")}
            title={t("AI 思考回复：读取最近 50 条聊天，按你的目的生成 A/B/C 三个候选回复")}>
            {"\u2728"} {t("AI 回复")}
          </button>
        )}
        <span className="wac-brand" title={t("CB BDT 插件注入的界面")}>
          <BrandLogo size={16} />
          {t("回译")}
        </span>
        <select
          className="wac-select"
          value={override}
          onChange={(event) => pickOverride(event.target.value)}
          title={t("翻译目标语言（手动选择后对该客户保持记住；「自动」= 跟随对方手机号归属国）")}>
          <option value="auto">{tf("自动（{lang}）", { lang: languageLabel(autoTarget) })}</option>
          {TARGET_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageLabel(code)}
            </option>
          ))}
        </select>

        <select
          className="wac-select"
          value={engineId}
          onChange={(event) => pickEngine(event.target.value)}
          title={t("翻译引擎（全局生效并记住）：谷歌 / Lingva / DeepL / 自定义模型")}
          style={{ flex: "0 0 auto", maxWidth: 150 }}>
          {engineOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="wac-gender"
          onClick={cycleGender}
          title={
            tf("说话者性别：{label}（点击切换 女/男/不指定）", {
              label: GENDER_META[gender].label
            }) +
            "\n" +
            t("生效语言：西/葡/法/意/德/俄/波兰/阿拉伯/印地/孟加拉。") +
            "\n" +
            t("不只是 interesada：形容词、过去时分词、俄语过去式动词（сделала）、") +
            "\n" +
            t("法语 je suis arrivée、德语职业名词（Ärztin）都会按此性别变化。") +
            "\n" +
            t("AI 引擎严格执行；Google 免费接口为上下文引导，重要句子建议切 AI 复核。") +
            "\n" +
            t("英/中/日/韩/土等语言语法上无性别词形，不会有差别（日韩仅 AI 会调整语气）。")
          }
          // 底色/文字色跟性别走，其余（高度、圆角、hover）交给 .wac-gender
          style={{
            background:
              gender === "neutral"
                ? "var(--glass-2)"
                : `${GENDER_META[gender].color}1f`,
            color: gender === "neutral" ? "var(--muted)" : GENDER_META[gender].color
          }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>{GENDER_META[gender].icon}</span>
          {gender === "female" ? t("女") : gender === "male" ? t("男") : t("中性")}
        </button>

        {onOpenSchedule && (
          <button
            type="button"
            className="wac-btn wac-btn-ghost"
            onClick={onOpenSchedule}
            title={
              t("定时发送：设定时间（可选时区，默认北京时间）与内容，到点自动发给当前客户。") +
              "\n" +
              t("防风控：多个客户的定时时间请彼此错开几分钟，不要设成同一时刻。")
            }>
            ⏰ {t("定时")}
          </button>
        )}

        {engineMeta.engine && (
          <span
            className="wac-engine"
            title={
              engineMeta.model
                ? tf("实际模型/引擎：{model}", { model: engineMeta.model })
                : undefined
            }>
            {engineName(engineMeta.engine, settings.customModels)}
            {engineMeta.degraded ? t(" (降级)") : ""}
          </span>
        )}

        <div className="wac-preview" title={forward || undefined}>
          {preview || (draft.trim() ? "…" : t("输入中文后自动生成译文"))}
        </div>

        <button
          type="button"
          className="wac-btn"
          disabled={!forward || phase === "busy"}
          onClick={() => void apply()}>
          {settings.autoSend ? t("替换并发送") : t("替换到输入框")}
        </button>
      </div>

      {(back || note) && (
        <div className="wac-row wac-sub">
          {back && (
            <span className="wac-back" title={t("回译验证")}>
              {tf("回译：{text}", { text: back })}
            </span>
          )}
          {note && (
            <span className="wac-note" data-tone={phase}>
              {note}
            </span>
          )}
        </div>
      )}

      {/* 点击「重要提示」就地展开的中英双语说明 */}
      {showNotice && (
        <div className="wac-notice" role="note">
          <div className="wac-notice-head">
            <strong>{t("重要提示 / Important Notice")}</strong>
            <button
              type="button"
              className="wac-notice-close"
              title={t("收起")}
              onClick={() => setShowNotice(false)}>
              {"\u2715"}
            </button>
          </div>

          <ol className="wac-notice-list">
            <li>
              <b>{t("用途说明")}</b>
              {t("：本项目仅供个人技术研究、学习与交流使用，作者不对代码的准确性、完整性或特定用途适用性作任何明示或暗示的保证。")}
            </li>
            <li>
              <b>{t("合法合规")}</b>
              {t("：请在遵守当地法律法规的前提下使用本项目。严禁将本项目及其衍生版本用于任何非法用途（包括但不限于网络攻击、数据窃取、非法入侵等）。")}
            </li>
            <li>
              <b>{t("责任自负")}</b>
              {t("：使用者因使用本项目所产生的一切直接或间接后果、法律责任及损失，均由使用者自行承担，原作者不承担任何形式的连带责任。")}
            </li>
            <li>
              <b>{t("无侵权声明")}</b>
              {t("：本项目中的所有内容均属于个人技术实践分享，不涉及任何商业机密或第三方侵权行为。")}
            </li>
          </ol>

          {zhMode && (
            <>
              <p className="wac-notice-en">
                <b>Purpose</b>: for personal technical research, learning and exchange only; no
                warranty, express or implied, as to accuracy, completeness or fitness for a
                particular purpose.
              </p>
              <p className="wac-notice-en">
                <b>Compliance</b>: use only in compliance with your local laws and regulations.
                Any illegal use (including but not limited to network attacks, data theft or
                unauthorized intrusion) is strictly prohibited.
              </p>
              <p className="wac-notice-en">
                <b>Liability</b>: any direct or indirect consequence, legal liability or loss
                arising from use is borne solely by the user; the original author assumes no
                joint liability of any kind.
              </p>
              <p className="wac-notice-en">
                <b>Non-infringement</b>: all content is a personal technical practice sharing
                and involves no commercial secrets or third-party infringement.
              </p>
            </>
          )}

          <p className="wac-notice-meta">
            {t("CB BDT · 非官方项目，与 WhatsApp / Meta 无任何关联，请遵守其服务条款；自动化操作存在账号风控风险，由使用者自行承担。")}
            {zhMode && (
              <>
                <br />
                Unofficial project, not affiliated with WhatsApp or Meta. Automation carries
                account risk; you bear that risk yourself.
              </>
            )}
          </p>
        </div>
      )}

      {/* 点击「功能介绍」展开的功能清单 + 作者联系方式 */}
      {showFeatures && (
        <div className="wac-notice" data-tone="steel" role="note">
          <div className="wac-notice-head">
            <strong>{t("功能介绍 / Features")}</strong>
            <button
              type="button"
              className="wac-notice-close"
              title={t("收起")}
              onClick={() => setShowFeatures(false)}>
              {"\u2715"}
            </button>
          </div>

          <ol className="wac-notice-list">
            <li>
              <b>{t("自动翻译")}</b>
              {t("：收到消息自动译好，挂在气泡下方；视口懒加载，聊天记录再多也不卡。")}
            </li>
            <li>
              <b>{t("逐条切引擎")}</b>
              {t("：每条消息都能单独换引擎——谷歌免费 / Lingva 免费 / DeepL / 自定义 AI 模型。")}
            </li>
            <li>
              <b>{t("出站回译")}</b>
              {t("：输入中文自动译成客户语言，可一键替换，也能回车直接发送译文。")}
            </li>
            <li>
              <b>{t("说话者性别")}</b>
              {t("：女 / 男 / 中性三态，西、葡、法、意、德、俄等语言的语法人称更准确。")}
            </li>
            <li>
              <b>{t("客户资料卡")}</b>
              {t("：姓名 / 职位 / 兴趣 / 生日 / 备注；资料摘要在聊天顶栏下方常驻完全展开显示。")}
            </li>
            <li>
              <b>{t("智能识别")}</b>
              {t("：按手机号判断客户国家与语言，并识别对方设备（iOS / Android / Web）。")}
            </li>
            <li>
              <b>{t("快捷话术面板")}</b>
              {t("：分组管理、一键填入输入框、拖拽排序，宽度可拖并可记忆。")}
            </li>
            <li>
              <b>{t("定时发送消息")}</b>
              {t("：设定时间自动发给指定客户；防风控错峰、防重复发送、离线补发。")}
            </li>
            <li>
              <b>{t("地图位置发送")}</b>
              {t("：搜索地点 → 地图预览 → 一键把定位卡片发给客户。")}
            </li>
            <li>
              <b>{t("AI 会话总结")}</b>
              {t("：读取该客户")}
              <strong>{t("全部聊天记录")}</strong>
              {t("，流式生成摘要，可保存到客户备注。")}
            </li>
            <li>
              <b>{t("AI 思考回复")}</b>
              {t("：读取最近 50 条聊天，按你填的")}
              <strong>{t("目的提示词")}</strong>
              {t("（自动保存）生成")}
              {t("A/B/C 三个候选回复，点一下直接填入聊天输入框。候选语言可单独设置（默认跟随")}
              {t("「接收消息译为」，即你看得懂的语言），发送时再自动翻译成客户语言。")}
            </li>
          </ol>

          {zhMode && (
            <p className="wac-notice-en">
              <b>Features</b>: auto-translate incoming messages with per-message engine
              switching; outbound back-translation with one-click or Enter-to-send; speaker
              gender grammar; customer profile and notes; country and device detection;
              quick-reply panel; scheduled messages; map location sending; AI chat summary
              over the full conversation; AI smart reply producing A/B/C drafts from the last
              50 messages per your own goal prompt.
            </p>
          )}

          <p className="wac-notice-meta">
            {t("作者联系方式 / Author contact — Telegram:")}{" "}
            <a
              className="wac-notice-link"
              href="https://t.me/CB_BDT"
              target="_blank"
              rel="noreferrer noopener">
              @CB_BDT
            </a>
          </p>
        </div>
      )}

      {/* 「AI 思考回复」：读最近 50 条 + 目的提示词 → A/B/C 候选，点选填入输入框 */}
      {showReply && onFetchHistory && (
        <AiReplyPanel
          onFetchHistory={onFetchHistory}
          api={api}
          incomingTarget={settings.incomingTarget}
          onClose={() => setShowReply(false)}
        />
      )}
    </div>
  )
}
