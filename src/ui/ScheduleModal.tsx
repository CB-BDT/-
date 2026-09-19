import { useEffect, useRef, useState, useCallback } from "react"

import {
  defaultLocalInTz,
  formatInTz,
  newScheduleId,
  TZ_OPTIONS,
  zonedTimeToUtc,
  type ScheduleJob
} from "~core/schedule"
import { callBg, type TranslateData } from "~core/messages"
import { t, tf } from "~core/i18n"
import { TARGET_LANGUAGES, languageLabel } from "~core/languages"
import { deleteScheduleMedia, putScheduleMedia } from "~core/mediaStore"
import type { SpeakerGender } from "~engines/types"

export interface ScheduleModalProps {
  dark: boolean
  /** 当前会话的发送目标（chatId 优先，退回名字键） */
  chatKey: string
  /** 当前客户显示名 */
  chatName: string
  /** 当前会话的自动发送目标语言（做"发送语言"的默认值） */
  autoTarget: string
  onClose: () => void
}

/** 媒体大小上限（base64 膨胀 33% 后约 21MB，postMessage 可承受） */
const MAX_MEDIA_BYTES = 16 * 1024 * 1024

const STATUS_TEXT: Record<ScheduleJob["status"], string> = {
  pending: "⏰ 待发送",
  sending: "📤 发送中",
  sent: "✅ 已发送",
  failed: "❌ 失败",
  canceled: "🚫 已取消"
}

const GENDERS: { id: SpeakerGender; label: string; icon: string }[] = [
  { id: "female", label: "女", icon: "👩" },
  { id: "male", label: "男", icon: "👨" },
  { id: "neutral", label: "中性", icon: "👤" }
]

interface PickedMedia {
  blob: Blob
  name: string
  type: "image" | "video"
  previewUrl: string
}

