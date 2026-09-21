import type { TrialQualityPageRequest, WebDashVideoEntry } from './trialQualityProtocol'
import { getStreamDeadline, isPositiveSafeInteger, isTrialQualityPageUrl, isTrialRecord, isWebDashVideoEntry, TRIAL_QUALITY_PAGE_REQUEST, TRIAL_QUALITY_PAGE_RESET, TRIAL_QUALITY_PAGE_RESPONSE, TRIAL_STREAM_DEADLINE_MARGIN_SECONDS } from './trialQualityProtocol'

interface VideoIds { cid: number, aid?: number, bvid?: string }
interface PlayerApi extends VideoIds { kind: 'playurl' | 'v2' }
interface CacheEntry { entries: WebDashVideoEntry[], expiresAt: number }
interface PendingEntry { cid: number, promise: Promise<WebDashVideoEntry[]>, finish: (entries: WebDashVideoEntry[]) => void }
interface XhrState {
  api: PlayerApi | null
  async: boolean
  cancelled: boolean
  sent: boolean
  waiting: boolean
  generation: number
  raw?: unknown
  patched?: unknown
  cacheEntry?: CacheEntry
}

export interface TrialQualityPageHookOptions {
  isEnabled: () => boolean
  settingsReady: Promise<unknown>
}

export interface TrialQualityPageHooks {
  shouldHandleFetch: (input: RequestInfo | URL) => boolean
  handleFetch: (originalFetch: typeof fetch, thisArg: unknown, input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return isPositiveSafeInteger(number) ? number : undefined
}

export function classifyTrialQualityApi(value: string): PlayerApi | null {
  try {
    const url = new URL(value, 'https://www.bilibili.com')
    if (url.origin !== 'https://api.bilibili.com' || url.username || url.password)
      return null
    const match = /^\/x\/player\/(?:wbi\/)?(playurl|v2)$/.exec(url.pathname)
    const cid = positiveNumber(url.searchParams.get('cid'))
    if (!match || !cid)
      return null
    const bvid = url.searchParams.get('bvid') || undefined
    return {
      kind: match[1] as PlayerApi['kind'],
      cid,
      aid: positiveNumber(url.searchParams.get('avid') || url.searchParams.get('aid')),
      bvid: bvid && /^BV[0-9A-Za-z]{10}$/.test(bvid) ? bvid : undefined,
    }
  }
  catch {
    return null
  }
}

function dashData(value: unknown): Record<string, unknown> | null {
  if (!isTrialRecord(value) || (value.code !== undefined && value.code !== 0) || !isTrialRecord(value.data))
    return null
  const data = value.data
  if (data.is_drm || data.drm_tech_type || !isTrialRecord(data.dash) || !Array.isArray(data.dash.video))
    return null
  return data
}

/** 不原地修改原响应，关闭开关与其它脚本继续读取时仍能得到原值。 */
export function mergeTrialPlayurl(value: unknown, entries: WebDashVideoEntry[]): unknown {
  const data = dashData(value)
  if (!data || !entries.length)
    return value
  const dash = data.dash as Record<string, unknown>
  const videos = dash.video as unknown[]
  const existing = new Set(videos.filter(isTrialRecord).map(video => `${video.id}-${video.codecid}`))
  const additions = entries.filter((entry) => {
    const key = `${entry.id}-${entry.codecid}`
    if (existing.has(key))
      return false
    existing.add(key)
    return true
  })
  if (!additions.length)
    return value
  return {
    ...(value as Record<string, unknown>),
    data: { ...data, dash: { ...dash, video: [...structuredClone(additions).sort((a, b) => b.id - a.id), ...videos] } },
  }
}

export function patchTrialVipStatus(value: unknown, hasEntries: boolean): unknown {
  if (!hasEntries || !isTrialRecord(value) || (value.code !== undefined && value.code !== 0)
    || !isTrialRecord(value.data) || !isTrialRecord(value.data.vip) || value.data.vip.status === 1) {
    return value
  }
  return { ...value, data: { ...value.data, vip: { ...value.data.vip, status: 1, type: 2 } } }
}

function waitForEntries(promise: Promise<WebDashVideoEntry[]>, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason || new DOMException('请求已取消', 'AbortError'))
    }
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    if (signal?.aborted) {
      abort()
      return
    }
    timer = setTimeout(finish, 2500)
    signal?.addEventListener('abort', abort, { once: true })
    void promise.then(finish, finish)
  })
}

