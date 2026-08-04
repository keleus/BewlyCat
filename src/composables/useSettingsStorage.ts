import type { MaybeRef } from 'vue'
import { getCurrentScope, isProxy, onScopeDispose, ref, toRaw, toValue, watch } from 'vue'
import browser from 'webextension-polyfill'

import type { StorageRef } from '~/composables/useStorageLocal'
import { isExtensionContextInvalidatedError, sendMessage } from '~/utils/messaging'
import type { SettingsStoragePatch, SettingsStoragePatchResponse } from '~/utils/settingsStorageProtocol'
import {
  applySettingsStoragePatch,
  createEmptySettingsStoragePatch,
  createTopLevelSettingsStoragePatch,
  isSettingsStoragePatchEmpty,
  mergeSettingsStoragePatches,
  normalizeSettingsStorageWriteMeta,
  parseStoredSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_META_KEY,
  SETTINGS_STORAGE_PATCH_MESSAGE,
  SETTINGS_STORAGE_READ_MESSAGE,
} from '~/utils/settingsStorageProtocol'

interface UseSettingsStorageOptions<T> {
  onError?: (error: unknown) => void
  onReady?: (value: T) => void
}

export interface SettingsStorageRef<T extends object> extends StorageRef<T> {
  flush: () => Promise<void>
}

interface SettingsStorageFlushWaiter {
  reject: (error: unknown) => void
  resolve: () => void
}

const MAX_MESSAGE_ATTEMPTS = 5

class StaleStorageGenerationError extends Error {}

function cloneValue<T>(value: T): T {
  if (typeof value !== 'object' || value == null)
    return value

  const normalizedValue = isProxy(value) ? toRaw(value) : value
  try {
    return structuredClone(normalizedValue)
  }
  catch {
    return JSON.parse(JSON.stringify(normalizedValue)) as T
  }
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>
}

function storedValueFingerprint(value: unknown) {
  if (value == null)
    return null

  return typeof value === 'string' ? value : JSON.stringify(value)
}

function isPatchResponse(value: unknown): value is SettingsStoragePatchResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const response = value as Partial<SettingsStoragePatchResponse>
  return typeof response.accepted === 'boolean'
    && typeof response.epoch === 'string'
    && response.epoch.length > 0
    && Number.isSafeInteger(response.revision)
    && response.revision! >= 0
    && (response.storedValue === undefined || typeof response.storedValue === 'string')
}

function waitForRetry(delay: number) {
  return new Promise<void>(resolve => setTimeout(resolve, delay))
}