export function ScheduleModal({ dark, chatKey, chatName, autoTarget, onClose }: ScheduleModalProps) {
  const [jobs, setJobs] = useState<ScheduleJob[]>([])
  const [text, setText] = useState("")
  const [tz, setTz] = useState("Asia/Shanghai")
  // datetime-local 值按所选时区解释；切时区时重算默认值
  const [when, setWhen] = useState(() => defaultLocalInTz("Asia/Shanghai"))
  const [sendLang, setSendLang] = useState(
    TARGET_LANGUAGES.includes(autoTarget as never) ? autoTarget : "en"
  )
  const [gender, setGender] = useState<SpeakerGender>("female")
  const [media, setMedia] = useState<PickedMedia | null>(null)
  // 翻译回译确认
  const [translating, setTranslating] = useState(false)
  const [forward, setForward] = useState("")
  const [back, setBack] = useState("")
  // 填入译文时记住中文原文（任务列表展示"由 xx 翻译"用）
  const [originDraft, setOriginDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNoteText] = useState("")
  /** 状态条是否为错误（决定红色）。不能用文案是否含「失败」判断：
   *  英文界面下文案已本地化，中文匹配会失效。 */
  const [noteError, setNoteError] = useState(false)
  const setNote = useCallback((msg: string, isError = false) => {
    setNoteText(msg)
    setNoteError(isError)
  }, [])
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void callBg<ScheduleJob[]>({ type: "scheduleList" }).then((res) => {
      if (res.ok && Array.isArray(res.data)) setJobs(res.data)
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [onClose])

  // 卸载时清预览 URL
  useEffect(() => {
    return () => {
      if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function switchTz(next: string) {
    setTz(next)
    setWhen(defaultLocalInTz(next))
  }

  function pickFile(file: File | undefined) {
    if (!file) return
    const isImage = file.type.startsWith("image/")
    const isVideo = file.type.startsWith("video/")
    if (!isImage && !isVideo) {
      setNote(t("只支持图片或视频文件"))
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setNote(
        tf("文件太大（{size}MB），上限 16MB", { size: (file.size / 1024 / 1024).toFixed(1) })
      )
      return
    }
    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl)
    setMedia({
      blob: file,
      name: file.name,
      type: isImage ? "image" : "video",
      previewUrl: URL.createObjectURL(file)
    })
    setNote("")
  }

  function clearMedia() {
    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl)
    setMedia(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  /** 翻译 + 回译确认：原文 → 目标语言（按性别词形），译文 → 中文，两边对照。 */
  async function translateConfirm() {
    const source = text.trim()
    if (source.length < 2) {
      setNote(t("请先填写消息内容再翻译"))
      return
    }
    setTranslating(true)
    setNote("")
    setForward("")
    setBack("")
    try {
      const res = await callBg<TranslateData>({
        type: "translate",
        texts: [source],
        target: sendLang,
        // 「我要说的话」→ 外语：按说话者性别约束词形
        gender
      })
      if (!res.ok) {
        setNote(tf("翻译失败：{err}", { err: res.error }), true)
        return
      }
      const translated = (res.data.texts[0] ?? "").trim()
      setForward(translated)
      if (!translated) {
        setNote(t("引擎返回空译文"))
        return
      }
      // 回译：译文 → 中文，供人肉比对语义
      const backRes = await callBg<TranslateData>({
        type: "translate",
        texts: [translated],
        target: "zh-CN"
      })
      if (backRes.ok) setBack((backRes.data.texts[0] ?? "").trim())
    } finally {
      setTranslating(false)
    }
  }

  /** 回译确认无误后，把译文直接填入内容框（与聊天框"回译后发送"同款
   *  交互）。任务保存的就是输入框当前内容，到点只发这一份。 */
  function adoptTranslation() {
    if (!forward) return
    setOriginDraft(text.trim())
    setText(forward)
    setForward("")
    setBack("")
    setNote(t("✅ 译文已填入内容框（到点只发送这一份，可继续手动修改）"))
  }

  async function submit() {
    const origin = text.trim()
    if (!origin && !media) {
      setNote(t("请填写消息内容或选择图片/视频"))
      return
    }
    if (!chatKey) {
      setNote(t("无法识别当前聊天，请先打开一个客户的会话"))
      return
    }
    const sendAt = zonedTimeToUtc(when, tz)
    if (!Number.isFinite(sendAt)) {
      setNote(t("时间格式不正确"))
      return
    }
    // chrome.alarms 最小粒度 30s，且随机错峰会再延迟最多 45s
    if (sendAt < Date.now() + 60_000) {
      setNote(t("发送时间至少要在 1 分钟之后"))
      return
    }

    setBusy(true)
    setNote("")
    try {
      // 内容框当前内容即最终发送内容（译文已在确认后填入，或用户手写的原文）
      const finalText = origin
      let mediaId: string | undefined
      if (media) mediaId = await putScheduleMedia(media.blob)
      const job: ScheduleJob = {
        id: newScheduleId(),
        chatKey,
        chatName: chatName || t("当前客户"),
        text: media && !finalText ? "" : finalText,
        sendAt,
        tz,
        status: "pending",
        createdAt: Date.now(),
        mediaId,
        mediaName: media?.name,
        mediaType: media?.type,
        sendLang: originDraft && originDraft !== finalText ? sendLang : undefined,
        originText: originDraft && originDraft !== finalText ? originDraft : undefined
      }
      const res = await callBg<ScheduleJob[]>({ type: "scheduleUpsert", job })
      if (!res.ok) {
        if (mediaId) await deleteScheduleMedia(mediaId)
        setNote(tf("保存失败：{err}", { err: res.error }), true)
        return
      }
      setJobs(Array.isArray(res.data) ? res.data : [])
      setText("")
      setForward("")
      setBack("")
      setOriginDraft("")
      clearMedia()
      setNote(t("已创建定时消息"))
    } finally {
      setBusy(false)
    }
  }

  async function remove(job: ScheduleJob) {
    const res = await callBg<ScheduleJob[]>({ type: "scheduleDelete", id: job.id })
    if (res.ok && Array.isArray(res.data)) setJobs(res.data)
    // 附件随任务清理（避免 IndexedDB 留孤儿）
    if (job.mediaId) await deleteScheduleMedia(job.mediaId)
  }

  const sorted = [...jobs].sort((a, b) => {
    const rank = (x: ScheduleJob) => (x.status === "pending" || x.status === "sending" ? 0 : 1)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return a.sendAt - b.sendAt
  })

  const inputStyle = { font: "inherit" }

  return (
    <div
      className="wac-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}>
      <div className="wac-card" data-dark={dark} style={{ width: 440 }}>
        <div className="wac-head">
          <strong>{t("定时发送消息")}</strong>
          <span title={chatName}>{t("发给：")}{chatName || t("当前客户")}</span>
        </div>

        <div className="wac-body">
          <div
            style={{ fontSize: 11, opacity: 0.7, marginBottom: 8, wordBreak: "break-all" }}
            title={chatKey}>
            {t("目标标识：")}
            {chatKey || t("（未识别）")}
            {chatKey.endsWith("@c.us")
              ? t(" ✅ 正规 JID")
              : t(" ⚠️ 非正规 JID（将尝试名字匹配）")}
          </div>
          <div className="wac-field">
            <label htmlFor="wac-sched-text">{t("消息内容（中文即可，下面选语言并翻译确认）")}</label>
            <textarea
              id="wac-sched-text"
              rows={3}
              value={text}
              placeholder={t("到点后将自动发送（可翻译成客户语言后发送）")}
              style={inputStyle}
              onChange={(event) => setText(event.target.value)}
            />
          </div>

          <div className="wac-field">
            <label htmlFor="wac-sched-lang">{t("发送语言（与聊天框回译同引擎）")}</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                id="wac-sched-lang"
                value={sendLang}
                style={{ ...inputStyle, flex: 1 }}
                onChange={(event) => {
                  setSendLang(event.target.value)
                  setForward("")
                  setBack("")
                }}>
                {TARGET_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {languageLabel(code)}
                  </option>
                ))}
              </select>
              {/* 性别切换：与聊天框一致，约束译入词形（西语等分阴阳性） */}
              {GENDERS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  title={tf("说话者性别：{label}", { label: t(g.label) })}
                  onClick={() => setGender(g.id)}
                  style={{
                    flex: "0 0 auto",
                    font: "inherit",
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border:
                      gender === g.id
                        ? "1px solid #00a884"
                        : "1px solid rgba(134,150,160,.4)",
                    background: gender === g.id ? "rgba(0,168,132,.15)" : "transparent"
                  }}>
                  {g.icon}
                  {t(g.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="wac-field" style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="wac-btn"
              disabled={translating}
              style={{ flex: "0 0 auto", font: "inherit", cursor: "pointer" }}
              onClick={() => void translateConfirm()}>
              {translating ? t("翻译中…") : t("🔄 翻译回译确认")}
            </button>
            <span style={{ fontSize: 11.5, opacity: 0.75, alignSelf: "center" }}>
              {t("先看回译再决定发哪版")}
            </span>
          </div>

          {(forward || back) && (
            <div className="wac-field" style={{ fontSize: 12.5 }}>
              <label>{t("译文确认（比对回译无误后填入，只发这一份）")}</label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  border: "1px solid rgba(134,150,160,.35)",
                  borderRadius: 6,
                  padding: "8px 10px"
                }}>
                <div>
                  <span style={{ opacity: 0.6 }}>
                    {tf("译文（{lang}）：", { lang: languageLabel(sendLang) })}
                  </span>
                  <div>{forward || "—"}</div>
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>{t("回译（译回中文，比对语义）：")}</span>
                  <div>{back || "—"}</div>
                </div>
                <button
                  type="button"
                  className="wac-btn"
                  disabled={!forward}
                  style={{ font: "inherit", fontSize: 12, cursor: "pointer", alignSelf: "flex-start" }}
                  onClick={adoptTranslation}>
                  {"\u2B07"} {t("填入译文（到点只发送这一份）")}
                </button>
              </div>
            </div>
          )}

          <div className="wac-field">
            <label>{t("附件（可选：图片或视频，≤16MB）")}</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: "none" }}
                onChange={(event) => pickFile(event.target.files?.[0])}
              />
              <button
                type="button"
                className="wac-btn"
                style={{ flex: "0 0 auto", font: "inherit", cursor: "pointer" }}
                onClick={() => fileRef.current?.click()}>
                {"\u{1F4CE}"} {t("选择图片/视频")}
              </button>
              {media ? (
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    gap: 8,
                    alignItems: "center"
                  }}>
                  {media.type === "image" ? (
                    <img
                      src={media.previewUrl}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
                    />
                  ) : (
                    <span style={{ fontSize: 24 }}>🎬</span>
                  )}
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 12
                    }}
                    title={media.name}>
                    {media.name}（{(media.blob.size / 1024 / 1024).toFixed(1)}MB）
                  </span>
                  <button
                    type="button"
                    title={t("移除附件")}
                    onClick={clearMedia}
                    style={{
                      flex: "0 0 auto",
                      font: "inherit",
                      fontSize: 11,
                      border: "1px solid rgba(234,0,56,.4)",
                      color: "#ea0038",
                      background: "transparent",
                      borderRadius: 6,
                      padding: "3px 8px",
                      cursor: "pointer"
                    }}>
                    {t("移除")}
                  </button>
                </span>
              ) : (
                <span style={{ fontSize: 11.5, opacity: 0.75 }}>{t("无附件（纯文字）")}</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div className="wac-field" style={{ flex: "1 1 55%" }}>
              <label htmlFor="wac-sched-when">{t("发送时间")}</label>
              <input
                id="wac-sched-when"
                type="datetime-local"
                value={when}
                style={inputStyle}
                onChange={(event) => setWhen(event.target.value)}
              />
            </div>
            <div className="wac-field" style={{ flex: "1 1 45%" }}>
              <label htmlFor="wac-sched-tz">{t("时区")}</label>
              <select
                id="wac-sched-tz"
                value={tz}
                style={inputStyle}
                onChange={(event) => switchTz(event.target.value)}>
                {TZ_OPTIONS.map((tzOpt) => (
                  <option key={tzOpt.tz} value={tzOpt.tz}>
                    {t(tzOpt.label)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              lineHeight: 1.6,
              color: dark ? "#8696a0" : "#667781",
              background: dark ? "rgba(134,150,160,0.12)" : "rgba(134,150,160,0.08)",
              borderRadius: 6,
              padding: "8px 10px"
            }}>
            {t("⚠️ 防风控提示：不要给多个客户设置完全相同的发送时间，同一时刻批量 群发式定时容易触发 WhatsApp 的机器人风控。建议不同客户彼此错开 几分钟以上；插件在发送时刻会自动再加 5–45 秒随机延迟错峰。个别 粉丝少量使用没问题。需保持 WhatsApp 页面在电脑上打开（关闭后到点 会自动重试，页面重新打开即补发）。")}
          </div>

          {sorted.length > 0 && (
            <div className="wac-field">
              <label>{tf("全部定时任务（{n}）", { n: sorted.length })}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sorted.map((job) => (
                  <div
                    key={job.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid rgba(134,150,160,.35)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 12
                    }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                        title={job.originText ?? job.text}>
                        {job.mediaType === "image" ? "🖼 " : job.mediaType === "video" ? "🎬 " : ""}
                        {job.text || job.mediaName || t("（无内容）")}
                        {job.originText && job.sendLang
                          ? tf("（{lang}译文）", { lang: languageLabel(job.sendLang) })
                          : ""}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>
                        {job.chatName} · {formatInTz(job.sendAt, job.tz)}
                        {job.tz !== "Asia/Shanghai" &&
                          tf("（北京 {time}）", { time: formatInTz(job.sendAt, "Asia/Shanghai") })}
                        {" · "}
                        {t(STATUS_TEXT[job.status])}
                        {job.status === "failed" && job.error ? `：${job.error}` : ""}
                        {job.status === "pending" && job.retries
                          ? tf("（已重试 {n} 次）", { n: job.retries })
                          : ""}
                      </div>
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(job)}
                      title={t("删除该定时任务")}
                      style={{
                        flex: "0 0 auto",
                        font: "inherit",
                        fontSize: 11,
                        border: "1px solid rgba(234,0,56,.4)",
                        color: "#ea0038",
                        background: "transparent",
                        borderRadius: 6,
                        padding: "3px 8px",
                        cursor: "pointer"
                      }}>
                      {t("删除")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="wac-foot">
          <span style={{ fontSize: 11.5, color: noteError ? "#ea0038" : "#667781" }}>
            {note}
          </span>
          <span className="wac-spacer" />
          <button type="button" onClick={onClose}>
            {t("关闭")}
          </button>
          <button
            type="button"
            className="wac-primary"
            disabled={busy}
            onClick={() => void submit()}>
            {busy ? t("保存中…") : t("创建定时")}
          </button>
        </div>
      </div>
    </div>
  )
}
