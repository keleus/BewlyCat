import { PAGE_NO_COOKIE_SEARCH_REQUEST, PAGE_NO_COOKIE_SEARCH_RESPONSE } from '~/constants/api'
import type { SearchApiMethod } from '~/constants/searchApi'
import { SEARCH_API_DEFINITIONS } from '~/constants/searchApi'

interface PageSearchResponse {
  id: string
  ok?: boolean
  status?: number
  response?: unknown
  error?: string
}

const RESPONSE_TIMEOUT_MS = 15000
let requestSeq = 0

export function isPageNoCookieSearchMethod(method: string): method is SearchApiMethod {
  return method in SEARCH_API_DEFINITIONS
}

export function requestPageNoCookieSearch(method: SearchApiMethod, options?: Record<string, unknown>): Promise<any> {
  const url = buildSearchUrl(method, options)
  return requestPageFetch(url)
}

function buildSearchUrl(method: SearchApiMethod, options: Record<string, unknown> = {}) {
  const definition = SEARCH_API_DEFINITIONS[method]
  const params: Record<string, unknown> = {
    ...definition.params,
    ...options,
  }

  const urlParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '')
      urlParams.append(key, String(value))
  })

  const query = urlParams.toString()
  return query ? `${definition.url}?${query}` : definition.url
}

function requestPageFetch(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++requestSeq}-${Math.random()}`
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Page no-cookie search request timed out'))
    }, RESPONSE_TIMEOUT_MS)

    function cleanup() {
      window.clearTimeout(timer)
      window.removeEventListener('message', handleMessage)
    }

    function handleMessage(event: MessageEvent) {
      if (event.source !== window)
        return

      const { type, data } = event.data || {}
      if (type !== PAGE_NO_COOKIE_SEARCH_RESPONSE || data?.id !== id)
        return

      cleanup()

      const response = data as PageSearchResponse
      if (response.error) {
        reject(new Error(response.error))
        return
      }

      resolve(response.response)
    }

    window.addEventListener('message', handleMessage)
    window.postMessage({
      type: PAGE_NO_COOKIE_SEARCH_REQUEST,
      data: { id, url },
    }, '*')
  })
}
