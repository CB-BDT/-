import { useCallback, useEffect, useRef, useState } from "react"

import { type ChatHistoryMsg, formatTranscript, streamSummary } from "~core/aiSummary"
import type { ComposerApi } from "~core/composer"
import { t, tf } from "~core/i18n"
import { languageLabel, TARGET_LANGUAGES } from "~core/languages"
import { getItem, setItem } from "~core/storage"

/**
 * AI 思考回复：读最近 50 条聊天记录 + 用户填的「目的提示词」，
 * 让 AI 生成 A/B/C 三条候选回复，点选即填入输入框。
 *
 * 复用既有 AI 流式通道（streamSummary），后台无需任何改动；
 * 与「AI 聊天总结」的区别：总结是给自己看的分析，这里是可直接发出去的话术。
 *
 * 关于「阅读语言」：候选是给使用者挑选的，不是直接发给客户的，
 * 所以必须用使用者看得懂的语言撰写；选中后经出站翻译链转成客户语言再发送。
 */

/** 目的提示词持久化键（storage 模块会自动补 wac: 前缀） */
const PROMPT_KEY = "replyPrompt"
/** 阅读语言持久化键：值为 "auto"（跟随接收翻译语言）或具体语言代码 */
const LANG_KEY = "replyLang"

/** 阅读语言下拉的默认项：跟随「接收消息译为」，避免与设置页重复配置 */
const AUTO_LANG = "auto"

/**
 * 生成候选的提示词。语言指令在运行时按「阅读语言」拼进来，
 * 因为不同使用者看得懂的语言不同（中国用户看中文、巴西用户看葡语）。
 */
function buildPrompt(langName: string, goal: string): string {
  return `你是资深外贸客服。根据聊天记录和我的目的，生成 3 条风格不同的回复候选。
要求：
1. 候选一律用${langName}撰写 —— 这是给我阅读挑选用的，内容之后会被翻译成客户语言再发出
2. 因此表达要完整明确、适合直译，不要用难以翻译的双关或俚语
3. 每条 1-3 句、口语自然；不要解释、不要前缀、不要编号
4. 严格按下面三个标记分段输出，除标记外不要插入其他分隔符
<<<A>>>
<<<B>>>
<<<C>>>
我的目的：${goal}`
}

const LETTERS = ["A", "B", "C"] as const
/** 最近 50 条 + 8000 字符预算：够判断语境，且比总结更快更省 token */
const REPLY_MAX_MSGS = 50
const REPLY_MAX_CHARS = 8000

/** 每段首尾可能被 AI 用 Markdown 包裹（`**<<<A>>>**`、``` 等），清理掉
 *  星号与反引号。刻意不清理 `-`/`#`：真实回复里可能以「-50%」这类内容开头。 */
const SEGMENT_TRIM = /^[\s*`]+|[\s*`]+$/g

/**
 * 解析 AI 返回的 A/B/C 三段。
 * 容错（实测 AI 的真实输出形态）：
 *  - 标记被 Markdown 加粗包裹 → 清理首尾星号
 *  - 前面带「好的，以下是三个回复」这类前言 → 从第一个标记处开始切
 *  - 完全没按标记输出 → 把整段当作唯一候选，而不是返回空数组让界面空白
 *  - 标记多于 3 个 → 只取前 3 条，兑现「A/B/C 三个候选」的承诺
 */
export function parseReplies(raw: string): string[] {
  const text = raw.trim()
  if (!text) return []
  const first = text.search(/<<<[ABC]>>>/)
  const body = first < 0 ? text : text.slice(first)
  return body
    .split(/<<<[ABC]>>>/)
    .map((s) => s.replace(SEGMENT_TRIM, "").trim())
    .filter(Boolean)
    .slice(0, 3)
}

export interface AiReplyPanelProps {
  /** 拉取最近若干条聊天记录（whatsapp.ts 侧已封装成 50 条） */
  onFetchHistory: () => Promise<ChatHistoryMsg[]>
  /** 用于把选中的回复写进 WhatsApp 输入框 */
  api: ComposerApi
  /** 设置页的「接收消息译为」：阅读语言选「自动」时用它 */
  incomingTarget: string
  /** 收起面板 */
  onClose: () => void
}

