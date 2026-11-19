import browser from 'webextension-polyfill'

import type { HostPermissionsStatus, HostPermissionsStatusRequest } from '~/constants/apiDiagnostics'
import { GET_HOST_PERMISSIONS_STATUS_MESSAGE } from '~/constants/apiDiagnostics'
import { onMessage } from '~/utils/messaging'

const BILIBILI_HOST_WILDCARD = 'https://*.bilibili.com/*'
const HDSLB_HOST_WILDCARD = 'https://*.hdslb.com/*'
const CORE_HOST_ORIGINS = [
  'https://www.bilibili.com',
  'https://api.bilibili.com',
  'https://app.bilibili.com',
  'https://api.live.bilibili.com',
] as const
const MAX_EXTRA_ORIGINS = 10

function formatHostPermissionMissingMessage(origin: string): string {
  return `Missing host permission for ${origin}`
}

export class ApiHostPermissionError extends Error {
  readonly origin: string
  readonly code = -1
  readonly isHostPermissionMissing = true
  readonly missingHostOrigin: string

  constructor(origin: string) {
    super(formatHostPermissionMissingMessage(origin))
    this.name = 'ApiHostPermissionError'
    this.origin = origin
    this.missingHostOrigin = origin
  }
}

function normalizeHttpOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim())
    return undefined

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return undefined
    return parsed.origin
  }
  catch {
    return undefined
  }
}

function isExtensionHostDomain(origin: string): boolean {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'bilibili.com'
      || hostname.endsWith('.bilibili.com')
      || hostname === 'hdslb.com'
      || hostname.endsWith('.hdslb.com')
  }
  catch {
    return false
  }
}

async function hasOriginHostPermission(pattern: string): Promise<boolean | undefined> {
  if (typeof browser.permissions?.contains !== 'function')
    return undefined

  try {
    return Boolean(await browser.permissions.contains({ origins: [pattern] }))
  }
  catch {
    return undefined
  }
}

/**
 * 检查扩展当前是否持有目标 URL 所在 origin 的站点访问权限。
 * 浏览器不支持或查询异常时返回 undefined，避免误报。
 */
export async function getMissingHostPermissionOrigin(url: string): Promise<string | undefined> {
  const origin = normalizeHttpOrigin(url)
  if (!origin)
    return undefined

  const granted = await hasOriginHostPermission(`${origin}/*`)
  return granted === false ? origin : undefined
}

async function getHostPermissionsStatus(
  request?: HostPermissionsStatusRequest,
): Promise<HostPermissionsStatus> {
  if (typeof browser.permissions?.contains !== 'function') {
    return {
      supported: false,
      bilibiliWildcard: true,
      hdslbWildcard: true,
      deniedOrigins: [],
    }
  }

  const originSet = new Set<string>(CORE_HOST_ORIGINS)
  if (Array.isArray(request?.origins)) {
    let added = 0
    for (const rawOrigin of request.origins) {
      if (added >= MAX_EXTRA_ORIGINS)
        break
      const normalized = normalizeHttpOrigin(rawOrigin)
      if (!normalized || !isExtensionHostDomain(normalized) || originSet.has(normalized))
        continue
      originSet.add(normalized)
      added++
    }
  }

  const origins = [...originSet]
  const [bilibiliWildcard, hdslbWildcard, ...originResults] = await Promise.all([
    hasOriginHostPermission(BILIBILI_HOST_WILDCARD),
    hasOriginHostPermission(HDSLB_HOST_WILDCARD),
    ...origins.map(origin => hasOriginHostPermission(`${origin}/*`)),
  ])

  const allResults = [bilibiliWildcard, hdslbWildcard, ...originResults]
  if (allResults.every(result => result === undefined)) {
    return {
      supported: false,
      bilibiliWildcard: true,
      hdslbWildcard: true,
      deniedOrigins: [],
    }
  }

  const deniedOrigins = origins.filter((_, index) => originResults[index] === false)
  return {
    supported: true,
    bilibiliWildcard: bilibiliWildcard !== false,
    hdslbWildcard: hdslbWildcard !== false,
    deniedOrigins,
  }
}

export function setupHostPermissionsDiagnostics() {
  onMessage<HostPermissionsStatusRequest | undefined, HostPermissionsStatus>(
    GET_HOST_PERMISSIONS_STATUS_MESSAGE,
    request => getHostPermissionsStatus(request),
  )
}
