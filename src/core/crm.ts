import { tf } from "./i18n"
import { getAllByPrefix, removeItem, setItem } from "./storage"

export interface ContactRecord {
  name?: string
  job?: string
  interests?: string
  birthday?: string
  note?: string
  /** 单独为该联系人指定的发送目标语言；留空则按手机号归属国自动判定 */
  targetLang?: string
  updatedAt: number
}

const PREFIX = "crm:"

let cache: Map<string, ContactRecord> | null = null
const listeners = new Set<() => void>()

export function nameKey(name: string): string {
  return `name:${name.trim().toLowerCase()}`
}

export async function loadCrm(): Promise<void> {
  const all = await getAllByPrefix<ContactRecord>(PREFIX)
  const map = new Map<string, ContactRecord>()
  for (const [key, value] of Object.entries(all)) {
    map.set(key.slice(PREFIX.length), value)
  }
  cache = map
}

export function getByKey(key: string): ContactRecord | undefined {
  return cache?.get(key)
}

/**
 * 优先按 chatId 命中；没有 id（列表行拿不到号码）时退回按显示名命中。
 */
export function lookup(
  id: string | null,
  name: string | null
): { key: string; record: ContactRecord } | null {
  if (!cache) return null

  if (id) {
    const byId = cache.get(id)
    if (byId) return { key: id, record: byId }
  }

  if (name) {
    const key = nameKey(name)
    const byName = cache.get(key)
    if (byName) return { key, record: byName }
  }

  return null
}

export function resolveKey(id: string | null, name: string | null): string | null {
  if (id) return id
  if (name) return nameKey(name)
  return null
}

export async function saveRecord(key: string, record: ContactRecord): Promise<void> {
  const next: ContactRecord = { ...record, updatedAt: Date.now() }
  await setItem(PREFIX + key, next)
  if (!cache) cache = new Map()
  cache.set(key, next)
  emit()
}

export async function deleteRecord(key: string): Promise<void> {
  await removeItem(PREFIX + key)
  cache?.delete(key)
  emit()
}

/**
 * 列表行只能按显示名建档，等真正打开会话拿到 chatId 后，
 * 把名字键迁移到 id 键，避免同一客户出现两条记录。
 */
export async function migrateNameKey(id: string, name: string | null): Promise<void> {
  if (!cache || !name) return
  const from = nameKey(name)
  if (from === id) return
  const record = cache.get(from)
  if (!record || cache.has(id)) return

  await deleteRecord(from)
  await saveRecord(id, record)
}

/** 拼客户资料摘要（会话列表/聊天顶栏展示用）。
 *  note 是 textarea 多行输入，必须压成单行，否则会把单行胶囊撑爆。 */
export function buildLabel(record: ContactRecord): string {
  const parts: string[] = []
  if (record.name) parts.push(record.name)
  if (record.job) parts.push(record.job)
  if (record.interests) parts.push(record.interests)
  if (record.birthday) parts.push(tf("{date}生日", { date: record.birthday }))
  const note = record.note?.replace(/\s+/g, " ").trim()
  if (note) parts.push(note)
  return parts.join(" | ")
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function emit() {
  for (const fn of Array.from(listeners)) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}
