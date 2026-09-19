const NS = "wac:"

/** 设置项在 chrome.storage.local 里的完整键名，供 onChanged 监听精确过滤 */
export const SETTINGS_STORAGE_KEY = NS + "settings"

export async function getItem<T>(key: string): Promise<T | undefined> {
  const k = NS + key
  const res = await chrome.storage.local.get(k)
  return res[k] as T | undefined
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [NS + key]: value })
}

export async function removeItem(key: string): Promise<void> {
  await chrome.storage.local.remove(NS + key)
}

export async function getAllByPrefix<T>(prefix: string): Promise<Record<string, T>> {
  const full = NS + prefix
  const all = await chrome.storage.local.get(null)
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(full)) out[k.slice(NS.length)] = v as T
  }
  return out
}
