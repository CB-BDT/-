export interface MsgNode {
  id: string
  el: HTMLElement
  incoming: boolean
}

export interface WppAdapter {
  readonly kind: "dom" | "wajs"
  getActiveChatId(): string | null
  getActiveChatName(): string | null
  getActivePhone(): string | null
  onIncomingMessage(cb: (m: MsgNode) => void): () => void
}
