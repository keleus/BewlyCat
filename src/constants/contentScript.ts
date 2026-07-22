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
