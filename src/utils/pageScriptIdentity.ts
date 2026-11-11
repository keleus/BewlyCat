/**
 * 页面脚本（MAIN world）与 content script 之间的版本握手。
 *
 * Firefox 更新扩展时会向已打开的页面重新注入 content script，但页面全局上的
 * 防重入标记会让新版页面脚本跳过初始化，旧版页面脚本继续运行。页面脚本的钩子
 * 必须在 document_start 安装，无法热替换，因此只能检测出版本不一致后提示刷新。
 */
export const PAGE_SCRIPT_PING = 'BEWLY_PAGE_SCRIPT_PING'
export const PAGE_SCRIPT_IDENTITY = 'BEWLY_PAGE_SCRIPT_IDENTITY'

export interface PageScriptIdentity {
  version: string
  commit?: string
}

/** 页面全局防重入标记；旧版本只写入 `true`，无法得知其版本。 */
export type PageScriptInitializedMarker = boolean | PageScriptIdentity

export type RunningPageScriptIdentity = PageScriptIdentity | 'legacy'

export interface PageScriptIdentityMessage {
  type: typeof PAGE_SCRIPT_IDENTITY
  legacy: boolean
  version?: string
  commit?: string
}

export function isPageScriptIdentity(value: unknown): value is PageScriptIdentity {
  if (typeof value !== 'object' || value === null)
    return false
  const identity = value as Record<string, unknown>
  return typeof identity.version === 'string' && identity.version.length > 0
    && (identity.commit === undefined || typeof identity.commit === 'string')
}

export function createPageScriptIdentityMessage(identity: RunningPageScriptIdentity): PageScriptIdentityMessage {
  return identity === 'legacy'
    ? { type: PAGE_SCRIPT_IDENTITY, legacy: true }
    : { type: PAGE_SCRIPT_IDENTITY, legacy: false, version: identity.version, commit: identity.commit }
}

export function readPageScriptIdentityMessage(value: unknown): RunningPageScriptIdentity | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null
  const message = value as Record<string, unknown>
  if (message.type !== PAGE_SCRIPT_IDENTITY)
    return null
  if (message.legacy === true)
    return 'legacy'
  if (message.legacy !== false || typeof message.version !== 'string' || message.version.length === 0)
    return null
  return {
    version: message.version,
    commit: typeof message.commit === 'string' && message.commit.length > 0 ? message.commit : undefined,
  }
}
