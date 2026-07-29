import { watch } from 'vue'
import { useToast } from 'vue-toastification'

import { i18n } from '~/utils/i18n'
import { getCSRF, isNotificationPage } from '~/utils/main'
import {
  getPagePrivateMessageSessions,
  markPagePrivateMessageSessionRead,
} from '~/utils/pagePrivateMessage'

import { scheduleNotificationStateInvalidation } from './notificationStateInvalidation'

interface BilibiliApiResponse<T = unknown> {
  code: number
  message?: string
  msg?: string
  data?: T
}

interface PrivateMessageSession {
  talker_id?: number | string
  session_type?: number | string
  unread_count?: number | string
  max_seqno?: number | string
  session_ts?: number | string
  last_msg?: {
    msg_seqno?: number | string
  } | null
}

interface PrivateMessageSessionData {
  session_list?: PrivateMessageSession[] | null
  has_more?: number
}

interface UnreadSession {
  talkerId: number
  sessionType: 1 | 2
  ackSeqno: number
}

const HEADER_SELECTORS = [
  '[class*="_IM_"] > [class*="_Sidebar_"] > [class*="_SidebarHeader_"]',
  '.space-right .space-right-bottom .bili-im .left .title',
  '.bili-im .left .title',
]
const MAX_SESSION_PAGES = 100
const MARK_READ_CONCURRENCY = 5
const SESSION_PAGE_INTERVAL_MS = 80

let initialized = false
let injectionScheduled = false
let isMarkingRead = false
let markAllReadControl: HTMLDivElement | null = null
let markAllReadButton: HTMLButtonElement | null = null

function translate(key: string, named?: Record<string, number>): string {
  const path = `notification_mark_all_read.${key}`
  return String(named ? i18n.global.t(path, named) : i18n.global.t(path))
}

function getApiError(response: BilibiliApiResponse): string {
  return response.message || response.msg || `code=${response.code}`
}

function toFiniteNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isWhisperRoute(): boolean {
  return location.hash.startsWith('#/whisper')
}

function findSessionListHeader(): HTMLElement | null {
  for (const selector of HEADER_SELECTORS) {
    const header = document.querySelector<HTMLElement>(selector)
    if (header)
      return header
  }

  return null
}

function isInsideFoldedSessionGroup(header: HTMLElement): boolean {
  return Boolean(header.querySelector('[class*="_SidebarTitleIsBtn_"]'))
}

function refreshNativeSessionList() {
  const header = findSessionListHeader()
  const title = header?.querySelector<HTMLElement>(
    '[class*="_SidebarTitle_"], [class*="_SidebarTitleIsBtn_"]',
  )
  // B 站消息中心将清理缓存并重载会话列表的入口放在侧栏标题的 Alt+点击事件中。
  title?.dispatchEvent(new MouseEvent('click', {
    altKey: true,
    bubbles: true,
  }))
}

function updateButtonLabel() {
  if (!markAllReadButton)
    return

  const label = translate(isMarkingRead ? 'processing' : 'action')
  markAllReadButton.textContent = label
  markAllReadButton.title = translate('description')
  markAllReadButton.setAttribute('aria-label', translate('description'))
}

function setButtonBusy(busy: boolean) {
  isMarkingRead = busy
  if (!markAllReadButton)
    return

  markAllReadButton.disabled = busy
  markAllReadButton.setAttribute('aria-busy', String(busy))
  updateButtonLabel()
}

function createMarkAllReadControl(): HTMLDivElement {
  const control = document.createElement('div')
  control.className = 'bew-segment-control bew-segment-control--static bewly-notification-mark-all-read-control'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bew-segment-control__item bewly-notification-mark-all-read'
  button.dataset.segmentItem = ''
  button.addEventListener('click', () => {
    void markAllPrivateMessagesRead()
  })
  control.appendChild(button)
  markAllReadControl = control
  markAllReadButton = button
  updateButtonLabel()
  return control
}

function injectMarkAllReadButton() {
  if (!isWhisperRoute()) {
    markAllReadControl?.remove()
    return
  }

  const header = findSessionListHeader()
  if (!header || isInsideFoldedSessionGroup(header)) {
    markAllReadControl?.remove()
    return
  }

  const existingControl = document.querySelector<HTMLDivElement>('.bewly-notification-mark-all-read-control')
  if (existingControl) {
    markAllReadControl = existingControl
    markAllReadButton = existingControl.querySelector<HTMLButtonElement>('.bewly-notification-mark-all-read')
    if (existingControl.parentElement !== header)
      header.appendChild(existingControl)
    updateButtonLabel()
    return
  }

  header.appendChild(markAllReadControl ?? createMarkAllReadControl())
}

