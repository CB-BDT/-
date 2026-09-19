import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import type { ComposerApi } from "~core/composer"
import {
  type ChatHistoryMsg,
  formatTranscript,
  streamSummary
} from "~core/aiSummary"
import { t, tf } from "~core/i18n"
import {
  type ReplyGroup,
  type TemplateItem,
  addItem,
  createGroup,
  deleteGroup,
  deleteItem,
  loadQuickReply,
  moveItem,
  saveQuickReply,
  updateGroupName,
  updateItem
} from "~core/quickReply"

import { BrandLogo } from "./BrandLogo"

export interface QuickReplyPanelProps {
  api: ComposerApi
  dark: boolean
  collapsed: boolean
  onToggle: () => void
  wppReady: boolean
  /** 拉取当前活跃聊天的聊天记录（经 WPP 本地 Store；summary 需要全量） */
  onFetchHistory: () => Promise<ChatHistoryMsg[]>
  /** 将总结结果追加保存到当前客户的 CRM 备注 */
  onSaveSummary: (summary: string) => Promise<void>
  /** 地名→经纬度后生成缩略图预览（不发送），返回 dataURL 供确认弹层展示 */
  onPreviewLocation: (lat: number, lng: number) => Promise<string | null>
  /** 确认发送纯地图位置（不带文字），thumbnail 为预览时生成的缩略图 base64 */
  onSendLocation: (lat: number, lng: number, thumbnail?: string) => Promise<void>
  /** 拖拽面板左缘手柄调宽：x 为鼠标视口横坐标，done=true 表示松手（持久化） */
  onResizeWidth?: (x: number, done: boolean) => void
}

const DEFAULT_SUMMARY_PROMPT =
  "请总结该客户的核心需求、意向等级（高/中/低）、待跟进事项，并给出下一步跟进建议。"

/** 极简安全 Markdown 渲染（不使用 innerHTML，防 XSS / CSP）：
 *  支持 #/##/### 标题、- / * / • 无序列表、数字有序列表、**加粗**、空行。 */
