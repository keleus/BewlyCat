import browser from 'webextension-polyfill'

import { onMessage } from '~/utils/messaging'
import type { SettingsCloudSyncEntry, SettingsCloudSyncVersion } from '~/utils/settingsCloudSyncProtocol'
import {
  compareSettingsCloudSyncVersions,
  createSettingsCloudSyncEntry,
  isSettingsCloudSyncEnabled,
  isSettingsCloudSyncField,
  normalizeSettingsCloudSyncEntry,
  SETTINGS_CLOUD_SYNC_ENABLED_KEY,
} from '~/utils/settingsCloudSyncProtocol'
import type { SettingsStoragePatchResponse, SettingsStorageWriteMeta } from '~/utils/settingsStorageProtocol'
import {
  applySettingsStoragePatch,
  createTopLevelSettingsStoragePatch,
  isSettingsStoragePatchEmpty,
  normalizeSettingsStoragePatchRequest,
  normalizeSettingsStorageWriteMeta,
  parseStoredSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_META_KEY,
  SETTINGS_STORAGE_PATCH_MESSAGE,
  SETTINGS_STORAGE_READ_MESSAGE,
  SETTINGS_STORAGE_RECENT_OPERATION_LIMIT,
} from '~/utils/settingsStorageProtocol'

export interface SettingsCloudSyncReconcileResult {
  uploads: Record<string, SettingsCloudSyncEntry>
}

let initialized = false
let writeQueue: Promise<void> = Promise.resolve()

function createStorageId() {
  if (typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function completeStorageMeta(value: unknown) {
  const meta = normalizeSettingsStorageWriteMeta(value)
  let changed = false

  if (!meta.epoch) {
    meta.epoch = createStorageId()
    changed = true
  }
  if (!meta.deviceId) {
    meta.deviceId = createStorageId()
    changed = true
  }

  for (const version of Object.values(meta.fieldVersions))
    meta.cloudClock = Math.max(meta.cloudClock, version.counter)

  return { changed, meta }
}

function enqueueSettingsWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation)
  writeQueue = result.then(() => undefined, () => undefined)
  return result
}

function incrementRevision(meta: SettingsStorageWriteMeta) {
  if (meta.revision < Number.MAX_SAFE_INTEGER)
    meta.revision++
}

function createNextCloudVersion(meta: SettingsStorageWriteMeta): SettingsCloudSyncVersion {
  if (meta.cloudClock < Number.MAX_SAFE_INTEGER)
    meta.cloudClock++

  return {
    counter: meta.cloudClock,
    deviceId: meta.deviceId,
  }
}

function applyCloudEntry(
  settings: Record<string, unknown>,
  field: string,
  entry: SettingsCloudSyncEntry,
) {
  if (entry.deleted)
    Reflect.deleteProperty(settings, field)
  else
    settings[field] = entry.value
}

function createUpload(
  uploads: Record<string, SettingsCloudSyncEntry>,
  settings: Record<string, unknown>,
  meta: SettingsStorageWriteMeta,
  field: string,
) {
  const version = meta.fieldVersions[field]
  if (version)
    uploads[field] = createSettingsCloudSyncEntry(settings, field, version)
}