function scheduleButtonInjection() {
  if (injectionScheduled)
    return

  injectionScheduled = true
  requestAnimationFrame(() => {
    injectionScheduled = false
    injectMarkAllReadButton()
  })
}

async function getUnreadSessions(): Promise<UnreadSession[]> {
  const unreadSessions = new Map<string, UnreadSession>()
  let endTs = ''

  for (let page = 0; page < MAX_SESSION_PAGES; page += 1) {
    const response = await getPagePrivateMessageSessions(endTs) as BilibiliApiResponse<PrivateMessageSessionData>

    if (response.code !== 0)
      throw new Error(getApiError(response))

    const sessionList = response.data?.session_list ?? []
    for (const session of sessionList) {
      const talkerId = toFiniteNumber(session.talker_id)
      const sessionType = toFiniteNumber(session.session_type)
      const unreadCount = toFiniteNumber(session.unread_count) ?? 0
      const ackSeqno = toFiniteNumber(session.max_seqno ?? session.last_msg?.msg_seqno)

      if (
        talkerId === null
        || ackSeqno === null
        || unreadCount <= 0
        || (sessionType !== 1 && sessionType !== 2)
      ) {
        continue
      }

      unreadSessions.set(`${sessionType}:${talkerId}`, {
        talkerId,
        sessionType,
        ackSeqno,
      })
    }

    if (response.data?.has_more !== 1 || sessionList.length === 0)
      break

    const nextEndTs = String(sessionList.at(-1)?.session_ts ?? '')
    if (!nextEndTs || nextEndTs === endTs)
      break
    endTs = nextEndTs
    await new Promise(resolve => window.setTimeout(resolve, SESSION_PAGE_INTERVAL_MS))
  }

  return Array.from(unreadSessions.values())
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = []
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1

      try {
        await task(items[index])
        results[index] = { status: 'fulfilled', value: undefined }
      }
      catch (error) {
        results[index] = { status: 'rejected', reason: error }
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

async function markAllPrivateMessagesRead() {
  if (isMarkingRead)
    return

  const toast = useToast()
  const csrf = getCSRF()
  if (!csrf) {
    toast.error(translate('login_required'))
    return
  }

  setButtonBusy(true)

  try {
    const unreadSessions = await getUnreadSessions()
    if (unreadSessions.length === 0) {
      toast.info(translate('no_unread'))
      return
    }

    const results = await runWithConcurrency(
      unreadSessions,
      MARK_READ_CONCURRENCY,
      async (session) => {
        const response = await markPagePrivateMessageSessionRead({
          talkerId: session.talkerId,
          sessionType: session.sessionType,
          ackSeqno: session.ackSeqno,
          csrf,
        }) as BilibiliApiResponse

        if (response.code !== 0)
          throw new Error(getApiError(response))
      },
    )

    const failedResults = results.filter(result => result.status === 'rejected')
    const failedCount = failedResults.length
    const successCount = results.length - failedCount

    if (successCount > 0) {
      scheduleNotificationStateInvalidation(0)
      refreshNativeSessionList()
    }

    if (failedCount === 0) {
      toast.success(translate('success', { count: successCount }))
    }
    else if (successCount > 0) {
      console.warn('[BewlyCat] 部分私信会话标记已读失败', failedResults)
      toast.warning(translate('partial', { success: successCount, failed: failedCount }))
    }
    else {
      throw failedResults[0]?.reason ?? new Error(translate('failed'))
    }
  }
  catch (error) {
    console.error('[BewlyCat] 标记全部私信已读失败', error)
    const detail = error instanceof Error ? error.message : String(error)
    toast.error(`${translate('failed')}: ${detail}`)
  }
  finally {
    setButtonBusy(false)
  }
}

export function setupNotificationMarkAllRead() {
  if (initialized || !isNotificationPage())
    return

  initialized = true
  const observer = new MutationObserver(scheduleButtonInjection)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  window.addEventListener('hashchange', scheduleButtonInjection)
  watch(() => i18n.global.locale.value, updateButtonLabel)
  scheduleButtonInjection()
}
