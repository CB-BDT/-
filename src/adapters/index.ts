import { domAdapter } from "./dom"
import { createWajsAdapter, type WajsApi } from "./wajs"

import type { WppAdapter } from "./types"

let active: WppAdapter = domAdapter

export function getAdapter(): WppAdapter {
  return active
}

export function upgradeToWajs(api: WajsApi): boolean {
  const adapter = createWajsAdapter(api)
  if (!adapter) return false
  active = adapter
  return true
}

export type { MsgNode, WppAdapter } from "./types"