function renderInline(text: string, keyBase: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyBase}-b${i}`}>{part.slice(2, -2)}</strong>
    }
    return <span key={`${keyBase}-t${i}`}>{part}</span>
  })
}

function renderMarkdown(md: string): ReactNode[] {
  return md.split("\n").map((rawLine, i) => {
    const line = rawLine.trim()
    const key = `md-${i}`
    if (!line) return <div key={key} style={{ height: 6 }} />
    if (/^#{1,3}\s+/.test(line)) {
      return <div key={key} className="qr-sum-md-h">{renderInline(line.replace(/^#{1,3}\s+/, ""), key)}</div>
    }
    if (/^[-*•]\s+/.test(line)) {
      return (
        <div key={key} className="qr-sum-md-li">
          {"• "}
          {renderInline(line.replace(/^[-*•]\s+/, ""), key)}
        </div>
      )
    }
    if (/^\d+\.\s+/.test(line)) {
      const m = line.match(/^(\d+\.)\s+(.*)$/)
      return <div key={key} className="qr-sum-md-li">{m ? `${m[1]} ` : ""}{m ? renderInline(m[2], key) : line}</div>
    }
    return <div key={key} className="qr-sum-md-p">{renderInline(line, key)}</div>
  })
}

interface EditState {
  type: "item" | "group" | null
  groupId: string | null
  itemId: string | null
  title: string
  content: string
}

const EMPTY_EDIT: EditState = {
  type: null, groupId: null, itemId: null, title: "", content: ""
}

export function QuickReplyPanel({ api, dark, collapsed, onToggle, wppReady, onFetchHistory, onSaveSummary, onPreviewLocation, onSendLocation, onResizeWidth }: QuickReplyPanelProps) {
  const [groups, setGroups] = useState<ReplyGroup[]>([])
  const [activeGroup, setActiveGroup] = useState(0)
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT)
  const [inserted, setInserted] = useState<string | null>(null)
  /** 刚点过的话术卡片 id：用于播放 ✓ 成功微动画（纯展示，不影响插入逻辑） */
  const [doneId, setDoneId] = useState<string | null>(null)
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showLoc, setShowLoc] = useState(false)
  const [locQuery, setLocQuery] = useState("")
  const [locStatus, setLocStatusText] = useState<string | null>(null)
  /** 状态条是否为错误（决定红色/品牌色）。不能用文案前缀判断：
   *  英文界面下文案已本地化，中文前缀匹配会失效。 */
  const [locError, setLocError] = useState(false)
  const setLocStatus = useCallback((msg: string | null, isError = false) => {
    setLocStatusText(msg)
    setLocError(isError)
  }, [])
  // 两步发送：先找到位置生成预览，确认后才真正发送
  const [locPreview, setLocPreview] = useState<{ lat: number; lng: number; thumb: string } | null>(null)
  const dragIdx = useRef<number | null>(null)
  // 左缘手柄拖拽调宽进行中（仅用于手柄高亮态）
  const [draggingW, setDraggingW] = useState(false)

  /** 左缘手柄拖拽调宽：监听挂 document（鼠标可能移出面板/Shadow DOM），
   *  拖拽期间锁 body 光标并禁选文本，松手回调 done=true 触发持久化。 */
  const startResize = (e: React.MouseEvent) => {
    if (!onResizeWidth || e.button !== 0) return
    e.preventDefault()
    setDraggingW(true)
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const onMove = (ev: MouseEvent) => onResizeWidth(ev.clientX, false)
    const onUp = (ev: MouseEvent) => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      setDraggingW(false)
      onResizeWidth(ev.clientX, true)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  // ---- AI 聊天总结 ----
  const [showSummary, setShowSummary] = useState(false)
  const [sumPrompt, setSumPrompt] = useState(() => t(DEFAULT_SUMMARY_PROMPT))
  const [sumBusy, setSumBusy] = useState(false)
  const [sumStatus, setSumStatus] = useState<string | null>(null)
  const [sumError, setSumError] = useState<string | null>(null)
  const [sumResult, setSumResult] = useState("")
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const cancelSummaryRef = useRef<(() => void) | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)

  // 流式输出时结果区自动滚到底
  useEffect(() => {
    const el = resultRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [sumResult])

  // 组件卸载/折叠时中断进行中的流
  useEffect(() => {
    return () => {
      cancelSummaryRef.current?.()
      cancelSummaryRef.current = null
    }
  }, [])

  const handleStartSummary = useCallback(async () => {
    if (sumBusy) return
    setSumBusy(true)
    setSumError(null)
    setSumResult("")
    setCopied(false)
    setSaved(false)
    setSumStatus(t("正在读取该客户聊天记录…"))
    try {
      const msgs: ChatHistoryMsg[] = await onFetchHistory()
      if (!msgs.length) {
        setSumBusy(false)
        setSumStatus(null)
        setSumError(t("当前聊天没有可分析的文本消息（可能全是表情/图片/系统提示）"))
        return
      }
      // 条数 500 / 字符 20000 双上限：条数上限比拉取上限(2000)小是有意的，
      // 真正决定 token 的是字符预算；条数只做二次保险，防止极端短消息刷爆行数
      const { text, count, dropped } = formatTranscript(msgs, 500, 20000)
      setSumStatus(
        dropped > 0
          ? tf("共 {total} 条，取最近 {count} 条分析中…", { total: msgs.length, count })
          : tf("已读取 {count} 条消息，AI 分析中…", { count })
      )
      cancelSummaryRef.current = streamSummary(sumPrompt || DEFAULT_SUMMARY_PROMPT, text, (e) => {
        if (e.type === "chunk") {
          setSumResult((prev) => prev + e.text)
        } else if (e.type === "done") {
          setSumBusy(false)
          setSumStatus(null)
          cancelSummaryRef.current = null
        } else {
          setSumBusy(false)
          setSumStatus(null)
          // 已有部分结果时保留结果，错误信息显示在结果下方
          setSumError(e.error)
          cancelSummaryRef.current = null
        }
      })
    } catch (err) {
      setSumBusy(false)
      setSumStatus(null)
      setSumError(
        err instanceof Error
          ? tf("读取聊天记录失败：{err}（请确认 WPP 已就绪）", { err: err.message })
          : String(err)
      )
    }
  }, [sumBusy, sumPrompt, onFetchHistory])

  const handleStopSummary = useCallback(() => {
    cancelSummaryRef.current?.()
    cancelSummaryRef.current = null
    setSumBusy(false)
    setSumStatus(t("已停止"))
  }, [])

  const handleCopySummary = useCallback(async () => {
    if (!sumResult) return
    try {
      await navigator.clipboard.writeText(sumResult)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch (err) {
      setSumError(
        tf("复制失败：{err}", { err: err instanceof Error ? err.message : String(err) })
      )
    }
  }, [sumResult])

  const handleSaveSummary = useCallback(async () => {
    if (!sumResult) return
    try {
      await onSaveSummary(sumResult)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSumError(
        tf("保存失败：{err}", { err: err instanceof Error ? err.message : String(err) })
      )
    }
  }, [sumResult, onSaveSummary])

  useEffect(() => {
    loadQuickReply().then((g) => {
      setGroups(g)
      if (g.length > 0) setActiveGroup(0)
    })
  }, [])

  const persist = useCallback((next: ReplyGroup[]) => {
    setGroups(next)
    void saveQuickReply(next)
  }, [])

  const current = groups[activeGroup] ?? groups[0] ?? null

  const doInsert = useCallback(async (text: string) => {
    const ok = await api.replace(text)
    setInserted(ok ? t("已填入输入框") : t("填入失败"))
    setTimeout(() => setInserted(null), 1500)
  }, [api])

  /** 点击卡片：先播 ✓ 动画，再走既有插入逻辑（失败也会显示 ✕ 提示） */
  const handlePickItem = useCallback(
    (item: TemplateItem) => {
      setDoneId(item.id)
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current)
      doneTimerRef.current = setTimeout(() => setDoneId(null), 900)
      void doInsert(item.content)
    },
    [doInsert]
  )

  // 卸载时清掉动画定时器，避免对已卸载组件 setState
  useEffect(() => {
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current)
    }
  }, [])

  /** 第一步：地名 → 经纬度（OpenStreetMap Nominatim，免费无需 Key）→ 生成缩略图预览 */
  const handleFindLocation = useCallback(async () => {
    const query = locQuery.trim()
    if (!query) return
    setLocStatus(t("查找中..."))
    setLocPreview(null)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
      const res = await fetch(url, { headers: { Accept: "application/json" } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { lat: string; lon: string }[] = await res.json()
      if (!Array.isArray(data) || data.length === 0) {
        setLocStatus(tf("失败：未找到「{query}」，换个关键词试试", { query }), true)
        return
      }
      const { lat, lon } = data[0]
      setLocStatus(t("生成地图预览中..."))
      const nlat = parseFloat(lat)
      const nlon = parseFloat(lon)
      const thumb = await onPreviewLocation(nlat, nlon)
      if (!thumb) {
        // 缩略图生成失败也允许发送（降级为无缩略图位置）
        setLocStatus(t("预览生成失败，仍可直接发送（不带地图图）"))
        setLocPreview({ lat: nlat, lng: nlon, thumb: "" })
        return
      }
      setLocStatus(tf("已找到「{query}」，请确认后发送", { query }))
      setLocPreview({ lat: nlat, lng: nlon, thumb })
    } catch (err) {
      setLocStatus(
        tf("失败：{err}", { err: err instanceof Error ? err.message : String(err) }),
        true
      )
    }
  }, [locQuery, onPreviewLocation])

  /** 第二步：确认发送（复用预览缩略图，不重新生成） */
  const handleConfirmSend = useCallback(async () => {
    if (!locPreview) return
    setLocStatus(t("发送中..."))
    try {
      await onSendLocation(locPreview.lat, locPreview.lng, locPreview.thumb || undefined)
      setLocStatus(t("已发送"))
      setLocPreview(null)
      setLocQuery("")
    } catch (err) {
      setLocStatus(
        tf("发送失败：{err}", { err: err instanceof Error ? err.message : String(err) }),
        true
      )
    }
  }, [locPreview, onSendLocation])

  const handleAddGroup = () => {
    const g = createGroup(t("新分组"))
    const next = [...groups, g]
    persist(next)
    setActiveGroup(next.length - 1)
    setEdit({ ...EMPTY_EDIT, type: "group", groupId: g.id, title: g.name })
  }

  const handleRenameGroup = (gid: string, name: string) => {
    persist(updateGroupName(groups, gid, name))
  }

  const handleDeleteGroup = (gid: string) => {
    const next = deleteGroup(groups, gid)
    persist(next)
    if (activeGroup >= next.length) setActiveGroup(Math.max(0, next.length - 1))
  }

  const handleAddItem = () => {
    if (!current) return
    persist(addItem(groups, current.id, t("新话术"), ""))
    setEdit({ ...EMPTY_EDIT, type: "item", groupId: current.id, itemId: null, title: t("新话术"), content: "" })
  }

  const handleSaveItem = () => {
    if (!edit.groupId) return
    if (edit.itemId) {
      persist(updateItem(groups, edit.groupId, edit.itemId, { title: edit.title, content: edit.content }))
    } else {
      persist(addItem(groups, edit.groupId, edit.title, edit.content))
    }
    setEdit(EMPTY_EDIT)
  }

  const handleEditItem = (gid: string, item: TemplateItem) => {
    setEdit({ type: "item", groupId: gid, itemId: item.id, title: item.title, content: item.content })
  }

  const handleDeleteItem = (gid: string, itemId: string) => {
    persist(deleteItem(groups, gid, itemId))
  }

  const onDragStart = (idx: number) => { dragIdx.current = idx }
  const onDragOver = (e: React.DragEvent, _idx: number) => { e.preventDefault() }
  const onDrop = (idx: number) => {
    if (dragIdx.current === null || dragIdx.current === idx || !current) return
    persist(moveItem(groups, current.id, dragIdx.current, idx))
    dragIdx.current = null
  }

  if (collapsed) {
    return (
      <div className="qr-collapsed" onClick={onToggle} title={t("展开快捷话术（CB BDT 插件）")}>
        <BrandLogo size={40} />
        {/* 手指点击提示：明确「这里可以点」 */}
        <span className="qr-tap" aria-hidden="true">
          {"\u{1F446}"}
        </span>
      </div>
    )
  }

  return (
    <div className="qr-panel" data-dark={dark}>
      {onResizeWidth && (
        <div
          className="qr-resize"
          data-dragging={draggingW}
          title={t("拖动调整面板宽度")}
          onMouseDown={startResize}
        />
      )}
      <div className="qr-header">
        <BrandLogo size={22} />
        <span className="qr-title">{t("快捷话术")}</span>
        {inserted && <span className="qr-inserted">{inserted}</span>}
        <button className="qr-toggle" onClick={onToggle} title={t("收起")}>{"\u203A"}</button>
      </div>

      <div className="qr-sum-bar">
        <button
          className="qr-sum-toggle"
          onClick={() => setShowSummary((v) => !v)}
          title={t("AI 分析并总结与该客户的全部聊天记录")}
        >
          {"\u2728"} {t("AI 聊天总结")} {showSummary ? "\u25BE" : "\u25B8"}
        </button>
      </div>

      {showSummary && (
        <div className="qr-sum-panel">
          <textarea
            className="qr-sum-prompt"
            value={sumPrompt}
            onChange={(e) => setSumPrompt(e.target.value)}
            placeholder={t("输入分析要求，如：总结核心需求、意向等级、待跟进事项")}
          />
          <div className="qr-sum-controls">
            <span className="qr-sum-status">
              {sumStatus ?? (wppReady ? "" : t("WPP 未就绪，无法读取聊天记录"))}
            </span>
            {sumBusy ? (
              <button className="qr-btn" data-variant="ghost" onClick={handleStopSummary}>
                {t("停止")}
              </button>
            ) : (
              <button
                className="qr-btn"
                data-variant="primary"
                disabled={!wppReady}
                onClick={handleStartSummary}
              >
                {t("开始分析")}
              </button>
            )}
          </div>

          {sumError && <div className="qr-sum-error">⚠ {sumError}</div>}

          {(sumResult || sumBusy) && (
            <div className="qr-sum-result" ref={resultRef}>
              {sumResult ? renderMarkdown(sumResult) : (
                <span style={{ color: "var(--muted)" }}>{t("等待 AI 响应…")}</span>
              )}
              {sumBusy && <span className="qr-cursor">{"▍"}</span>}
            </div>
          )}

          {!sumBusy && sumResult && (
            <div className="qr-sum-actions">
              <button className="qr-btn" data-variant="ghost" onClick={handleCopySummary}>
                {copied ? t("已复制 ✓") : t("复制结果")}
              </button>
              <button className="qr-btn" data-variant="ok" onClick={handleSaveSummary}>
                {saved ? t("已保存 ✓") : t("追加保存至客户备注")}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="qr-tabs">
        {groups.map((g, i) => (
          <span key={g.id} className="qr-tab" data-active={i === activeGroup} onClick={() => setActiveGroup(i)}>
            {g.name}
            <span className="qr-tab-del" title={t("删除分组")} onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id) }}>{"\u2715"}</span>
          </span>
        ))}
        <button className="qr-tab-add" onClick={handleAddGroup}>+ {t("分组")}</button>
      </div>

      {edit.type === "group" && edit.groupId && (
        <div className="qr-form" style={{ margin: 8 }}>
          <input className="qr-input" value={edit.title} autoFocus
            onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && edit.groupId) { handleRenameGroup(edit.groupId, edit.title); setEdit(EMPTY_EDIT) } }}
            placeholder={t("分组名称")} />
          <div className="qr-form-row">
            <button className="qr-btn" data-variant="ghost" onClick={() => setEdit(EMPTY_EDIT)}>{t("取消")}</button>
            <button className="qr-btn" data-variant="primary"
              onClick={() => { if (edit.groupId) { handleRenameGroup(edit.groupId, edit.title); setEdit(EMPTY_EDIT) } }}>{t("保存")}</button>
          </div>
        </div>
      )}

      <div className="qr-list">
        {edit.type === "item" && (
          <div className="qr-form">
            <input className="qr-input" value={edit.title} autoFocus
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              placeholder={t("话术标题（如：打招呼）")} />
            <textarea className="qr-textarea" value={edit.content}
              onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              placeholder={t("话术内容（如：¡Hola! ¿Cómo estás?）")} />
            <div className="qr-form-row">
              <button className="qr-btn" data-variant="ghost" onClick={() => setEdit(EMPTY_EDIT)}>{t("取消")}</button>
              <button className="qr-btn" data-variant="primary" onClick={handleSaveItem} disabled={!edit.title.trim()}>{t("保存")}</button>
            </div>
          </div>
        )}

        {current?.items.map((item, idx) => (
          <div key={item.id} className="qr-item" draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={(e) => onDragOver(e, idx)}
            onDrop={() => onDrop(idx)}
            onClick={() => handlePickItem(item)}>
            <div className="qr-item-head">
              <span className="qr-drag" onClick={(e) => e.stopPropagation()}>{"\u2630"}</span>
              <span className="qr-item-title">{item.title}</span>
              <span className="qr-item-actions">
                <button className="qr-act" data-act="edit" title={t("编辑")}
                  onClick={(e) => { e.stopPropagation(); handleEditItem(current.id, item) }}>{"\u270E"}</button>
                <button className="qr-act" data-act="del" title={t("删除")}
                  onClick={(e) => { e.stopPropagation(); handleDeleteItem(current.id, item.id) }}>{"\u2715"}</button>
              </span>
            </div>
            <div className="qr-item-body">{item.content}</div>
            {doneId === item.id && <span className="qr-item-check">{"\u2713"}</span>}
          </div>
        ))}

        {(!current || current.items.length === 0) && edit.type !== "item" && (
          <div className="qr-empty">
            <div className="qr-empty-icon">{"\u{1F4AC}"}</div>
            <div className="qr-empty-title">{t("还没有话术")}</div>
            <p className="qr-empty-text">
              {t("把常发的问候、报价、物流说明存成话术，点一下即可插入输入框")}
            </p>
            <button className="qr-btn" data-variant="primary" onClick={handleAddItem}>
              + {t("新建第一条话术")}
            </button>
          </div>
        )}
      </div>

      <div className="qr-footer">
        <button className="qr-add-btn" onClick={handleAddItem}>+ {t("新增话术")}</button>
        <button className="qr-add-btn" style={{ marginTop: 4 }} onClick={() => setShowLoc((v) => !v)}>{"\u{1F4CD}"} {t("发送定位")}</button>
        {showLoc && (
          <div className="qr-form" style={{ marginTop: 6 }}>
            {!wppReady && (
              <div style={{ fontSize: 11, color: "#ea0038", marginBottom: 4 }}>
                {t("WPP 未就绪，定位功能不可用。")}
                <br />
                {t("请打开 F12 控制台查看 [wa-copilot] 日志确认原因。")}
              </div>
            )}
            <input
              className="qr-input"
              value={locQuery}
              onChange={(e) => setLocQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !locPreview) void handleFindLocation()
              }}
              placeholder={t("输入地点名（如：北京天安门）")}
            />
            {locStatus && (
              <div style={{ fontSize: 11, color: locError ? "#ea0038" : "var(--accent)" }}>
                {locStatus}
              </div>
            )}
            {locPreview && (
              <div style={{ marginTop: 6, textAlign: "center" }}>
                {locPreview.thumb ? (
                  <img
                    src={locPreview.thumb}
                    alt={t("位置预览")}
                    style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
                  />
                ) : (
                  <div style={{ fontSize: 11, color: "var(--muted)", padding: "8px 0" }}>
                    {locPreview.lat.toFixed(5)}, {locPreview.lng.toFixed(5)}
                  </div>
                )}
              </div>
            )}
            <div className="qr-form-row">
              <button
                className="qr-btn"
                data-variant="ghost"
                onClick={() => { setShowLoc(false); setLocStatus(null); setLocQuery(""); setLocPreview(null) }}
              >{t("取消")}</button>
              {locPreview ? (
                <button
                  className="qr-btn"
                  data-variant="primary"
                  disabled={!wppReady}
                  onClick={handleConfirmSend}
                >{"\u2705"} {t("确认发送")}</button>
              ) : (
                <button
                  className="qr-btn"
                  data-variant="primary"
                  disabled={!wppReady || !locQuery.trim()}
                  onClick={handleFindLocation}
                >{t("查找位置")}</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 品牌条：logo + 用途声明，让「这块是本插件注入的 UI」一眼可辨 */}
      <div className="qr-brand">
        <BrandLogo size={18} />
        <span className="qr-brand-text">
          <span className="qr-brand-name">CB BDT</span> {t("· 技术研究用途，与 WhatsApp / Meta 无关联")}
        </span>
      </div>
    </div>
  )
}
