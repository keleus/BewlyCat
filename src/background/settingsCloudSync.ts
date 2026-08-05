import browser from 'webextension-polyfill'

import type { SettingsCloudSyncEntry } from '~/utils/settingsCloudSyncProtocol'
import {
  compareSettingsCloudSyncVersions,
  createSettingsCloudSyncKey,
  estimateSettingsCloudSyncItemBytes,
  isSettingsCloudSyncEnabled,
  normalizeSettingsCloudSyncEntry,
  parseSettingsCloudSyncKey,
  SETTINGS_CLOUD_SYNC_ENABLED_KEY,
  SETTINGS_CLOUD_SYNC_ITEM_BYTES_LIMIT,
  SETTINGS_CLOUD_SYNC_TOTAL_BYTES_LIMIT,
} from '~/utils/settingsCloudSyncProtocol'
import { normalizeSettingsStorageWriteMeta, SETTINGS_STORAGE_META_KEY } from '~/utils/settingsStorageProtocol'

import {
  applySettingsCloudSyncChanges,
  collectSettingsCloudSyncEntries,
  reconcileSettingsCloudSyncSnapshot,
} from './settingsStorageCoordinator'

const CLOUD_UPLOAD_DELAY = 1_500
const CLOUD_SYNC_ITEM_COUNT_LIMIT = 480

let initialized = false
let enabled = false
let ready = false
let generation = 0
let preferenceGeneration = 0
let restartAfterInitialization = false
let flushInProgress = false
let flushTimer: ReturnType<typeof setTimeout> | undefined
let knownCloudItems: Record<string, unknown> = {}
const pendingUploads = new Map<string, SettingsCloudSyncEntry>()
let remoteChangeQueue = Promise.resolve()

function logCloudSyncError(message: string, error?: unknown) {
  if (error == null)
    console.warn(`[BewlyCat] ${message}`)
  else
    console.error(`[BewlyCat] ${message}`, error)
}

function parseCloudEntries(items: Record<string, unknown>) {
  const entries: Record<string, SettingsCloudSyncEntry> = {}
  for (const [key, value] of Object.entries(items)) {
    const field = parseSettingsCloudSyncKey(key)
    const entry = normalizeSettingsCloudSyncEntry(value)
    if (field && entry)
      entries[field] = entry
  }
  return entries
}

function getKnownCloudEntry(field: string) {
  return normalizeSettingsCloudSyncEntry(knownCloudItems[createSettingsCloudSyncKey(field)]) ?? undefined
}

function clearFlushTimer() {
  if (flushTimer != null)
    clearTimeout(flushTimer)
  flushTimer = undefined
}

function consumePendingUpload(field: string, entry: SettingsCloudSyncEntry) {
  const pending = pendingUploads.get(field)
  if (pending && compareSettingsCloudSyncVersions(pending.version, entry.version) <= 0)
    pendingUploads.delete(field)
}

function queueUploads(uploads: Record<string, SettingsCloudSyncEntry>) {
  if (!enabled)
    return

  for (const [field, entry] of Object.entries(uploads)) {
    const cloudEntry = getKnownCloudEntry(field)
    if (cloudEntry && compareSettingsCloudSyncVersions(entry.version, cloudEntry.version) <= 0)
      continue

    const pending = pendingUploads.get(field)
    if (!pending || compareSettingsCloudSyncVersions(pending.version, entry.version) <= 0)
      pendingUploads.set(field, entry)
  }

  if (pendingUploads.size === 0 || flushTimer != null || flushInProgress)
    return

  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flushUploads()
  }, CLOUD_UPLOAD_DELAY)
}

function safeEstimateItemBytes(key: string, value: unknown) {
  try {
    return estimateSettingsCloudSyncItemBytes(key, value)
  }
  catch {
    return Number.POSITIVE_INFINITY
  }
}

function estimateKnownCloudBytes() {
  return Object.entries(knownCloudItems).reduce(
    (total, [key, value]) => total + safeEstimateItemBytes(key, value),
    0,
  )
}