async function applyPatch(value: unknown): Promise<SettingsStoragePatchResponse> {
  const request = normalizeSettingsStoragePatchRequest(value)
  if (!request)
    throw new TypeError('Invalid settings storage patch')

  const stored = await browser.storage.local.get([
    SETTINGS_CLOUD_SYNC_ENABLED_KEY,
    SETTINGS_STORAGE_KEY,
    SETTINGS_STORAGE_META_KEY,
  ])
  const currentValue = parseStoredSettings(stored[SETTINGS_STORAGE_KEY])
  const { changed: metaWasCompleted, meta: currentMeta } = completeStorageMeta(stored[SETTINGS_STORAGE_META_KEY])
  if (metaWasCompleted)
    await browser.storage.local.set({ [SETTINGS_STORAGE_META_KEY]: currentMeta })

  if (request.epoch !== currentMeta.epoch) {
    return {
      accepted: false,
      epoch: currentMeta.epoch,
      revision: currentMeta.revision,
      storedValue: JSON.stringify(currentValue),
    }
  }

  const operationKey = `${request.clientId}:${request.operationId}`
  if (currentMeta.recentOperationIds.includes(operationKey)) {
    return {
      accepted: true,
      epoch: currentMeta.epoch,
      revision: currentMeta.revision,
      storedValue: JSON.stringify(currentValue),
    }
  }

  const nextValue = applySettingsStoragePatch(currentValue, request.patch)
  const serializedValue = JSON.stringify(nextValue)
  const actualPatch = createTopLevelSettingsStoragePatch(currentValue, nextValue)
  const settingsChanged = !isSettingsStoragePatchEmpty(actualPatch)

  if (settingsChanged) {
    incrementRevision(currentMeta)
    if (
      currentMeta.cloudSyncInitialized
      || isSettingsCloudSyncEnabled(stored[SETTINGS_CLOUD_SYNC_ENABLED_KEY])
    ) {
      const version = createNextCloudVersion(currentMeta)
      for (const field of [...Object.keys(actualPatch.set), ...actualPatch.remove]) {
        if (isSettingsCloudSyncField(field))
          currentMeta.fieldVersions[field] = version
      }
    }
  }

  currentMeta.recentOperationIds = [
    ...currentMeta.recentOperationIds,
    operationKey,
  ].slice(-SETTINGS_STORAGE_RECENT_OPERATION_LIMIT)

  await browser.storage.local.set(settingsChanged
    ? {
        [SETTINGS_STORAGE_KEY]: serializedValue,
        [SETTINGS_STORAGE_META_KEY]: currentMeta,
      }
    : { [SETTINGS_STORAGE_META_KEY]: currentMeta })

  return {
    accepted: true,
    epoch: currentMeta.epoch,
    revision: currentMeta.revision,
    storedValue: serializedValue,
  }
}

async function readSettings(): Promise<SettingsStoragePatchResponse> {
  const stored = await browser.storage.local.get([
    SETTINGS_STORAGE_KEY,
    SETTINGS_STORAGE_META_KEY,
  ])
  const { changed, meta } = completeStorageMeta(stored[SETTINGS_STORAGE_META_KEY])
  if (changed)
    await browser.storage.local.set({ [SETTINGS_STORAGE_META_KEY]: meta })

  return {
    accepted: true,
    epoch: meta.epoch,
    revision: meta.revision,
    storedValue: typeof stored[SETTINGS_STORAGE_KEY] === 'string'
      ? stored[SETTINGS_STORAGE_KEY]
      : stored[SETTINGS_STORAGE_KEY] == null
        ? undefined
        : JSON.stringify(parseStoredSettings(stored[SETTINGS_STORAGE_KEY])),
  }
}

function normalizeCloudEntries(entries: Record<string, SettingsCloudSyncEntry>) {
  const normalized: Record<string, SettingsCloudSyncEntry> = {}
  for (const [field, value] of Object.entries(entries)) {
    const entry = normalizeSettingsCloudSyncEntry(value)
    if (entry && isSettingsCloudSyncField(field))
      normalized[field] = entry
  }
  return normalized
}

function applyRemoteWinner(
  settings: Record<string, unknown>,
  meta: SettingsStorageWriteMeta,
  field: string,
  remote: SettingsCloudSyncEntry,
) {
  applyCloudEntry(settings, field, remote)
  meta.fieldVersions[field] = remote.version
  meta.cloudClock = Math.max(meta.cloudClock, remote.version.counter)
}