export function installTrialQualityPageHooks(options: TrialQualityPageHookOptions): TrialQualityPageHooks {
  const cache = new Map<number, CacheEntry>()
  const pendingById = new Map<number, PendingEntry>()
  const pendingByCid = new Map<number, PendingEntry>()
  const xhrStates = new WeakMap<XMLHttpRequest, XhrState>()
  let generation = 0
  let requestSeq = 0
  let initialState: unknown
  let playinfoRaw: unknown
  let playinfoMerged: unknown
  let mergedCache: CacheEntry | undefined
  let lockedUntil = 0

  const active = () => options.isEnabled() && isTrialQualityPageUrl(location.href)
  const getCached = (cid: number) => {
    const value = cache.get(cid)
    if (value && value.expiresAt > Date.now())
      return value
    cache.delete(cid)
    return undefined
  }

  function resolveIds(): VideoIds | null {
    if (!isTrialRecord(initialState))
      return null
    const video = isTrialRecord(initialState.videoData) ? initialState.videoData : {}
    const pageNumber = positiveNumber(initialState.p) || 1
    const page = Array.isArray(video.pages) ? video.pages[pageNumber - 1] : undefined
    const cid = positiveNumber(initialState.cid) || (isTrialRecord(page) ? positiveNumber(page.cid) : undefined)
      || positiveNumber(dashData(playinfoRaw)?.last_play_cid)
    if (!cid)
      return null
    const bvid = initialState.bvid || video.bvid
    return {
      cid,
      aid: positiveNumber(initialState.aid) || positiveNumber(video.aid),
      bvid: typeof bvid === 'string' && /^BV[0-9A-Za-z]{10}$/.test(bvid) ? bvid : undefined,
    }
  }

  function ensureEntries(ids: VideoIds): Promise<WebDashVideoEntry[]> {
    if (!active())
      return Promise.resolve([])
    const cached = getCached(ids.cid)
    if (cached)
      return Promise.resolve(cached.entries)
    const pending = pendingByCid.get(ids.cid)
    if (pending)
      return pending.promise
    if (pendingById.size >= 4)
      return Promise.resolve([])
    const requestId = ++requestSeq
    let finish: PendingEntry['finish'] = () => {}
    const promise = new Promise<WebDashVideoEntry[]>((resolve) => {
      const timer = setTimeout(() => {
        // 短暂缓存失败，避免一个页面上的并行接口反复触发同一失败请求。
        cache.set(ids.cid, { entries: [], expiresAt: Date.now() + 10000 })
        finish([])
      }, 6000)
      finish = (entries) => {
        clearTimeout(timer)
        pendingById.delete(requestId)
        if (pendingByCid.get(ids.cid)?.promise === promise)
          pendingByCid.delete(ids.cid)
        resolve(entries)
      }
    })
    const item = { cid: ids.cid, promise, finish }
    pendingById.set(requestId, item)
    pendingByCid.set(ids.cid, item)
    const request: TrialQualityPageRequest = { requestId, ...ids }
    window.postMessage({ type: TRIAL_QUALITY_PAGE_REQUEST, data: request }, location.origin)
    return promise
  }

  function warmInitialEntries() {
    const ids = resolveIds()
    if (ids && active())
      void ensureEntries(ids)
  }

  function reset() {
    generation++
    cache.clear()
    for (const pending of [...pendingById.values()])
      pending.finish([])
    playinfoMerged = undefined
    mergedCache = undefined
    lockedUntil = 0
  }

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== location.origin || !isTrialRecord(event.data))
      return
    if (event.data.type === TRIAL_QUALITY_PAGE_RESET) {
      reset()
      return
    }
    if (event.data.type !== TRIAL_QUALITY_PAGE_RESPONSE || !isTrialRecord(event.data.data))
      return
    const data = event.data.data
    if (!isPositiveSafeInteger(data.requestId))
      return
    const pending = pendingById.get(data.requestId)
    if (!pending || data.cid !== pending.cid)
      return
    if (!active()) {
      pending.finish([])
      return
    }
    const entries = data.ok === true && Array.isArray(data.entries) && data.entries.length <= 8
      && data.entries.every(isWebDashVideoEntry)
      ? data.entries
      : []
    const deadlines = entries.flatMap(entry => [entry.baseUrl, ...entry.backupUrl]).map(getStreamDeadline).filter((value): value is number => value !== null)
    if (isPositiveSafeInteger(data.deadline))
      deadlines.push(data.deadline)
    const expiresAt = entries.length
      ? Math.min(Date.now() + 30 * 60000, ...deadlines.map(deadline => (deadline - TRIAL_STREAM_DEADLINE_MARGIN_SECONDS) * 1000))
      : Date.now() + 15000
    if (cache.size >= 16)
      cache.delete(cache.keys().next().value!)
    const validEntries = expiresAt > Date.now() ? entries : []
    cache.set(pending.cid, { entries: validEntries, expiresAt })
    pending.finish(validEntries)
  })

  function installAccessor(name: '__INITIAL_STATE__' | '__playinfo__', get: () => unknown, set: (value: unknown) => void) {
    const descriptor = Object.getOwnPropertyDescriptor(window, name)
    // 不覆盖其它扩展的存取器，XHR/fetch 路径仍可工作。
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set))
      return
    if (descriptor)
      set(descriptor.value)
    try {
      Object.defineProperty(window, name, { configurable: true, enumerable: true, get, set })
    }
    catch {
      // 页面不可配置的全局属性保留原样。
    }
  }

  if (isTrialQualityPageUrl(location.href)) {
    installAccessor('__INITIAL_STATE__', () => initialState, (value) => {
      initialState = value
      warmInitialEntries()
      void options.settingsReady.then(warmInitialEntries).catch(() => {})
    })
    installAccessor('__playinfo__', () => {
      if (!active() || !dashData(playinfoRaw))
        return playinfoRaw
      if (lockedUntil > Date.now())
        return undefined
      const ids = resolveIds()
      if (!ids)
        return playinfoRaw
      const ready = getCached(ids.cid)
      if (ready) {
        if (mergedCache !== ready) {
          playinfoMerged = mergeTrialPlayurl(playinfoRaw, ready.entries)
          mergedCache = ready
        }
        return playinfoMerged
      }
      // 固定返回 undefined 一小段时间，确保播放器连续读取时一致地走 playurl。
      lockedUntil = Date.now() + 4000
      void ensureEntries(ids)
      return undefined
    }, (value) => {
      playinfoRaw = value
      playinfoMerged = undefined
      mergedCache = undefined
      lockedUntil = 0
    })
  }

  const prototype = XMLHttpRequest.prototype
  const originalOpen = prototype.open
  const originalSend = prototype.send
  const originalAbort = prototype.abort
  const textDescriptor = Object.getOwnPropertyDescriptor(prototype, 'responseText')
  const responseDescriptor = Object.getOwnPropertyDescriptor(prototype, 'response')

  function patchResponse(xhr: XMLHttpRequest, raw: unknown): unknown {
    const state = xhrStates.get(xhr)
    if (!active() || !state?.api || state.cancelled || state.generation !== generation
      || xhr.readyState !== 4 || xhr.status < 200 || xhr.status >= 300) {
      return raw
    }
    const entry = getCached(state.api.cid)
    if (!entry?.entries.length)
      return raw
    if (state.raw === raw && state.cacheEntry === entry)
      return state.patched
    try {
      const json: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
      const patched = state.api.kind === 'playurl' ? mergeTrialPlayurl(json, entry.entries) : patchTrialVipStatus(json, true)
      state.raw = raw
      state.cacheEntry = entry
      state.patched = patched === json ? raw : typeof raw === 'string' ? JSON.stringify(patched) : patched
      return state.patched
    }
    catch {
      return raw
    }
  }

  // 只在支持的页面安装；关闭开关后包装器直接委托原实现。
  if (isTrialQualityPageUrl(location.href) && textDescriptor?.get && textDescriptor.configurable
    && responseDescriptor?.get && responseDescriptor.configurable) {
    prototype.open = function (method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      const old = xhrStates.get(this)
      if (old)
        old.cancelled = true
      xhrStates.delete(this)
      originalOpen.call(this, method, url, async, username, password)
      xhrStates.set(this, {
        api: method.toUpperCase() === 'GET' ? classifyTrialQualityApi(String(url)) : null,
        async,
        cancelled: false,
        sent: false,
        waiting: false,
        generation,
      })
    }
    prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const state = xhrStates.get(this)
      if (state?.waiting)
        throw new DOMException('请求已经发送', 'InvalidStateError')
      if (!active() || !state?.api || !state.async || this.readyState !== 1)
        return originalSend.call(this, body)
      if (state.sent)
        throw new DOMException('请求已经发送', 'InvalidStateError')
      state.generation = generation
      state.sent = true
      state.waiting = true
      void waitForEntries(ensureEntries(state.api)).then(() => {
        if (state.cancelled || xhrStates.get(this) !== state)
          return
        state.waiting = false
        originalSend.call(this, body)
      }).catch(() => {
        if (state.cancelled || xhrStates.get(this) !== state)
          return
        this.dispatchEvent(new ProgressEvent('error'))
        this.dispatchEvent(new ProgressEvent('loadend'))
      })
    }
    prototype.abort = function () {
      const state = xhrStates.get(this)
      const wasWaiting = state?.waiting && !state.cancelled
      if (state)
        state.cancelled = true
      originalAbort.call(this)
      if (wasWaiting) {
        this.dispatchEvent(new ProgressEvent('abort'))
        this.dispatchEvent(new ProgressEvent('loadend'))
      }
    }
    Object.defineProperty(prototype, 'responseText', {
      ...textDescriptor,
      get() { return patchResponse(this, textDescriptor.get!.call(this)) },
    })
    Object.defineProperty(prototype, 'response', {
      ...responseDescriptor,
      get() {
        const raw = responseDescriptor.get!.call(this)
        return ['', 'text', 'json'].includes(this.responseType) ? patchResponse(this, raw) : raw
      },
    })
  }

  const fetchUrl = (input: RequestInfo | URL) => input instanceof Request ? input.url : String(input)
  return {
    shouldHandleFetch: input => active() && classifyTrialQualityApi(fetchUrl(input)) !== null,
    async handleFetch(originalFetch, thisArg, input, init) {
      const api = classifyTrialQualityApi(fetchUrl(input))
      const method = init?.method || (input instanceof Request ? input.method : 'GET')
      if (!active() || !api || method.toUpperCase() !== 'GET')
        return originalFetch.call(thisArg, input, init)
      const startedGeneration = generation
      await waitForEntries(ensureEntries(api), init?.signal || (input instanceof Request ? input.signal : undefined))
      const response = await originalFetch.call(thisArg, input, init)
      const entries = getCached(api.cid)?.entries
      if (!active() || startedGeneration !== generation || !response.ok || !entries?.length)
        return response
      try {
        const json: unknown = await response.clone().json()
        const patched = api.kind === 'playurl' ? mergeTrialPlayurl(json, entries) : patchTrialVipStatus(json, true)
        if (patched === json)
          return response
        const headers = new Headers(response.headers)
        headers.delete('content-length')
        headers.delete('content-encoding')
        const result = new Response(JSON.stringify(patched), { status: response.status, statusText: response.statusText, headers })
        Object.defineProperties(result, {
          url: { value: response.url },
          redirected: { value: response.redirected },
          type: { value: response.type },
        })
        return result
      }
      catch {
        return response
      }
    },
  }
}