function createClientId() {
  if (typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Settings-specific storage adapter. All writes are top-level patches serialized
 * by the background coordinator, so stale frames cannot overwrite the full object.
 */
export function useSettingsStorage<T extends object>(
  initialValue: MaybeRef<T>,
  options: UseSettingsStorageOptions<T> = {},
): SettingsStorageRef<T> {
  const defaults = cloneValue(toValue(initialValue))
  const data = ref(cloneValue(defaults)) as StorageRef<T>
  const onError = options.onError ?? ((error: unknown) => console.error(error))

  let applyingCanonicalValue = false
  let canonicalValue = asRecord(cloneValue(defaults))
  let currentEpoch = ''
  let canonicalRevision = 0
  let canonicalFingerprint: string | null = null
  let observedValue = asRecord(cloneValue(data.value))
  let queuedPatch = createEmptySettingsStoragePatch()
  let inFlightPatch: SettingsStoragePatch | null = null
  const clientId = createClientId()
  let nextOperationId = 1
  let ready = false
  let persistenceReady = false
  let disposed = false
  let storageGeneration = 0
  let readInFlightGeneration: number | null = null
  const flushWaiters = new Set<SettingsStorageFlushWaiter>()

  const storageIsIdle = () => ready
    && persistenceReady
    && !inFlightPatch
    && isSettingsStoragePatchEmpty(queuedPatch)

  const resolveFlushWaitersIfIdle = () => {
    if (!storageIsIdle())
      return

    flushWaiters.forEach(waiter => waiter.resolve())
    flushWaiters.clear()
  }

  const rejectFlushWaiters = (error: unknown) => {
    flushWaiters.forEach(waiter => waiter.reject(error))
    flushWaiters.clear()
  }

  const renderCanonicalValue = () => {
    let nextValue = canonicalValue
    if (inFlightPatch)
      nextValue = applySettingsStoragePatch(nextValue, inFlightPatch)
    nextValue = applySettingsStoragePatch(nextValue, queuedPatch)
    const renderedValue = asRecord(cloneValue(nextValue))

    applyingCanonicalValue = true
    data.value = cloneValue(renderedValue) as T
    applyingCanonicalValue = false

    const actualValue = asRecord(cloneValue(data.value))
    const derivedPatch = createTopLevelSettingsStoragePatch(renderedValue, actualValue)
    observedValue = actualValue
    if (!isSettingsStoragePatchEmpty(derivedPatch))
      queuedPatch = mergeSettingsStoragePatches(queuedPatch, derivedPatch)
  }

  const applyCanonicalValue = (storedValue: unknown, revision: number, force = false) => {
    const normalizedRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0
    const fingerprint = storedValueFingerprint(storedValue)
    if (!force && normalizedRevision < canonicalRevision)
      return
    if (!force && normalizedRevision === canonicalRevision && fingerprint === canonicalFingerprint)
      return

    canonicalRevision = normalizedRevision
    canonicalFingerprint = fingerprint
    canonicalValue = {
      ...asRecord(cloneValue(defaults)),
      ...parseStoredSettings(storedValue),
    }
    renderCanonicalValue()
  }

  const resetStorageGeneration = (epoch: string) => {
    storageGeneration++
    currentEpoch = epoch
    canonicalRevision = 0
    canonicalFingerprint = null
    canonicalValue = asRecord(cloneValue(defaults))
    queuedPatch = createEmptySettingsStoragePatch()
    inFlightPatch = null
    persistenceReady = epoch.length > 0
    renderCanonicalValue()
  }

  const sendWithRetry = async <R>(type: string, payload: unknown, generation: number): Promise<R> => {
    let lastError: unknown

    for (let attempt = 0; attempt < MAX_MESSAGE_ATTEMPTS; attempt++) {
      if (generation !== storageGeneration)
        throw new StaleStorageGenerationError()

      try {
        const response = await sendMessage(type, payload) as R
        if (generation !== storageGeneration)
          throw new StaleStorageGenerationError()
        return response
      }
      catch (error) {
        if (error instanceof StaleStorageGenerationError)
          throw error

        lastError = error
        if (isExtensionContextInvalidatedError(error) || attempt === MAX_MESSAGE_ATTEMPTS - 1)
          break
        await waitForRetry(100 * 2 ** attempt)
      }
    }

    throw lastError
  }

  const flushQueuedPatch = async () => {
    if (disposed) {
      rejectFlushWaiters(new Error('Settings storage was disposed before pending writes were flushed'))
      return
    }

    if (!ready || !persistenceReady || inFlightPatch || isSettingsStoragePatchEmpty(queuedPatch)) {
      resolveFlushWaitersIfIdle()
      return
    }

    const patch = queuedPatch
    const generation = storageGeneration
    queuedPatch = createEmptySettingsStoragePatch()
    inFlightPatch = patch
    const request = {
      clientId,
      epoch: currentEpoch,
      operationId: nextOperationId++,
      patch,
    }

    try {
      const response = await sendWithRetry<SettingsStoragePatchResponse>(SETTINGS_STORAGE_PATCH_MESSAGE, request, generation)
      if (!isPatchResponse(response))
        throw new TypeError('Invalid settings storage response')
      if (generation !== storageGeneration)
        return
      if (!response.accepted || response.epoch !== currentEpoch) {
        // Preserve edits queued while this request was in flight. Applying the
        // in-flight patch first keeps the later queued values authoritative.
        const pendingPatch = mergeSettingsStoragePatches(patch, queuedPatch)
        resetStorageGeneration(response.epoch)
        persistenceReady = true
        applyCanonicalValue(response.storedValue, response.revision, true)
        queuedPatch = pendingPatch
        renderCanonicalValue()
        void flushQueuedPatch()
        resolveFlushWaitersIfIdle()
        return
      }

      applyCanonicalValue(response.storedValue, response.revision)
      inFlightPatch = null
      renderCanonicalValue()
      void flushQueuedPatch()
      resolveFlushWaitersIfIdle()
    }
    catch (error) {
      if (error instanceof StaleStorageGenerationError || generation !== storageGeneration)
        return

      queuedPatch = mergeSettingsStoragePatches(patch, queuedPatch)
      inFlightPatch = null
      renderCanonicalValue()
      onError(error)
      rejectFlushWaiters(error)
    }
  }

  const flushPendingWrites = (): Promise<void> => {
    if (disposed)
      return Promise.reject(new Error('Settings storage was disposed before pending writes were flushed'))

    void flushQueuedPatch()
    if (storageIsIdle())
      return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      flushWaiters.add({ resolve, reject })
    })
  }

  watch(
    data,
    () => {
      if (applyingCanonicalValue)
        return

      const nextValue = asRecord(cloneValue(data.value))
      const patch = createTopLevelSettingsStoragePatch(observedValue, nextValue)
      observedValue = nextValue
      if (isSettingsStoragePatchEmpty(patch))
        return

      queuedPatch = mergeSettingsStoragePatches(queuedPatch, patch)
      void flushQueuedPatch()
    },
    { deep: true, flush: 'sync' },
  )

  const markReady = () => {
    if (ready)
      return

    ready = true
    options.onReady?.(data.value)
    void flushQueuedPatch()
  }

  const refreshCanonicalValue = async (markReadyWhenFinished = false) => {
    const generation = storageGeneration
    if (readInFlightGeneration === generation)
      return

    readInFlightGeneration = generation
    try {
      const response = await sendWithRetry<SettingsStoragePatchResponse>(SETTINGS_STORAGE_READ_MESSAGE, undefined, generation)
      if (!isPatchResponse(response))
        throw new TypeError('Invalid settings storage response')
      if (generation !== storageGeneration)
        return

      const epochChanged = currentEpoch.length > 0 && response.epoch !== currentEpoch
      if (epochChanged)
        resetStorageGeneration(response.epoch)
      else
        currentEpoch = response.epoch

      persistenceReady = true
      applyCanonicalValue(response.storedValue, response.revision, epochChanged)
      void flushQueuedPatch()
    }
    catch (error) {
      if (!(error instanceof StaleStorageGenerationError)) {
        onError(error)
        rejectFlushWaiters(error)
      }
    }
    finally {
      if (readInFlightGeneration === generation)
        readInFlightGeneration = null
      if (markReadyWhenFinished)
        markReady()
    }
  }

  const onStorageChanged = (
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local')
      return

    const settingsChange = changes[SETTINGS_STORAGE_KEY]
    const metaChange = changes[SETTINGS_STORAGE_META_KEY]
    const metaWasRemoved = metaChange?.oldValue != null && metaChange.newValue == null
    if (metaWasRemoved) {
      resetStorageGeneration('')
      void refreshCanonicalValue()
      return
    }

    const meta = metaChange ? normalizeSettingsStorageWriteMeta(metaChange.newValue) : null
    const epochChanged = Boolean(meta?.epoch && currentEpoch && meta.epoch !== currentEpoch)
    if (epochChanged)
      resetStorageGeneration(meta!.epoch)
    else if (meta?.epoch && !currentEpoch)
      currentEpoch = meta.epoch

    if (!settingsChange) {
      if (meta?.epoch && (epochChanged || !canonicalFingerprint))
        void refreshCanonicalValue()
      return
    }

    persistenceReady = true
    applyCanonicalValue(settingsChange.newValue, meta?.revision ?? canonicalRevision, epochChanged)
    void flushQueuedPatch()
  }

  browser.storage.onChanged.addListener(onStorageChanged)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      browser.storage.onChanged.removeListener(onStorageChanged)
      rejectFlushWaiters(new Error('Settings storage was disposed before pending writes were flushed'))
    })
  }

  void refreshCanonicalValue(true)

  Object.defineProperty(data, 'flush', {
    value: flushPendingWrites,
  })

  return data as SettingsStorageRef<T>
}
