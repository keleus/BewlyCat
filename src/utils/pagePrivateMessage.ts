import {
  PAGE_PRIVATE_MESSAGE_REQUEST,
  PAGE_PRIVATE_MESSAGE_RESPONSE,
} from '~/constants/api'

interface PagePrivateMessageResponse {
  id: string
  response?: unknown
  error?: string
}

interface MarkSessionReadParams {
  talkerId: number
  sessionType: 1 | 2
  ackSeqno: number
  csrf: string
}

const RESPONSE_TIMEOUT_MS = 20000
let requestSeq = 0

function requestPagePrivateMessage(
  operation: 'getSessions' | 'markSessionRead',
  data: object,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++requestSeq}-${Math.random()}`
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Private-message request timed out'))
    }, RESPONSE_TIMEOUT_MS)

    function cleanup() {
      window.clearTimeout(timer)
      window.removeEventListener('message', handleMessage)
    }

    function handleMessage(event: MessageEvent) {
      if (event.source !== window)
        return

      const { type, data: responseData } = event.data || {}
      if (type !== PAGE_PRIVATE_MESSAGE_RESPONSE || responseData?.id !== id)
        return

      cleanup()

      const response = responseData as PagePrivateMessageResponse
      if (response.error) {
        reject(new Error(response.error))
        return
      }

      resolve(response.response)
    }

    window.addEventListener('message', handleMessage)
    window.postMessage({
      type: PAGE_PRIVATE_MESSAGE_REQUEST,
      data: {
        id,
        operation,
        ...data,
      },
    }, '*')
  })
}

export function getPagePrivateMessageSessions(endTs: string): Promise<any> {
  return requestPagePrivateMessage('getSessions', { endTs })
}

export function markPagePrivateMessageSessionRead(params: MarkSessionReadParams): Promise<any> {
  return requestPagePrivateMessage('markSessionRead', params)
}
