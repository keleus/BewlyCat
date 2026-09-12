import type Browser from 'webextension-polyfill'
import browser from 'webextension-polyfill'

interface CacheEntry {
  response: any
  expiresAt: number
}

const STORAGE_KEY = 'apiResponseCache:v1'

function isSuccessfulResponse(response: any): boolean {
  return response?.code === 0 && response.data !== undefined && response.data !== null
}

/** 后台统一合并请求，并用会话存储保留 Service Worker 休眠前的缓存。 */
export function createApiResponseCache(
  sessionStorage: Pick<Browser.Storage.StorageAreaWithUsage, 'get' | 'set'> | undefined = browser.storage?.session,
) {
  const entries = new Map<string, CacheEntry>()
  const pendingRequests = new Map<string, Promise<any>>()
  let loadPromise: Promise<void> | undefined
  let persistQueue: Promise<void> = Promise.resolve()

  async function load() {
    try {
      const stored = await sessionStorage?.get(STORAGE_KEY)
      const cached = stored?.[STORAGE_KEY]
      if (!cached || typeof cached !== 'object')
        return

      for (const [key, value] of Object.entries(cached)) {
        const entry = value as CacheEntry | null
        if (entry && Number.isFinite(entry.expiresAt) && entry.expiresAt > Date.now() && isSuccessfulResponse(entry.response))
          entries.set(key, entry)
      }
    }
    catch {
      // 不支持会话存储或读取失败时，仍可在当前后台进程内共享结果。
    }
  }

  function persist() {
    persistQueue = persistQueue.then(async () => {
      await sessionStorage?.set({ [STORAGE_KEY]: Object.fromEntries(entries) })
    }).catch(() => {
      // 写入失败不影响请求结果，也不阻塞后续缓存写入。
    })
    return persistQueue
  }

  return async (key: string, maxAge: number, request: () => Promise<any>): Promise<any> => {
    loadPromise ??= load()
    await loadPromise

    for (const [entryKey, entry] of entries) {
      if (entry.expiresAt <= Date.now())
        entries.delete(entryKey)
    }

    const cached = entries.get(key)
    if (cached)
      return cached.response

    const pending = pendingRequests.get(key)
    if (pending)
      return pending

    // 在执行异步请求前登记 Promise，避免多个标签页同时穿透缓存。
    const result = Promise.resolve().then(request).then(async (response) => {
      if (isSuccessfulResponse(response)) {
        entries.set(key, { response, expiresAt: Date.now() + maxAge })
        await persist()
      }
      return response
    }).finally(() => {
      pendingRequests.delete(key)
    })
    pendingRequests.set(key, result)
    return result
  }
}