async function writeCloudMergeResult(
  previousSettings: Record<string, unknown>,
  settings: Record<string, unknown>,
  previousMeta: string,
  meta: SettingsStorageWriteMeta,
) {
  const serializedSettings = JSON.stringify(settings)
  const settingsChanged = serializedSettings !== JSON.stringify(previousSettings)
  const metaChanged = JSON.stringify(meta) !== previousMeta

  if (settingsChanged)
    incrementRevision(meta)
  if (!settingsChanged && !metaChanged)
    return

  await browser.storage.local.set(settingsChanged
    ? {
        [SETTINGS_STORAGE_KEY]: serializedSettings,
        [SETTINGS_STORAGE_META_KEY]: meta,
      }
    : { [SETTINGS_STORAGE_META_KEY]: meta })
}

/**
 * Reconciles a complete sync-area snapshot. The cloud wins fields the first
 * time a device joins; later reconciliations use per-field Lamport versions.
 */
export function reconcileSettingsCloudSyncSnapshot(
  entries: Record<string, SettingsCloudSyncEntry>,
): Promise<SettingsCloudSyncReconcileResult> {
  return enqueueSettingsWrite(async () => {
    const stored = await browser.storage.local.get([
      SETTINGS_CLOUD_SYNC_ENABLED_KEY,
      SETTINGS_STORAGE_KEY,
      SETTINGS_STORAGE_META_KEY,
    ])
    if (!isSettingsCloudSyncEnabled(stored[SETTINGS_CLOUD_SYNC_ENABLED_KEY]))
      return { uploads: {} }

    const previousSettings = parseStoredSettings(stored[SETTINGS_STORAGE_KEY])
    const settings = { ...previousSettings }
    const { meta } = completeStorageMeta(stored[SETTINGS_STORAGE_META_KEY])
    const previousMeta = JSON.stringify(meta)
    const cloudEntries = normalizeCloudEntries(entries)
    const cloudFields = new Set(Object.keys(cloudEntries))
    const uploads: Record<string, SettingsCloudSyncEntry> = {}

    if (!meta.cloudSyncInitialized) {
      // Local edits made after the user enabled sync but before the first cloud
      // read completed are marked by applyPatch and must not be overwritten by
      // the bootstrap snapshot.
      const bootstrapDirtyFields = new Set(Object.keys(meta.fieldVersions))
      for (const remote of Object.values(cloudEntries))
        meta.cloudClock = Math.max(meta.cloudClock, remote.version.counter)

      for (const [field, remote] of Object.entries(cloudEntries)) {
        if (!bootstrapDirtyFields.has(field))
          applyRemoteWinner(settings, meta, field, remote)
      }

      const localFields = new Set([
        ...Object.keys(settings),
        ...bootstrapDirtyFields,
      ])
      const fieldsToUpload = [...localFields]
        .filter(field => isSettingsCloudSyncField(field) && !cloudFields.has(field))
      for (const field of bootstrapDirtyFields) {
        if (cloudFields.has(field))
          fieldsToUpload.push(field)
      }
      for (const field of [...new Set(fieldsToUpload)].sort()) {
        meta.fieldVersions[field] = createNextCloudVersion(meta)
        createUpload(uploads, settings, meta, field)
      }
      meta.cloudSyncInitialized = true
    }
    else {
      for (const [field, remote] of Object.entries(cloudEntries)) {
        const comparison = compareSettingsCloudSyncVersions(meta.fieldVersions[field], remote.version)
        if (comparison <= 0)
          applyRemoteWinner(settings, meta, field, remote)
        else
          createUpload(uploads, settings, meta, field)
      }

      const localFields = new Set([
        ...Object.keys(settings),
        ...Object.keys(meta.fieldVersions),
      ])
      for (const field of [...localFields].sort()) {
        if (!isSettingsCloudSyncField(field) || cloudFields.has(field))
          continue

        if (!meta.fieldVersions[field])
          meta.fieldVersions[field] = createNextCloudVersion(meta)
        createUpload(uploads, settings, meta, field)
      }
    }

    await writeCloudMergeResult(previousSettings, settings, previousMeta, meta)
    return { uploads }
  })
}