export function AiReplyPanel({
  onFetchHistory,
  api,
  incomingTarget,
  onClose
}: AiReplyPanelProps) {
  const [goal, setGoal] = useState("")
  /** 阅读语言："auto" = 跟随接收翻译语言，否则为具体语言代码 */
  const [readLang, setReadLang] = useState<string>(AUTO_LANG)
  /** 提示词已落盘的短暂提示（输入停顿后显示一小会儿即消失） */
  const [savedHint, setSavedHint] = useState(false)
  const [busy, setBusy] = useState(false)
  /** 流式原文：生成中先原样展示，结束后解析成候选卡片 */
  const [raw, setRaw] = useState("")
  const [replies, setReplies] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  /** 刚点过的那条候选：用于播放 ✓ 反馈 */
  const [pickedIdx, setPickedIdx] = useState<number | null>(null)

  const cancelRef = useRef<(() => void) | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 挂载时恢复上次填的目的提示词与阅读语言（用户要求「填入后自动保存」）
  useEffect(() => {
    let alive = true
    void getItem<string>(PROMPT_KEY).then((v) => {
      if (alive && typeof v === "string") setGoal(v)
    })
    void getItem<string>(LANG_KEY).then((v) => {
      // 只认字符串；读不到或类型不对时保持默认 "auto"
      if (alive && typeof v === "string" && v) setReadLang(v)
    })
    return () => {
      alive = false
    }
  }, [])

  // 卸载/收起时中断进行中的流与所有定时器，绝不对已卸载组件 setState
  useEffect(() => {
    return () => {
      cancelRef.current?.()
      cancelRef.current = null
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      if (pickedTimerRef.current) clearTimeout(pickedTimerRef.current)
    }
  }, [])

  /** 输入即改状态，防抖 600ms 落盘，避免每个字符都写 chrome.storage */
  const onGoalChange = useCallback((value: string) => {
    setGoal(value)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void setItem(PROMPT_KEY, value).catch(() => {
        /* 写盘失败不影响本次使用 */
      })
      setSavedHint(true)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      hintTimerRef.current = setTimeout(() => setSavedHint(false), 1500)
    }, 600)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setRaw("")
    setReplies([])
    setPickedIdx(null)
    setStatus(t("正在读取最近 50 条聊天记录…"))
    try {
      const msgs = await onFetchHistory()
      if (!msgs.length) {
        setBusy(false)
        setStatus(null)
        setError(t("当前聊天没有可分析的文本消息（可能全是表情/图片/系统提示）"))
        return
      }
      const { text, count } = formatTranscript(msgs, REPLY_MAX_MSGS, REPLY_MAX_CHARS)
      setStatus(tf("已读取 {count} 条消息，AI 思考中…", { count }))
      cancelRef.current = streamSummary(
        buildPrompt(
          languageLabel(readLang === AUTO_LANG ? incomingTarget : readLang),
          goal.trim() || "推进对话，保持友好专业"
        ),
        text,
        (e) => {
          if (e.type === "chunk") {
            setRaw((prev) => prev + e.text)
          } else if (e.type === "done") {
            setBusy(false)
            setStatus(null)
            cancelRef.current = null
            setRaw((prev) => {
              const list = parseReplies(prev)
              setReplies(list)
              if (!list.length) setError(t("AI 返回内容为空或无法解析，请重试"))
              return prev
            })
          } else {
            setBusy(false)
            setStatus(null)
            setError(e.error)
            cancelRef.current = null
          }
        }
      )
    } catch (err) {
      setBusy(false)
      setStatus(null)
      setError(
        err instanceof Error
          ? tf("读取聊天记录失败：{err}（请确认 WPP 已就绪）", { err: err.message })
          : String(err)
      )
    }
  }, [busy, goal, onFetchHistory, readLang, incomingTarget])

  const handleStop = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    setBusy(false)
    setStatus(t("已停止"))
  }, [])

  /** 阅读语言是点选式（非逐字输入），直接落盘即可，无需防抖 */
  const onLangChange = useCallback((value: string) => {
    setReadLang(value)
    void setItem(LANG_KEY, value).catch(() => {
      /* 写盘失败不影响本次使用 */
    })
  }, [])

  /** 点选候选 → 写入 WhatsApp 输入框 */
  const handlePick = useCallback(
    async (text: string, idx: number) => {
      const ok = await api.replace(text)
      if (!ok) {
        setError(t("填入输入框失败：请先点开一个聊天，再重试"))
        return
      }
      setError(null)
      setPickedIdx(idx)
      if (pickedTimerRef.current) clearTimeout(pickedTimerRef.current)
      pickedTimerRef.current = setTimeout(() => setPickedIdx(null), 1500)
    },
    [api]
  )

  return (
    <div className="wac-notice" data-tone="steel" role="note">
      <div className="wac-notice-head">
        <strong>{t("AI 思考回复 / Smart Reply")}</strong>
        {savedHint && <span className="wac-reply-saved">{t("已保存 ✓")}</span>}
        <button type="button" className="wac-notice-close" title={t("收起")} onClick={onClose}>
          {"\u2715"}
        </button>
      </div>

      {/* 阅读语言：候选是给我挑的，必须用我看得懂的语言写；点选即保存。
          与工具栏的「回译语言」是两回事——那个决定发给客户什么语言。 */}
      <div className="wac-reply-lang">
        <label className="wac-reply-lang-label" htmlFor="wac-reply-lang">
          {t("候选语言")}
        </label>
        <select
          id="wac-reply-lang"
          className="wac-reply-lang-select"
          value={readLang}
          onChange={(e) => onLangChange(e.target.value)}
          title={t("AI 用哪种语言写候选给我看（点选即保存）。候选填入输入框后，发送时会按工具栏的回译语言翻译成客户语言。")}>
          <option value={AUTO_LANG}>
            {tf("自动 · 跟随接收翻译语言（当前：{lang}）", {
              lang: languageLabel(incomingTarget)
            })}
          </option>
          {TARGET_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageLabel(code)}
            </option>
          ))}
        </select>
      </div>

      <textarea
        className="wac-reply-prompt"
        value={goal}
        spellCheck={false}
        onChange={(e) => onGoalChange(e.target.value)}
        placeholder={t("填写你的目的提示词（自动保存），例：催客户尽快确认订单，语气礼貌但坚定")}
      />

      <div className="wac-reply-controls">
        <span className="wac-reply-status">
          {status ?? (pickedIdx !== null ? t("已填入输入框，可直接发送或编辑") : "")}
        </span>
        {busy ? (
          <button type="button" className="wac-btn-ghost wac-reply-stop" onClick={handleStop}>
            {t("停止")}
          </button>
        ) : (
          <button type="button" className="wac-reply-go" onClick={() => void handleGenerate()}>
            {"\u2728"} {t("生成 3 个回复")}
          </button>
        )}
      </div>

      {error && <div className="wac-reply-error">⚠ {error}</div>}

      {busy && raw && <div className="wac-reply-stream">{raw}</div>}

      {replies.length > 0 && (
        <div className="wac-reply-list">
          {replies.map((text, i) => (
            <button
              key={`${i}-${text.slice(0, 12)}`}
              type="button"
              className="wac-reply-card"
              onClick={() => void handlePick(text, i)}
              title={t("点击填入聊天输入框")}>
              <span className="wac-reply-letter">{LETTERS[i] ?? i + 1}</span>
              <span className="wac-reply-text">{text}</span>
              {pickedIdx === i && <span className="wac-reply-check">{"\u2713"}</span>}
            </button>
          ))}
        </div>
      )}

      <p className="wac-notice-meta">
        {tf("读取最近 {n} 条记录，用「候选语言」写出 A/B/C 供你挑选；点选即填入输入框，", {
          n: REPLY_MAX_MSGS
        })}
        {t("发送前会按工具栏的回译语言翻译成客户语言，可自行修改。")}
        <br />
        {tf(
          "Drafts A/B/C in your reading language from the last {n} messages; click one to insert it, then it is translated into the customer's language before sending.",
          { n: REPLY_MAX_MSGS }
        )}
      </p>
    </div>
  )
}
