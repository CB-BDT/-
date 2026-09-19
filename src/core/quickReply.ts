import { t } from "./i18n"
import { getItem, setItem } from "./storage"

export interface TemplateItem {
  id: string
  title: string
  content: string
}

export interface ReplyGroup {
  id: string
  name: string
  items: TemplateItem[]
}

const KEY = "quick_reply"

/** 首次安装时写入的默认话术模板。
 *  必须在函数内部调用 t()：模块顶层求值时界面语言还没加载完，
 *  只会拿到默认中文。 */
function buildDefaultGroups(): ReplyGroup[] {
  return [
    {
      id: "g1",
      name: t("常用话术"),
      items: [
        { id: "t1", title: t("打招呼"), content: "¡Hola! ¿Cómo estás?" },
        { id: "t2", title: t("确认订单"), content: "¿Podría confirmar los detalles de su pedido, por favor?" },
        { id: "t3", title: t("感谢回复"), content: "¡Gracias por su respuesta! Estamos procesando su solicitud." }
      ]
    }
  ]
}

export async function loadQuickReply(): Promise<ReplyGroup[]> {
  const stored = await getItem<ReplyGroup[]>(KEY)
  if (Array.isArray(stored) && stored.length > 0) return stored
  const defaults = buildDefaultGroups()
  await setItem(KEY, defaults)
  return defaults
}

export async function saveQuickReply(groups: ReplyGroup[]): Promise<void> {
  await setItem(KEY, groups)
}

function uid(): string {
  return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function createGroup(name: string): ReplyGroup {
  return { id: uid(), name: name || t("新分组"), items: [] }
}

export function updateGroupName(groups: ReplyGroup[], groupId: string, name: string): ReplyGroup[] {
  return groups.map((g) => (g.id === groupId ? { ...g, name } : g))
}

export function deleteGroup(groups: ReplyGroup[], groupId: string): ReplyGroup[] {
  return groups.filter((g) => g.id !== groupId)
}

export function addItem(groups: ReplyGroup[], groupId: string, title: string, content: string): ReplyGroup[] {
  const item: TemplateItem = { id: uid(), title: title || t("话术"), content }
  return groups.map((g) => (g.id === groupId ? { ...g, items: [...g.items, item] } : g))
}

export function updateItem(groups: ReplyGroup[], groupId: string, itemId: string, patch: Partial<TemplateItem>): ReplyGroup[] {
  return groups.map((g) =>
    g.id === groupId
      ? { ...g, items: g.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
      : g
  )
}

export function deleteItem(groups: ReplyGroup[], groupId: string, itemId: string): ReplyGroup[] {
  return groups.map((g) =>
    g.id === groupId ? { ...g, items: g.items.filter((it) => it.id !== itemId) } : g
  )
}

export function moveItem(groups: ReplyGroup[], groupId: string, fromIdx: number, toIdx: number): ReplyGroup[] {
  return groups.map((g) => {
    if (g.id !== groupId) return g
    const items = [...g.items]
    if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length) return g
    const [moved] = items.splice(fromIdx, 1)
    items.splice(toIdx, 0, moved)
    return { ...g, items }
  })
}
