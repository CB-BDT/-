import { extractVisibleText, findBadgeHost, findRow } from "./observer"
import { SEL, queryAll, queryFirst, queryFirstIn } from "./selectors"

function countOf(selectors: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const selector of selectors) {
    try {
      out[selector] = document.querySelectorAll(selector).length
    } catch {
      out[selector] = -1
    }
  }
  return out
}

function snippet(el: HTMLElement | null, max = 1200): string | null {
  if (!el) return null
  const html = el.outerHTML.replace(/\s+/g, " ")
  return html.length > max ? `${html.slice(0, max)}…` : html
}

export interface DiagReport {
  url: string
  chat: {
    mainFound: boolean
    headerTitle: string | null
    footerFound: boolean
    composerFound: boolean
    composerEditable: boolean
    composerDataId: string | null
  }
  messages: {
    textHostCounts: Record<string, number>
    rowCounts: Record<string, number>
    prePlainCount: number
    messageInCount: number
    messageOutCount: number
    scannedCount: number
    incomingCount: number
    firstRowDataId: string | null
    firstRowBadgeHost: string | null
    firstRowText: string | null
    firstRowHtml: string | null
  }
  chatList: {
    rowCounts: Record<string, number>
    firstRowName: string | null
    firstRowDataId: string | null
    firstRowHtml: string | null
  }
}

export function collectDiagnostics(): DiagReport {
  const composer = queryFirst(SEL.composer)
  const headerTitleEl = queryFirst(SEL.headerTitle)

  const messageRows = queryAll(SEL.messageRow)
  const firstRow = messageRows[0] ?? null
  const firstTextHost = firstRow ? queryFirstIn(firstRow, SEL.messageText) : null

  const listRows = queryAll(SEL.chatListItem)
  const firstListRow = listRows[0] ?? null
  const firstNameEl = firstListRow ? queryFirstIn(firstListRow, SEL.listItemName) : null

  return {
    url: location.href,
    chat: {
      mainFound: Boolean(queryFirst(SEL.main)),
      headerTitle: headerTitleEl?.getAttribute("title") ?? headerTitleEl?.textContent ?? null,
      footerFound: Boolean(queryFirst(SEL.footer)),
      composerFound: Boolean(composer),
      composerEditable:
        composer !== null &&
        (composer.isContentEditable ||
          composer.getAttribute("contenteditable") === "true"),
      composerDataId: composer?.getAttribute("data-testid") ?? null
    },
    messages: {
      textHostCounts: countOf(SEL.messageText),
      rowCounts: countOf(SEL.messageRow),
      prePlainCount: document.querySelectorAll("[data-pre-plain-text]").length,
      messageInCount: document.querySelectorAll(".message-in").length,
      messageOutCount: document.querySelectorAll(".message-out").length,
      scannedCount: 0,
      incomingCount: 0,
      firstRowDataId: firstRow?.getAttribute("data-id") ?? null,
      firstRowBadgeHost: firstRow
        ? (findBadgeHost(firstRow).getAttribute("data-testid") ??
          findBadgeHost(firstRow).className ??
          "row")
        : null,
      firstRowText: firstTextHost ? extractVisibleText(firstTextHost).trim().slice(0, 200) : null,
      firstRowHtml: snippet(firstRow ? findRow(firstTextHost ?? firstRow) : null)
    },
    chatList: {
      rowCounts: countOf(SEL.chatListItem),
      firstRowName: firstNameEl?.getAttribute("title") ?? firstNameEl?.textContent ?? null,
      firstRowDataId: firstListRow?.getAttribute("data-id") ?? null,
      firstRowHtml: snippet(firstListRow, 900)
    }
  }
}

export function fillScanStats(report: DiagReport, scanned: number, incoming: number) {
  report.messages.scannedCount = scanned
  report.messages.incomingCount = incoming
  return report
}
