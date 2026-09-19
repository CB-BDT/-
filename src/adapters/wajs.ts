import type { MsgNode, WppAdapter } from "./types"

export interface WajsChat {
  id?: { _serialized?: string; user?: string; server?: string }
  contact?: { phoneNumber?: string; number?: string; name?: string; pushname?: string }
}

export interface WajsApi {
  isReady?: boolean
  chat?: { getActiveChat?: () => WajsChat | null | undefined }
  contact?: { get?: (id: string) => { phoneNumber?: string; number?: string } | undefined }
}

export function createWajsAdapter(api: WajsApi): WppAdapter | null {
  if (!api?.isReady || !api.chat?.getActiveChat) return null

  const activeChat = (): WajsChat | null => {
    try {
      return api.chat?.getActiveChat?.() ?? null
    } catch {
      return null
    }
  }

  return {
    kind: "wajs",

    getActiveChatId(): string | null {
      const chat = activeChat()
      const serialized = chat?.id?._serialized
      if (serialized) return serialized
      const user = chat?.id?.user
      const server = chat?.id?.server
      return user && server ? `${user}@${server}` : null
    },

    getActiveChatName(): string | null {
      const chat = activeChat()
      return chat?.contact?.name ?? chat?.contact?.pushname ?? null
    },

    getActivePhone(): string | null {
      const chat = activeChat()
      const raw =
        chat?.contact?.phoneNumber ?? chat?.contact?.number ?? chat?.id?.user ?? null
      if (!raw) return null
      return raw.startsWith("+") ? raw : `+${raw}`
    },

    onIncomingMessage(_cb: (m: MsgNode) => void): () => void {
      return () => {}
    }
  }
}
