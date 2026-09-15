import type { MaybeRef } from 'vue'
import { computed, getCurrentScope, isProxy, onScopeDispose, reactive, toRaw, toValue, watch } from 'vue'
import browser from 'webextension-polyfill'

import type { StorageRef } from '~/composables/useStorageLocal'
import { isBackgroundUnavailableError, sendMessage } from '~/utils/messaging'
import type { SettingsStoragePatch, SettingsStoragePatchResponse } from '~/utils/settingsStorageProtocol'
import {
  applySettingsStoragePatch,
  createEmptySettingsStoragePatch,
  createTopLevelSettingsStoragePatch,
  isSettingsStoragePatchEmpty,
  mergeSettingsStoragePatches,
  normalizeSettingsStorageWriteMeta,
  parseStoredSettings,
  SETTINGS_STORAGE_IMPORT_MESSAGE,
  SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_META_KEY,
  SETTINGS_STORAGE_PATCH_MESSAGE,
  SETTINGS_STORAGE_READ_MESSAGE,
} from '~/utils/settingsStorageProtocol'

interface UseSettingsStorageOptions<T> {
  onError?: (error: unknown) => void
  onReady?: (value: T) => void
  normalize?: (value: T) => void
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

export async function importSettingsStorage(settings: Record<string, unknown>) {
  const response = await sendMessage(SETTINGS_STORAGE_IMPORT_MESSAGE, { settings })
  if (!isPatchResponse(response) || !response.accepted)
    throw new TypeError('Invalid settings import response')

  return response
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
): StorageRef<T> {
  const defaults = cloneValue(toValue(initialValue))
  const state = reactive(cloneValue(defaults)) as T
  // 保持根对象引用稳定；整份导入/重置也只通知实际变化的设置项。
  const data = computed({
    get: () => state,
    set: (value: T | null | undefined) => writeLocalValue(value ?? defaults),
  }) as StorageRef<T>
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

  function updateReactiveValue(value: T) {
    const normalizedValue = cloneValue(value)
    // 在普通快照上完成迁移，避免组件看到未迁移值以及迁移产生的中间状态。
    options.normalize?.(normalizedValue)
    const patch = createTopLevelSettingsStoragePatch(asRecord(state), asRecord(normalizedValue))

    applyingCanonicalValue = true
    try {
      for (const key of patch.remove)
        Reflect.deleteProperty(state, key)
      for (const [key, next] of Object.entries(patch.set))
        asRecord(state)[key] = next
    }
    finally {
      applyingCanonicalValue = false
    }
  }

  const renderCanonicalValue = () => {
    let nextValue = canonicalValue
    if (inFlightPatch)
      nextValue = applySettingsStoragePatch(nextValue, inFlightPatch)
    nextValue = applySettingsStoragePatch(nextValue, queuedPatch)
    const renderedValue = asRecord(cloneValue(nextValue))

    updateReactiveValue(renderedValue as T)

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

  const resetStorageGeneration = (epoch: string, renderDefaults = true) => {
    storageGeneration++
    currentEpoch = epoch
    canonicalRevision = 0
    canonicalFingerprint = null
    canonicalValue = asRecord(cloneValue(defaults))
    queuedPatch = createEmptySettingsStoragePatch()
    inFlightPatch = null
    persistenceReady = epoch.length > 0
    if (renderDefaults)
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
        if (isBackgroundUnavailableError(error) || attempt === MAX_MESSAGE_ATTEMPTS - 1)
          break
        await waitForRetry(100 * 2 ** attempt)
      }
    }

    throw lastError
  }

  const flushQueuedPatch = async () => {
    if (disposed || !ready || !persistenceReady || inFlightPatch || isSettingsStoragePatchEmpty(queuedPatch))
      return

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
        resetStorageGeneration(response.epoch, false)
        persistenceReady = true
        applyCanonicalValue(response.storedValue, response.revision, true)
        void flushQueuedPatch()
        return
      }

      applyCanonicalValue(response.storedValue, response.revision)
      inFlightPatch = null
      renderCanonicalValue()
      void flushQueuedPatch()
    }
    catch (error) {
      if (error instanceof StaleStorageGenerationError || generation !== storageGeneration)
        return

      queuedPatch = mergeSettingsStoragePatches(patch, queuedPatch)
      inFlightPatch = null
      renderCanonicalValue()
      onError(error)
    }
  }

  function writeLocalValue(value: T) {
    if (applyingCanonicalValue)
      return

    updateReactiveValue(value)
    const nextValue = asRecord(cloneValue(state))
    const patch = createTopLevelSettingsStoragePatch(observedValue, nextValue)
    observedValue = nextValue
    if (isSettingsStoragePatchEmpty(patch))
      return

    queuedPatch = mergeSettingsStoragePatches(queuedPatch, patch)
    void flushQueuedPatch()
  }

  watch(
    data,
    () => writeLocalValue(state),
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
        resetStorageGeneration(response.epoch, false)
      else
        currentEpoch = response.epoch

      persistenceReady = true
      applyCanonicalValue(response.storedValue, response.revision, epochChanged)
      void flushQueuedPatch()
    }
    catch (error) {
      if (!(error instanceof StaleStorageGenerationError))
        onError(error)
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
      resetStorageGeneration(meta!.epoch, !settingsChange)
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
    })
  }

  void refreshCanonicalValue(true)

  return data
}
