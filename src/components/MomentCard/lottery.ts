/** Only official lottery pages may be embedded; winner-list links use the same viewer. */
export function isMomentLotteryUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://www.bilibili.com')
    return url.protocol === 'https:' && (
      (url.hostname === 'www.bilibili.com' && url.pathname === '/h5/lottery/result')
      || (url.hostname === 't.bilibili.com' && url.pathname.startsWith('/lottery/h5/index/'))
    )
  }
  catch {
    return false
  }
}