function prepareUploadBatch(entries: Array<[string, SettingsCloudSyncEntry]>) {
  const items: Record<string, SettingsCloudSyncEntry> = {}
  let totalBytes = estimateKnownCloudBytes()
  let itemCount = Object.keys(knownCloudItems).length

  for (const [field, entry] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    const key = createSettingsCloudSyncKey(field)
    const cloudEntry = getKnownCloudEntry(field)
    if (cloudEntry && compareSettingsCloudSyncVersions(entry.version, cloudEntry.version) <= 0) {
      consumePendingUpload(field, entry)
      continue
    }

    const nextBytes = safeEstimateItemBytes(key, entry)
    if (nextBytes > SETTINGS_CLOUD_SYNC_ITEM_BYTES_LIMIT) {
      consumePendingUpload(field, entry)
      logCloudSyncError(`Skipped oversized cloud setting "${field}".`)
      continue
    }

    const previousExists = Object.prototype.hasOwnProperty.call(knownCloudItems, key)
    const previousBytes = previousExists
      ? safeEstimateItemBytes(key, knownCloudItems[key])
      : 0
    const nextTotalBytes = totalBytes - previousBytes + nextBytes
    const nextItemCount = itemCount + (previousExists ? 0 : 1)
    if (
      nextTotalBytes > SETTINGS_CLOUD_SYNC_TOTAL_BYTES_LIMIT
      || nextItemCount > CLOUD_SYNC_ITEM_COUNT_LIMIT
    ) {
      consumePendingUpload(field, entry)
      logCloudSyncError(`Skipped cloud setting "${field}" because the sync quota is full.`)
      continue
    }

    items[key] = entry
    totalBytes = nextTotalBytes
    itemCount = nextItemCount
  }

  return items
}

async function flushUploads() {
  if (!enabled || !ready || flushInProgress || pendingUploads.size === 0)
    return

  flushInProgress = true
  const flushGeneration = generation
  const batchEntries = [...pendingUploads.entries()]
  let shouldScheduleNextBatch = true

  try {
    const stored = await browser.storage.local.get(SETTINGS_CLOUD_SYNC_ENABLED_KEY)
    if (
      flushGeneration !== generation
      || !isSettingsCloudSyncEnabled(stored[SETTINGS_CLOUD_SYNC_ENABLED_KEY])
    ) {
      return
    }

    const items = prepareUploadBatch(batchEntries)
    if (Object.keys(items).length === 0)
      return

    await browser.storage.sync.set(items)
    if (flushGeneration !== generation)
      return

    for (const [field, entry] of batchEntries) {
      const key = createSettingsCloudSyncKey(field)
      if (!Object.prototype.hasOwnProperty.call(items, key))
        continue
      const cloudEntry = getKnownCloudEntry(field)
      if (!cloudEntry || compareSettingsCloudSyncVersions(cloudEntry.version, entry.version) <= 0)
        knownCloudItems[key] = entry
      consumePendingUpload(field, entry)
    }
  }
  catch (error) {
    shouldScheduleNextBatch = false
    logCloudSyncError('Failed to upload settings to browser sync storage:', error)
  }
  finally {
    flushInProgress = false
    if (shouldScheduleNextBatch && enabled && ready && pendingUploads.size > 0)
      queueUploads({})
  }
}

async function startCloudSync() {
  const startGeneration = ++generation
  enabled = true
  ready = false
  restartAfterInitialization = false
  clearFlushTimer()
  pendingUploads.clear()

  try {
    const cloudItems = await browser.storage.sync.get(null)
    if (!enabled || startGeneration !== generation)
      return

    knownCloudItems = cloudItems
    const result = await reconcileSettingsCloudSyncSnapshot(parseCloudEntries(cloudItems))
    if (!enabled || startGeneration !== generation)
      return

    ready = true
    queueUploads(result.uploads)
    if (restartAfterInitialization) {
      restartAfterInitialization = false
      void startCloudSync()
    }
  }
  catch (error) {
    if (!enabled || startGeneration !== generation)
      return
    logCloudSyncError('Failed to initialize settings cloud sync:', error)
  }
}

