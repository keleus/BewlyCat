import type { MaybeRef, Ref, WatchOptions } from 'vue'
import { getCurrentScope, isProxy, onScopeDispose, ref, shallowRef, toRaw, toValue, watch } from 'vue'
import browser from 'webextension-polyfill'

type Awaitable<T> = T | Promise<T>
type SerializerType = 'any' | 'boolean' | 'date' | 'map' | 'number' | 'object' | 'set' | 'string'
type StorageFlush = NonNullable<WatchOptions['flush']>

export type StorageEventFilter = (invoke: () => void | Promise<void>) => void | Promise<void>

export interface StorageSerializer<T> {
  read: (raw: string) => Awaitable<T>
  write: (value: T) => Awaitable<string>
}

export interface UseStorageLocalOptions<T> {
  deep?: boolean
  eventFilter?: StorageEventFilter
  flush?: StorageFlush
  listenToStorageChanges?: boolean
  mergeDefaults?: boolean | ((storedValue: T, defaults: T) => T)
  onError?: (error: unknown) => void
  onReady?: (value: T) => void
  serializer?: StorageSerializer<T>
  shallow?: boolean
  writeDefaults?: boolean
}

export type StorageRef<T> = Omit<Ref<T>, 'value'> & {
  get value(): T
  set value(value: T | null | undefined)
}

const storageSerializers: Record<SerializerType, StorageSerializer<any>> = {
  boolean: {
    read: raw => raw === 'true',
    write: value => String(value),
  },
  object: {
    read: raw => JSON.parse(raw),
    write: value => JSON.stringify(value),
  },
  number: {
    read: raw => Number.parseFloat(raw),
    write: value => String(value),
  },
  any: {
    read: raw => raw,
    write: value => String(value),
  },
  string: {
    read: raw => raw,
    write: value => String(value),
  },
  map: {
    read: raw => new Map(JSON.parse(raw)),
    write: value => JSON.stringify(Array.from(value.entries())),
  },
  set: {
    read: raw => new Set(JSON.parse(raw)),
    write: value => JSON.stringify(Array.from(value)),
  },
  date: {
    read: raw => new Date(raw),
    write: value => value.toISOString(),
  },
}

function guessSerializerType(value: unknown): SerializerType {
  if (value == null)
    return 'any'

  if (value instanceof Set)
    return 'set'

  if (value instanceof Map)
    return 'map'

  if (value instanceof Date)
    return 'date'

  if (typeof value === 'boolean')
    return 'boolean'

  if (typeof value === 'string')
    return 'string'

  if (typeof value === 'object')
    return 'object'

  if (!Number.isNaN(value))
    return 'number'

  return 'any'
}

function tryOnScopeDispose(fn: () => void) {
  if (getCurrentScope())
    onScopeDispose(fn)
}

function cloneValue<T>(value: T): T {
  if (typeof value !== 'object' || value == null)
    return value

  const normalizedValue = isProxy(value) ? toRaw(value) : value

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(normalizedValue)
    }
    catch {
      // Fall through to JSON cloning for reactive proxies and other non-cloneable values.
    }
  }

  try {
    return JSON.parse(JSON.stringify(normalizedValue)) as T
  }
  catch {
    return normalizedValue
  }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function createInitialValue<T>(value: MaybeRef<T>): T {
  return cloneValue(toValue(value))
}

async function deserializeStoredValue<T>(rawValue: unknown, serializer: StorageSerializer<T>): Promise<T> {
  if (typeof rawValue === 'string')
    return await serializer.read(rawValue)

  return rawValue as T
}

function mergeStoredValue<T>(storedValue: T, defaults: T, mergeDefaults: UseStorageLocalOptions<T>['mergeDefaults']): T {
  if (!mergeDefaults)
    return storedValue

  if (typeof mergeDefaults === 'function')
    return mergeDefaults(storedValue, defaults)

  if (isObjectLike(storedValue) && isObjectLike(defaults))
    return { ...defaults, ...storedValue } as T

  return storedValue
}

function createStorageRef<T>(value: T, useShallow: boolean): StorageRef<T> {
  return (useShallow ? shallowRef(value) : ref(value)) as StorageRef<T>
}

function runWithFilter(eventFilter: StorageEventFilter | undefined, invoke: () => void | Promise<void>) {
  if (eventFilter) {
    void eventFilter(invoke)
    return
  }

  void invoke()
}

