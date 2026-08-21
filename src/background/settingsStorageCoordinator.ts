import browser from 'webextension-polyfill'

import { onMessage } from '~/utils/messaging'
import type { SettingsCloudSyncEntry, SettingsCloudSyncMode, SettingsCloudSyncVersion } from '~/utils/settingsCloudSyncProtocol'
import {
  compareSettingsCloudSyncVersions,
  createSettingsCloudSyncEntry,
  isSettingsCloudSyncEnabled,
  isSettingsCloudSyncField,
  normalizeSettingsCloudSyncEntry,
  parseSettingsCloudSyncKey,
  SETTINGS_CLOUD_SYNC_ENABLED_KEY,
} from '~/utils/settingsCloudSyncProtocol'
import type { SettingsStoragePatchResponse, SettingsStorageWriteMeta } from '~/utils/settingsStorageProtocol'
import {
  applySettingsStoragePatch,
  createTopLevelSettingsStoragePatch,
  isSettingsStoragePatchEmpty,
  normalizeSettingsStorageImportRequest,
  normalizeSettingsStoragePatchRequest,
  normalizeSettingsStorageWriteMeta,
  parseStoredSettings,
  SETTINGS_STORAGE_IMPORT_MESSAGE,
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

async function alignCloudClockWithCurrentSnapshot(meta: SettingsStorageWriteMeta) {
  const cloudItems = await browser.storage.sync.get(null)
  for (const [key, value] of Object.entries(cloudItems)) {
    if (!parseSettingsCloudSyncKey(key))
      continue

    const entry = normalizeSettingsCloudSyncEntry(value)
    if (entry)
      meta.cloudClock = Math.max(meta.cloudClock, entry.version.counter)
  }
}

async function importSettings(value: unknown): Promise<SettingsStoragePatchResponse> {
  const request = normalizeSettingsStorageImportRequest(value)
  if (!request)
    throw new TypeError('Invalid settings storage import')

  const stored = await browser.storage.local.get([
    SETTINGS_CLOUD_SYNC_ENABLED_KEY,
    SETTINGS_STORAGE_KEY,
    SETTINGS_STORAGE_META_KEY,
  ])
  const currentValue = parseStoredSettings(stored[SETTINGS_STORAGE_KEY])
  const { meta } = completeStorageMeta(stored[SETTINGS_STORAGE_META_KEY])
  const nextValue = {
    ...currentValue,
    ...request.settings,
  }
  const serializedValue = JSON.stringify(nextValue)
  const actualPatch = createTopLevelSettingsStoragePatch(currentValue, nextValue)
  const settingsChanged = !isSettingsStoragePatchEmpty(actualPatch)
  const syncFields = Object.keys(request.settings).filter(isSettingsCloudSyncField)
  const syncEnabled = isSettingsCloudSyncEnabled(stored[SETTINGS_CLOUD_SYNC_ENABLED_KEY])

  // A manual import is authoritative even when a field already has the same
  // rendered value. Once cloud sync has initialized, advance past the current
  // remote clock before assigning one version to the complete imported snapshot.
  if (syncEnabled && meta.cloudSyncInitialized && syncFields.length > 0)
    await alignCloudClockWithCurrentSnapshot(meta)

  if (settingsChanged)
    incrementRevision(meta)

  // Same as applyPatch: imported values keep versions even while sync is
  // disabled, so a later bootstrap uploads them instead of losing them to
  // older cloud values.
  if (syncFields.length > 0) {
    const version = createNextCloudVersion(meta)
    for (const field of syncFields)
      meta.fieldVersions[field] = version
  }

  await browser.storage.local.set(settingsChanged
    ? {
        [SETTINGS_STORAGE_KEY]: serializedValue,
        [SETTINGS_STORAGE_META_KEY]: meta,
      }
    : { [SETTINGS_STORAGE_META_KEY]: meta })

  return {
    accepted: true,
    epoch: meta.epoch,
    revision: meta.revision,
    storedValue: serializedValue,
  }
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
    // Version every real change even while sync is disabled. Removals made
    // before sync initializes must survive the bootstrap snapshot as
    // tombstones instead of being resurrected by older cloud values.
    const version = createNextCloudVersion(currentMeta)
    for (const field of [...Object.keys(actualPatch.set), ...actualPatch.remove]) {
      if (isSettingsCloudSyncField(field))
        currentMeta.fieldVersions[field] = version
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
 * Reconciles a complete sync-area snapshot. `mode` decides how the bootstrap
 * snapshot is merged when a device enables sync: `auto` keeps the historical
 * behavior (cloud wins untouched fields, dirty fields win back), `pull` lets
 * the cloud snapshot overwrite local settings, and `push` uploads the local
 * snapshot over the cloud. Later reconciliations always use per-field Lamport
 * versions.
 */
export function reconcileSettingsCloudSyncSnapshot(
  entries: Record<string, SettingsCloudSyncEntry>,
  mode: SettingsCloudSyncMode = 'auto',
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
        if (mode === 'push')
          continue
        if (mode === 'pull' || !bootstrapDirtyFields.has(field))
          applyRemoteWinner(settings, meta, field, remote)
      }

      // An existing cloud snapshot is authoritative when a device joins for
      // the first time. Merely opening Settings may materialize local defaults;
      // those untouched fields must not be uploaded into gaps in that snapshot.
      // Only fields changed after sync was enabled have versions at this point.
      // If the cloud is completely empty, seed it from the current local state.
      // `pull` skips re-uploading fields the snapshot just delivered (they are
      // identical now) while still uploading local-only fields so offline edits
      // and removal tombstones reach the cloud; `push` uploads every known
      // local field with one shared version.
      const localFieldCandidates = mode === 'push' || cloudFields.size === 0
        ? [...new Set([
            ...Object.keys(settings),
            ...bootstrapDirtyFields,
          ])]
        : mode === 'pull'
          ? [...bootstrapDirtyFields].filter(field => !cloudFields.has(field))
          : [...bootstrapDirtyFields]
      const fieldsToUpload = localFieldCandidates
        .filter(isSettingsCloudSyncField)
        .sort()

      if ((cloudFields.size === 0 || mode === 'push') && fieldsToUpload.length > 0) {
        // Use one version for the entire initial snapshot (seeding an empty
        // cloud or an explicit local push). If several devices seed or push
        // concurrently, the version/device tie-breaker then selects one
        // consistent device for all overlapping fields instead of producing a
        // field-by-field mixture.
        const bootstrapVersion = createNextCloudVersion(meta)
        for (const field of fieldsToUpload) {
          meta.fieldVersions[field] = bootstrapVersion
          createUpload(uploads, settings, meta, field)
        }
      }
      else {
        for (const field of fieldsToUpload) {
          meta.fieldVersions[field] = createNextCloudVersion(meta)
          createUpload(uploads, settings, meta, field)
        }
      }
      meta.cloudSyncInitialized = true
    }
    else {
      // Align the local clock with the snapshot before creating any version.
      // `push` skips applying remote entries entirely, so without this scan a
      // stale local clock would produce versions below current cloud entries
      // and every pushed upload would be dropped as outdated.
      for (const remote of Object.values(cloudEntries))
        meta.cloudClock = Math.max(meta.cloudClock, remote.version.counter)

      for (const [field, remote] of Object.entries(cloudEntries)) {
        if (mode === 'push')
          continue
        const comparison = compareSettingsCloudSyncVersions(meta.fieldVersions[field], remote.version)
        if (mode === 'pull' || comparison <= 0)
          applyRemoteWinner(settings, meta, field, remote)
        else
          createUpload(uploads, settings, meta, field)
      }

      const localFields = new Set([
        ...Object.keys(settings),
        ...Object.keys(meta.fieldVersions),
      ])
      // A push stamps the whole local snapshot with one shared version so a
      // concurrent push resolves to a single consistent device.
      const pushVersion = mode === 'push' ? createNextCloudVersion(meta) : undefined
      for (const field of [...localFields].sort()) {
        if (!isSettingsCloudSyncField(field))
          continue
        if (mode !== 'push' && cloudFields.has(field))
          continue

        if (pushVersion) {
          meta.fieldVersions[field] = pushVersion
        }
        else if (!meta.fieldVersions[field]) {
          meta.fieldVersions[field] = createNextCloudVersion(meta)
        }
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
  onMessage(SETTINGS_STORAGE_IMPORT_MESSAGE, value => enqueueSettingsWrite(() => importSettings(value)))
}
