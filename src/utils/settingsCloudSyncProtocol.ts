export const SETTINGS_CLOUD_SYNC_ENABLED_KEY = 'settingsCloudSyncEnabled:v1'
export const SETTINGS_CLOUD_SYNC_KEY_PREFIX = 'bewlycat:settings:v1:'
export const SETTINGS_CLOUD_SYNC_SCHEMA_VERSION = 1

// Leave headroom below the browser storage.sync quotas (8 KiB per item and
// about 100 KiB in total) for differences in quota accounting across browsers.
export const SETTINGS_CLOUD_SYNC_ITEM_BYTES_LIMIT = 7_500
export const SETTINGS_CLOUD_SYNC_TOTAL_BYTES_LIMIT = 90_000

export interface SettingsCloudSyncVersion {
  counter: number
  deviceId: string
}

export interface SettingsCloudSyncEntry {
  deleted: boolean
  schemaVersion: typeof SETTINGS_CLOUD_SYNC_SCHEMA_VERSION
  value?: unknown
  version: SettingsCloudSyncVersion
}

const BLOCKED_FIELDS = new Set(['__proto__', 'constructor', 'prototype'])

// Wallpaper data and its rendering configuration stay device-local. Uploaded
// files and caches already use separate local-only storage keys.
const LOCAL_ONLY_WALLPAPER_FIELDS = new Set([
  'wallpaperMode',
  'wallpaper',
  'enableWallpaperMasking',
  'wallpaperMaskOpacity',
  'wallpaperBlurIntensity',
  'wallpaperCacheTime',
  'individuallySetSearchPageWallpaper',
  'searchPageWallpaperMode',
  'searchPageWallpaper',
  'searchPageEnableWallpaperMasking',
  'searchPageWallpaperMaskOpacity',
  'searchPageWallpaperBlurIntensity',
  'searchPageWallpaperCacheTime',
  'searchPageModeWallpaperFixed',
  // Legacy fields are denied as a final guard if an old settings object has
  // not completed its local-only migration yet.
  'locallyUploadedWallpaper',
  'customizeCSS',
  'customizeCSSContent',
])

// These values describe transient playback state on one device. Syncing them
// would consume the write quota and cause devices to continually fight.
const LOCAL_ONLY_RUNTIME_FIELDS = new Set([
  'lastDanmakuState',
  'lastCaptionState',
  'savedPlaybackRate',
  'savedVideoAspectRatio',
  'lastAcknowledgedVersion',
  // Removed volume-normalization field; keep it local while legacy storage is cleaned up.
  'targetVolume',
])

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key)
}

export function isSettingsCloudSyncEnabled(value: unknown) {
  return value === true || value === 'true'
}

export function isSettingsCloudSyncField(field: string) {
  return field.length > 0
    && field.length <= 200
    && !BLOCKED_FIELDS.has(field)
    && !LOCAL_ONLY_WALLPAPER_FIELDS.has(field)
    && !LOCAL_ONLY_RUNTIME_FIELDS.has(field)
}

export function createSettingsCloudSyncKey(field: string) {
  return `${SETTINGS_CLOUD_SYNC_KEY_PREFIX}${encodeURIComponent(field)}`
}

export function parseSettingsCloudSyncKey(key: string) {
  if (!key.startsWith(SETTINGS_CLOUD_SYNC_KEY_PREFIX))
    return null

  try {
    const encodedField = key.slice(SETTINGS_CLOUD_SYNC_KEY_PREFIX.length)
    const field = decodeURIComponent(encodedField)
    return createSettingsCloudSyncKey(field) === key && isSettingsCloudSyncField(field)
      ? field
      : null
  }
  catch {
    return null
  }
}

export function compareSettingsCloudSyncVersions(
  left: SettingsCloudSyncVersion | undefined,
  right: SettingsCloudSyncVersion | undefined,
) {
  if (!left)
    return right ? -1 : 0
  if (!right)
    return 1
  if (left.counter !== right.counter)
    return left.counter < right.counter ? -1 : 1
  if (left.deviceId === right.deviceId)
    return 0
  return left.deviceId < right.deviceId ? -1 : 1
}

export function normalizeSettingsCloudSyncVersion(value: unknown): SettingsCloudSyncVersion | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  const candidate = value as Partial<SettingsCloudSyncVersion>
  if (
    !Number.isSafeInteger(candidate.counter)
    || candidate.counter! < 1
    || typeof candidate.deviceId !== 'string'
    || candidate.deviceId.length === 0
    || candidate.deviceId.length > 100
  ) {
    return undefined
  }

  return {
    counter: candidate.counter!,
    deviceId: candidate.deviceId,
  }
}

export function normalizeSettingsCloudSyncEntry(value: unknown): SettingsCloudSyncEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null

  const candidate = value as Partial<SettingsCloudSyncEntry>
  const version = normalizeSettingsCloudSyncVersion(candidate.version)
  if (
    candidate.schemaVersion !== SETTINGS_CLOUD_SYNC_SCHEMA_VERSION
    || typeof candidate.deleted !== 'boolean'
    || !version
    || (!candidate.deleted && !hasOwn(candidate as Record<string, unknown>, 'value'))
  ) {
    return null
  }

  return candidate.deleted
    ? {
        deleted: true,
        schemaVersion: SETTINGS_CLOUD_SYNC_SCHEMA_VERSION,
        version,
      }
    : {
        deleted: false,
        schemaVersion: SETTINGS_CLOUD_SYNC_SCHEMA_VERSION,
        value: candidate.value,
        version,
      }
}

export function createSettingsCloudSyncEntry(
  value: Record<string, unknown>,
  field: string,
  version: SettingsCloudSyncVersion,
): SettingsCloudSyncEntry {
  return hasOwn(value, field)
    ? {
        deleted: false,
        schemaVersion: SETTINGS_CLOUD_SYNC_SCHEMA_VERSION,
        value: value[field],
        version,
      }
    : {
        deleted: true,
        schemaVersion: SETTINGS_CLOUD_SYNC_SCHEMA_VERSION,
        version,
      }
}

export function estimateSettingsCloudSyncItemBytes(key: string, value: unknown) {
  const serializedValue = JSON.stringify(value)
  if (serializedValue === undefined)
    return Number.POSITIVE_INFINITY

  return new TextEncoder().encode(key).byteLength
    + new TextEncoder().encode(serializedValue).byteLength
}
