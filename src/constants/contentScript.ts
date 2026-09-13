export const CONTENT_SCRIPT_HOSTS = [
  'www.bilibili.com',
  'search.bilibili.com',
  't.bilibili.com',
  'space.bilibili.com',
  'message.bilibili.com',
  'member.bilibili.com',
  'account.bilibili.com',
  'www.hdslb.com',
  'passport.bilibili.com',
  'music.bilibili.com',
] as const

export const CONTENT_SCRIPT_MATCHES = CONTENT_SCRIPT_HOSTS.map(host => `*://${host}/*`)

export const CONTENT_SCRIPT_EXCLUDE_MATCHES = [
  '*://www.bilibili.com/match/game*',
  '*://www.bilibili.com/toy*',
]

export const CONTENT_SCRIPT_PING = 'bewly-cat:content-script:ping'
export const CONTENT_SCRIPT_PONG = 'bewly-cat:content-script:ready'
export const REFRESH_ALL_CONTENT_SCRIPT_TABS = 'bewly-cat:content-script:refresh-all-tabs'
// manifest 生成脚本也会直接导入本模块，此时尚未注入编译常量。
export const CONTENT_SCRIPT_COMMIT = typeof __BUILD_COMMIT__ === 'undefined' ? undefined : (__BUILD_COMMIT__ || undefined)

export interface ContentScriptIdentity {
  name: string
  runtimeUrl: string
  version: string
  commit?: string
}

export interface ContentScriptPong extends ContentScriptIdentity {
  type: typeof CONTENT_SCRIPT_PONG
}

export function isContentScriptPong(value: unknown): value is ContentScriptPong {
  if (typeof value !== 'object' || value === null)
    return false

  const pong = value as Record<string, unknown>
  return pong.type === CONTENT_SCRIPT_PONG
    && typeof pong.name === 'string'
    && pong.name.length > 0
    && typeof pong.runtimeUrl === 'string'
    && pong.runtimeUrl.length > 0
    && typeof pong.version === 'string'
    && pong.version.length > 0
    && (pong.commit === undefined || (typeof pong.commit === 'string' && /^[\da-f]{40,64}$/i.test(pong.commit)))
}

const CONTENT_SCRIPT_HOST_SET = new Set<string>(CONTENT_SCRIPT_HOSTS)

export function isContentScriptTargetUrl(value?: string): boolean {
  if (!value)
    return false

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return false

    if (!CONTENT_SCRIPT_HOST_SET.has(url.hostname))
      return false

    return url.hostname !== 'www.bilibili.com'
      || (!url.pathname.startsWith('/match/game') && !url.pathname.startsWith('/toy'))
  }
  catch {
    return false
  }
}