/** Applies a partial set of remote changes; null represents a physically removed sync item. */
export function applySettingsCloudSyncChanges(
  changes: Record<string, SettingsCloudSyncEntry | null>,
): Promise<SettingsCloudSyncReconcileResult> {
  return enqueueSettingsWrite(async () => {
    const stored = await browser.storage.local.get([
      SETTINGS_CLOUD_SYNC_ENABLED_KEY,
      SETTINGS_STORAGE_KEY,
      SETTINGS_STORAGE_META_KEY,
    ])
    if (!isSettingsCloudSyncEnabled(stored[SETTINGS_CLOUD_SYNC_ENABLED_KEY]))
      return { uploads: {} }

    const previousSettings = parseStoredSettings(stored[SETTINGS_STORAGE_KEY])
    const settings = { ...previousSettings }
    const { meta } = completeStorageMeta(stored[SETTINGS_STORAGE_META_KEY])
    if (!meta.cloudSyncInitialized)
      return { uploads: {} }

    const previousMeta = JSON.stringify(meta)
    const uploads: Record<string, SettingsCloudSyncEntry> = {}

    for (const [field, value] of Object.entries(changes)) {
      if (!isSettingsCloudSyncField(field))
        continue

      const remote = value == null ? null : normalizeSettingsCloudSyncEntry(value)
      if (!remote) {
        if (!meta.fieldVersions[field] && Object.prototype.hasOwnProperty.call(settings, field))
          meta.fieldVersions[field] = createNextCloudVersion(meta)
        createUpload(uploads, settings, meta, field)
        continue
      }

      const comparison = compareSettingsCloudSyncVersions(meta.fieldVersions[field], remote.version)
      if (comparison <= 0)
        applyRemoteWinner(settings, meta, field, remote)
      else
        createUpload(uploads, settings, meta, field)
    }

    await writeCloudMergeResult(previousSettings, settings, previousMeta, meta)
    return { uploads }
  })
}

/** Reads local entries for fields whose versions changed in the coordinator metadata. */
export function collectSettingsCloudSyncEntries(fields: string[]) {
  return enqueueSettingsWrite(async () => {
    const stored = await browser.storage.local.get([
      SETTINGS_STORAGE_KEY,
      SETTINGS_STORAGE_META_KEY,
    ])
    const settings = parseStoredSettings(stored[SETTINGS_STORAGE_KEY])
    const { meta } = completeStorageMeta(stored[SETTINGS_STORAGE_META_KEY])
    const entries: Record<string, SettingsCloudSyncEntry> = {}

    if (!meta.cloudSyncInitialized)
      return entries

    for (const field of new Set(fields)) {
      if (isSettingsCloudSyncField(field))
        createUpload(entries, settings, meta, field)
    }
    return entries
  })
}

function handleStorageReset(
  changes: Record<string, browser.Storage.StorageChange>,
  areaName: string,
) {
  if (areaName !== 'local')
    return

  const metaChange = changes[SETTINGS_STORAGE_META_KEY]
  if (metaChange?.oldValue == null || metaChange.newValue != null)
    return

  const settingsWereRemoved = changes[SETTINGS_STORAGE_KEY]?.newValue == null
    && SETTINGS_STORAGE_KEY in changes

  void enqueueSettingsWrite(async () => {
    // Run after any write that raced with clear, so an old in-flight patch cannot
    // recreate the cleared settings or its epoch.
    if (settingsWereRemoved)
      await browser.storage.local.remove(SETTINGS_STORAGE_KEY)

    const { meta } = completeStorageMeta(undefined)
    await browser.storage.local.set({ [SETTINGS_STORAGE_META_KEY]: meta })
  }).catch(error => console.error('[BewlyCat] Failed to rotate settings storage epoch:', error))
}

export function setupSettingsStorageCoordinator() {
  if (initialized)
    return

  initialized = true
  browser.storage.onChanged.addListener(handleStorageReset)
  onMessage(SETTINGS_STORAGE_READ_MESSAGE, () => enqueueSettingsWrite(readSettings))
  onMessage(SETTINGS_STORAGE_PATCH_MESSAGE, value => enqueueSettingsWrite(() => applyPatch(value)))
}
