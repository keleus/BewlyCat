import type { SettingsCloudSyncVersion } from './settingsCloudSyncProtocol'
import { isSettingsCloudSyncField, normalizeSettingsCloudSyncVersion } from './settingsCloudSyncProtocol'

export const SETTINGS_STORAGE_KEY = 'settings'
export const SETTINGS_STORAGE_META_KEY = 'settingsWriteMeta:v1'
export const SETTINGS_STORAGE_READ_MESSAGE = 'readSettingsStorage'
export const SETTINGS_STORAGE_PATCH_MESSAGE = 'patchSettingsStorage'
export const SETTINGS_STORAGE_RECENT_OPERATION_LIMIT = 256

export interface SettingsStoragePatchRequest {
  clientId: string
  epoch: string
  operationId: number
  patch: SettingsStoragePatch
}

export interface SettingsStoragePatch {
  set: Record<string, unknown>
  remove: string[]
}

export interface SettingsStoragePatchResponse {
  accepted: boolean
  epoch: string
  revision: number
  storedValue?: string
}

export interface SettingsStorageWriteMeta {
  cloudClock: number
  cloudSyncInitialized: boolean
  deviceId: string
  epoch: string
  fieldVersions: Record<string, SettingsCloudSyncVersion>
  recentOperationIds: string[]
  revision: number
}

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function valuesEqual(left: unknown, right: unknown) {
  if (Object.is(left, right))
    return true

  try {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  catch {
    return false
  }
}

export function createEmptySettingsStoragePatch(): SettingsStoragePatch {
  return { set: {}, remove: [] }
}

export function isSettingsStoragePatchEmpty(patch: SettingsStoragePatch) {
  return patch.remove.length === 0 && Object.keys(patch.set).length === 0
}

export function createTopLevelSettingsStoragePatch(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): SettingsStoragePatch {
  const patch = createEmptySettingsStoragePatch()
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])

  for (const key of keys) {
    if (BLOCKED_KEYS.has(key))
      continue

    if (!hasOwn(next, key)) {
      patch.remove.push(key)
      continue
    }

    if (!hasOwn(previous, key) || !valuesEqual(previous[key], next[key]))
      patch.set[key] = next[key]
  }

  return patch
}

/** Combines patches in application order; values from `next` win. */
export function mergeSettingsStoragePatches(
  previous: SettingsStoragePatch,
  next: SettingsStoragePatch,
): SettingsStoragePatch {
  const mergedSet = { ...previous.set }
  const mergedRemove = new Set(previous.remove)

  for (const key of next.remove) {
    if (BLOCKED_KEYS.has(key))
      continue

    Reflect.deleteProperty(mergedSet, key)
    mergedRemove.add(key)
  }

  for (const [key, value] of Object.entries(next.set)) {
    if (BLOCKED_KEYS.has(key))
      continue

    mergedRemove.delete(key)
    mergedSet[key] = value
  }

  return {
    set: mergedSet,
    remove: [...mergedRemove],
  }
}

export function applySettingsStoragePatch(
  value: Record<string, unknown>,
  patch: SettingsStoragePatch,
): Record<string, unknown> {
  const nextValue = { ...value }

  for (const key of patch.remove) {
    if (!BLOCKED_KEYS.has(key))
      Reflect.deleteProperty(nextValue, key)
  }

  for (const [key, next] of Object.entries(patch.set)) {
    if (!BLOCKED_KEYS.has(key))
      nextValue[key] = next
  }

  return nextValue
}

export function parseStoredSettings(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return parseStoredSettings(JSON.parse(value))
    }
    catch {
      return {}
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}

  return value as Record<string, unknown>
}

export function normalizeSettingsStoragePatch(value: unknown): SettingsStoragePatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null

  const candidate = value as Partial<SettingsStoragePatch>
  if (!candidate.set || typeof candidate.set !== 'object' || Array.isArray(candidate.set) || !Array.isArray(candidate.remove))
    return null

  const patch = createEmptySettingsStoragePatch()
  for (const [key, next] of Object.entries(candidate.set)) {
    if (!BLOCKED_KEYS.has(key))
      patch.set[key] = next
  }
  for (const key of candidate.remove) {
    if (typeof key === 'string' && !BLOCKED_KEYS.has(key))
      patch.remove.push(key)
  }

  return patch
}

export function normalizeSettingsStoragePatchRequest(value: unknown): SettingsStoragePatchRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null

  const candidate = value as Partial<SettingsStoragePatchRequest>
  const patch = normalizeSettingsStoragePatch(candidate.patch)
  if (
    !patch
    || typeof candidate.clientId !== 'string'
    || candidate.clientId.length === 0
    || candidate.clientId.length > 100
    || typeof candidate.epoch !== 'string'
    || candidate.epoch.length === 0
    || candidate.epoch.length > 100
    || !Number.isSafeInteger(candidate.operationId)
    || candidate.operationId! < 1
  ) {
    return null
  }

  return {
    clientId: candidate.clientId,
    epoch: candidate.epoch,
    operationId: candidate.operationId!,
    patch,
  }
}

export function normalizeSettingsStorageWriteMeta(value: unknown): SettingsStorageWriteMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      cloudClock: 0,
      cloudSyncInitialized: false,
      deviceId: '',
      epoch: '',
      fieldVersions: {},
      recentOperationIds: [],
      revision: 0,
    }
  }

  const candidate = value as Partial<SettingsStorageWriteMeta>
  const fieldVersions: Record<string, SettingsCloudSyncVersion> = {}
  if (candidate.fieldVersions && typeof candidate.fieldVersions === 'object' && !Array.isArray(candidate.fieldVersions)) {
    for (const [field, value] of Object.entries(candidate.fieldVersions)) {
      const version = normalizeSettingsCloudSyncVersion(value)
      if (version && isSettingsCloudSyncField(field))
        fieldVersions[field] = version
    }
  }

  return {
    cloudClock: Number.isSafeInteger(candidate.cloudClock) && candidate.cloudClock! >= 0
      ? candidate.cloudClock!
      : 0,
    cloudSyncInitialized: candidate.cloudSyncInitialized === true,
    deviceId: typeof candidate.deviceId === 'string' && candidate.deviceId.length <= 100
      ? candidate.deviceId
      : '',
    epoch: typeof candidate.epoch === 'string' && candidate.epoch.length <= 100 ? candidate.epoch : '',
    fieldVersions,
    recentOperationIds: Array.isArray(candidate.recentOperationIds)
      ? candidate.recentOperationIds.filter(operationId => typeof operationId === 'string').slice(-SETTINGS_STORAGE_RECENT_OPERATION_LIMIT)
      : [],
    revision: Number.isSafeInteger(candidate.revision) && candidate.revision! >= 0 ? candidate.revision! : 0,
  }
}
