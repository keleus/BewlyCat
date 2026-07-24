export const BILIBILI_DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export function isBilibiliWwwUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.hostname === 'www.bilibili.com'
  }
  catch {
    return false
  }
}

export function isPreventMobileRedirectEnabled(value: unknown): boolean {
  if (typeof value === 'string') {
    try {
      return isPreventMobileRedirectEnabled(JSON.parse(value))
    }
    catch {
      return false
    }
  }

  return typeof value === 'object'
    && value !== null
    && (value as Record<string, unknown>).preventMobileRedirect === true
}
