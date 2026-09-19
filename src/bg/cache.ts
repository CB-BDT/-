/**
 * 独立库名：必须与内容脚本侧的任何 IndexedDB 完全隔离。
 *
 * MV3 架构下，Service Worker（后台）与内容脚本（页面）是不同上下文，
 * 各自持有独立的 IndexedDB 连接。若共用同库名，升级版本号时 SW 的
 * indexedDB.open 会等所有旧连接关闭——但页面一直开着，连接永远不关，
 * openDb 永久挂起 → 所有翻译请求无响应 → UI 卡在「加载中」。
 *
 * 用独立库名从结构上消除跨上下文锁问题。
 */
const DB_NAME = "wa-copilot-cache"
const DB_VERSION = 1
const STORE = "translations"

export interface CacheEntry {
  text: string
  ts: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => {
      const db = req.result
      // MV3 service worker 随时可能被回收、同源其他页面可能升级 DB 版本，
      // 此时浏览器会强制关闭当前连接。若 dbPromise 仍指向这条已关闭的连接，
      // 后续所有事务都会静默抛错。这里把缓存句柄作废，让下一次请求重新 open。
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      db.onclose = () => {
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })

  return dbPromise
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = fn(transaction.objectStore(STORE))
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () => reject(request.error)
      })
  )
}

export async function hashKey(...parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("\u0000"))
  const digest = await crypto.subtle.digest("SHA-1", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * 缓存读写一律不抛错。缓存只是性能优化，任何 IndexedDB 异常（库结构被
 * 破坏、连接失效等）都只应退化为"没命中缓存"，绝不能把异常抛进翻译链路
 * ——否则缓存一坏，全部翻译跟着报「翻译失败」。
 */
export async function cacheGet(key: string): Promise<CacheEntry | undefined> {
  try {
    return await tx<CacheEntry | undefined>("readonly", (s) => s.get(key))
  } catch {
    return undefined
  }
}

export async function cacheSet(key: string, entry: CacheEntry): Promise<void> {
  try {
    await tx<void>("readwrite", (s) => s.put(entry, key))
  } catch {
    /* 写缓存失败忽略即可 */
  }
}

export async function cacheClear(): Promise<void> {
  try {
    await tx<void>("readwrite", (s) => s.clear())
  } catch {
    /* ignore */
  }
}

/**
 * 清掉已过期（超过 maxAgeMs）的缓存条目，防止 IndexedDB 无限增长。
 * 启动时调用一次即可，顺带修复"连接被浏览器关闭"后的句柄失效。
 */
export async function cachePrune(maxAgeMs: number): Promise<number> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return 0
  }

  return new Promise<number>((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).openCursor()
    let removed = 0
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve(removed)
        return
      }
      const entry = cursor.value as CacheEntry
      if (entry && Date.now() - entry.ts > maxAgeMs) {
        cursor.delete()
        removed += 1
      }
      // 无论删没删都要显式继续遍历：cursor.delete() 不会让游标自动前进，
      // 原实现漏了这一步，删掉第一条过期缓存后遍历就停了（清理不完整）。
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}
