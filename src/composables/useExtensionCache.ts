import type { ShallowRef } from 'vue'
import { shallowRef, watch } from 'vue'

import type { ExtensionCacheKey, ExtensionCacheRead, ExtensionCacheWrite } from '~/constants/extensionCache'
import { EXTENSION_CACHE_MESSAGE } from '~/constants/extensionCache'
import { sendMessage } from '~/utils/messaging'

interface UseExtensionCacheOptions {
  /** 合并连续写入的延迟（毫秒）。 */
  writeDelay?: number
}

interface ExtensionCacheHandle<T> {
  data: ShallowRef<T>
  /** 读取完成（成功或失败）后兑现。 */
  ready: Promise<void>
  /** 立即写入尚未落盘的修改，用于页面卸载。 */
  flush: () => void
}

/**
 * 后台 IndexedDB 中的整份缓存。只在赋值 `data.value` 时写入；不同标签页之间不实时同步，
 * 同时打开多个页面时以最后写入者为准，适合可重建的缓存数据。
 */
export function useExtensionCache<T>(
  key: ExtensionCacheKey,
  initialValue: T,
  options: UseExtensionCacheOptions = {},
): ExtensionCacheHandle<T> {
  const { writeDelay = 0 } = options
  const data = shallowRef(initialValue) as ShallowRef<T>
  let loaded = false
  let dirtyBeforeLoad = false
  let applyingStoredValue = false
  let writeTimer: ReturnType<typeof setTimeout> | undefined
  let pendingWrite = false

  function write() {
    pendingWrite = false
    let value: string | null
    try {
      value = data.value == null ? null : JSON.stringify(data.value)
    }
    catch (error) {
      console.warn(`[BewlyCat] Failed to serialize ${key}.`, error)
      return
    }
    void sendMessage<ExtensionCacheWrite>(EXTENSION_CACHE_MESSAGE.WRITE, { key, value })
      .catch(error => console.warn(`[BewlyCat] Failed to write ${key}.`, error))
  }

  function flush() {
    if (writeTimer !== undefined)
      clearTimeout(writeTimer)
    writeTimer = undefined
    if (pendingWrite)
      write()
  }

  function scheduleWrite() {
    pendingWrite = true
    if (writeTimer !== undefined)
      clearTimeout(writeTimer)
    writeTimer = setTimeout(flush, writeDelay)
  }

  watch(data, () => {
    if (applyingStoredValue)
      return
    if (!loaded) {
      dirtyBeforeLoad = true
      return
    }
    scheduleWrite()
  }, { flush: 'sync' })

  const ready = (async () => {
    try {
      const stored = await sendMessage<ExtensionCacheRead, string | null>(EXTENSION_CACHE_MESSAGE.READ, { key })
      // 与 useStorageLocal 一致：已有存储时以存储为准，读取前的页面修改只在没有存储时落盘。
      if (typeof stored === 'string') {
        const storedValue = JSON.parse(stored) as T
        applyingStoredValue = true
        try {
          data.value = storedValue
        }
        finally {
          applyingStoredValue = false
        }
        dirtyBeforeLoad = false
      }
    }
    catch (error) {
      console.warn(`[BewlyCat] Failed to read ${key}.`, error)
    }
    finally {
      loaded = true
      if (dirtyBeforeLoad)
        scheduleWrite()
    }
  })()

  return { data, ready, flush }
}