function stopCloudSync() {
  enabled = false
  ready = false
  generation++
  restartAfterInitialization = false
  clearFlushTimer()
  pendingUploads.clear()
  knownCloudItems = {}
}

function updateCloudSyncPreference(value: unknown) {
  if (isSettingsCloudSyncEnabled(value)) {
    if (!enabled)
      void startCloudSync()
  }
  else if (enabled) {
    stopCloudSync()
  }
}

function handleLocalChanges(
  changes: Record<string, browser.Storage.StorageChange>,
  areaName: string,
) {
  if (areaName !== 'local')
    return

  const preferenceChange = changes[SETTINGS_CLOUD_SYNC_ENABLED_KEY]
  if (preferenceChange) {
    preferenceGeneration++
    updateCloudSyncPreference(preferenceChange.newValue)
  }
  if (!enabled || !ready)
    return

  const metaChange = changes[SETTINGS_STORAGE_META_KEY]
  if (!metaChange)
    return

  const previousMeta = normalizeSettingsStorageWriteMeta(metaChange.oldValue)
  const nextMeta = normalizeSettingsStorageWriteMeta(metaChange.newValue)
  if (!nextMeta.cloudSyncInitialized) {
    // A standalone metadata reset must bootstrap again. A full local clear has
    // already disabled sync above because it removes the preference as well.
    void startCloudSync()
    return
  }

  const changedFields = new Set([
    ...Object.keys(previousMeta.fieldVersions),
    ...Object.keys(nextMeta.fieldVersions),
  ])
  const fields = [...changedFields].filter(field =>
    compareSettingsCloudSyncVersions(
      previousMeta.fieldVersions[field],
      nextMeta.fieldVersions[field],
    ) !== 0,
  )
  if (fields.length === 0)
    return

  const localGeneration = generation
  void collectSettingsCloudSyncEntries(fields).then((entries) => {
    if (enabled && ready && localGeneration === generation)
      queueUploads(entries)
  }).catch(error => logCloudSyncError('Failed to collect local settings for cloud sync:', error))
}

function handleSyncChanges(
  changes: Record<string, browser.Storage.StorageChange>,
  areaName: string,
) {
  if (areaName !== 'sync' || !enabled)
    return

  const remoteChanges: Record<string, SettingsCloudSyncEntry | null> = {}
  for (const [key, change] of Object.entries(changes)) {
    const field = parseSettingsCloudSyncKey(key)
    if (!field)
      continue

    if (change.newValue == null)
      Reflect.deleteProperty(knownCloudItems, key)
    else
      knownCloudItems[key] = change.newValue
    remoteChanges[field] = normalizeSettingsCloudSyncEntry(change.newValue)
  }
  if (Object.keys(remoteChanges).length === 0)
    return

  if (!ready) {
    restartAfterInitialization = true
    return
  }

  const remoteGeneration = generation
  remoteChangeQueue = remoteChangeQueue.then(async () => {
    if (!enabled || !ready || remoteGeneration !== generation)
      return
    const result = await applySettingsCloudSyncChanges(remoteChanges)
    if (enabled && ready && remoteGeneration === generation)
      queueUploads(result.uploads)
  }).catch(error => logCloudSyncError('Failed to apply remote settings changes:', error))
}

export function setupSettingsCloudSync() {
  if (initialized)
    return

  initialized = true
  browser.storage.onChanged.addListener(handleLocalChanges)
  browser.storage.onChanged.addListener(handleSyncChanges)

  const initialPreferenceGeneration = preferenceGeneration
  void browser.storage.local.get(SETTINGS_CLOUD_SYNC_ENABLED_KEY).then((stored) => {
    if (initialPreferenceGeneration === preferenceGeneration)
      updateCloudSyncPreference(stored[SETTINGS_CLOUD_SYNC_ENABLED_KEY])
  }).catch(error => logCloudSyncError('Failed to read settings cloud sync preference:', error))
}
