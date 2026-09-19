import { t } from "./i18n"

/**
 * 定时消息媒体附件仓库（IndexedDB 存 Blob）。
 *
 * 为什么不用 chrome.storage.local：其配额约 10MB，且 base64 字符串
 * 膨胀 33%，一张高清图或短视频就放不下；IndexedDB 原生存 Blob，
 * 无此限制，读取也不经过扩展消息通道。
 */
/**
 * 独立数据库名：绝不能和翻译缓存共用。
 *
 * 翻译缓存（bg/cache.ts）与这里原本都叫 "wa-copilot" 且版本号同为 1，
 * 而各自只在 aufgradeneeded 里创建自己的 store。IndexedDB 的升级回调
 * 只在「库不存在」或「版本变大」时触发，所以先打开的一方建好自己的
 * store 后，另一方的 store 永远不会被创建，其事务随即抛
 * NotFoundError —— 表现就是翻译全部失败 / 媒体写入失败。
 * 各自用独立库名，从结构上消除这个冲突。
 */
const DB_NAME = "wa-copilot-media"
const STORE = "schedule-media"
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error(t("IndexedDB 打开失败")))
    }
  })
  return dbPromise
}

/** 存入附件，返回引用 id（写入 ScheduleJob.mediaId）。 */
export async function putScheduleMedia(blob: Blob): Promise<string> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put({ id, blob })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error(t("媒体写入失败")))
  })
  return id
}

/** 按 id 取附件（不存在返回 null）。 */
export async function getScheduleMedia(id: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    const rec = await new Promise<{ id: string; blob: Blob } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly")
        const req = tx.objectStore(STORE).get(id)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error(t("媒体读取失败")))
      }
    )
    return rec?.blob ?? null
  } catch {
    return null
  }
}

/** 删除任务时清理附件（失败静默，孤儿记录不阻塞主流程）。 */
export async function deleteScheduleMedia(id: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error(t("媒体删除失败")))
    })
  } catch {
    /* ignore */
  }
}