export function useStorageLocal<T>(key: string, initialValue: MaybeRef<T>, options?: UseStorageLocalOptions<T>): StorageRef<T> {
  const {
    flush = 'pre',
    deep = true,
    listenToStorageChanges = true,
    writeDefaults = true,
    mergeDefaults = false,
    shallow = false,
    eventFilter,
    onError = (error) => {
      console.error(error)
    },
    onReady,
    serializer: customSerializer,
  } = options ?? {}

  const initial = createInitialValue(initialValue)
  const serializer = (customSerializer ?? storageSerializers[guessSerializerType(initial)]) as StorageSerializer<T>
  const data = createStorageRef(createInitialValue(initialValue), shallow)

  let ready = false
  let dirtyBeforeReady = false
  let hasStoredValue = false
  let suppressedWriteCount = 0
  let syncStarted = false
  const pendingOwnStorageChanges: unknown[] = []

  const normalizePendingStorageValue = (value: unknown) => value ?? null

  const enqueuePendingOwnStorageChange = (value: unknown) => {
    pendingOwnStorageChanges.push(normalizePendingStorageValue(value))
    if (pendingOwnStorageChanges.length > 20)
      pendingOwnStorageChanges.shift()
  }

  const consumePendingOwnStorageChange = (value: unknown) => {
    const normalizedValue = normalizePendingStorageValue(value)
    const index = pendingOwnStorageChanges.findIndex(pendingValue => Object.is(pendingValue, normalizedValue))
    if (index === -1)
      return false

    pendingOwnStorageChanges.splice(index, 1)
    return true
  }

  const stopDirtyWatch = watch(
    data,
    () => {
      if (!ready)
        dirtyBeforeReady = true
    },
    { deep, flush: 'sync' },
  )

  const persistValue = async () => {
    if (data.value == null) {
      enqueuePendingOwnStorageChange(null)
      try {
        await browser.storage.local.remove(key)
      }
      catch (error) {
        consumePendingOwnStorageChange(null)
        throw error
      }
    }
    else {
      const serializedValue = await serializer.write(data.value)
      enqueuePendingOwnStorageChange(serializedValue)
      try {
        await browser.storage.local.set({ [key]: serializedValue })
      }
      catch (error) {
        consumePendingOwnStorageChange(serializedValue)
        throw error
      }
    }
  }

  const startSync = () => {
    if (syncStarted)
      return

    syncStarted = true

    watch(
      data,
      () => {
        if (!ready)
          return

        if (suppressedWriteCount > 0) {
          suppressedWriteCount--
          return
        }

        runWithFilter(eventFilter, async () => {
          try {
            await persistValue()
          }
          catch (error) {
            onError(error)
          }
        })
      },
      { flush, deep },
    )

    if (listenToStorageChanges) {
      const onChanged = async (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local' || !(key in changes))
          return

        const change = changes[key]

        try {
          if (consumePendingOwnStorageChange(change.newValue))
            return

          suppressedWriteCount++
          if (change.newValue == null) {
            data.value = createInitialValue(initialValue) as T
          }
          else {
            const storedValue = await deserializeStoredValue(change.newValue, serializer)
            data.value = cloneValue(mergeStoredValue(storedValue, createInitialValue(initialValue), mergeDefaults))
          }
        }
        catch (error) {
          onError(error)
        }
      }

      browser.storage.onChanged.addListener(onChanged)
      tryOnScopeDispose(() => browser.storage.onChanged.removeListener(onChanged))
    }
  }

  void (async () => {
    try {
      const result = await browser.storage.local.get(key)
      const rawStoredValue = result[key]
      hasStoredValue = rawStoredValue != null

      if (rawStoredValue == null) {
        if (!dirtyBeforeReady)
          data.value = createInitialValue(initialValue) as T
      }
      else {
        const storedValue = await deserializeStoredValue(rawStoredValue, serializer)
        data.value = cloneValue(mergeStoredValue(storedValue, createInitialValue(initialValue), mergeDefaults))
      }
    }
    catch (error) {
      onError(error)
    }
    finally {
      ready = true
      stopDirtyWatch()
    }

    try {
      if (!hasStoredValue && (dirtyBeforeReady || writeDefaults) && data.value != null)
        await persistValue()
    }
    catch (error) {
      onError(error)
    }

    onReady?.(data.value)
    startSync()
  })()

  return data
}
