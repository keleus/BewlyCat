// B 站多语言页面在主站路径前追加语言段，例如 /ja/video/BV...、/en/。
// 语言列表取自 B 站页面脚本，匹配时不区分大小写。
// 该模块会被提前执行的小入口引用，保持无依赖。
const BILIBILI_LOCALE_PATH_SEGMENTS = new Set([
  'en',
  'th',
  'vi',
  'id',
  'ja',
  'zh-hant',
  'zh-hans',
  'ar',
  'pt',
  'es',
  'tr',
  'ru',
  'ms',
])

const BILIBILI_LOCALE_HOSTS = new Set(['www.bilibili.com', 'bilibili.com'])

const LOCALE_PATH_PREFIX_PATTERN = /^\/([^/]+)(?=\/|$)/

/**
 * 去掉主站路径中的语言段，使 /ja/video/BV... 与 /video/BV... 按同一页面识别。
 */
export function stripBilibiliLocalePathname(pathname: string): string {
  const segment = pathname.match(LOCALE_PATH_PREFIX_PATTERN)?.[1]
  if (!segment || !BILIBILI_LOCALE_PATH_SEGMENTS.has(segment.toLowerCase()))
    return pathname

  return pathname.slice(segment.length + 1) || '/'
}

/**
 * 返回去掉主站语言段后的 URL；非主站或无法解析的 URL 原样返回。
 */
export function stripBilibiliLocaleUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    if (!BILIBILI_LOCALE_HOSTS.has(urlObj.hostname))
      return url

    const pathname = stripBilibiliLocalePathname(urlObj.pathname)
    if (pathname === urlObj.pathname)
      return url

    urlObj.pathname = pathname
    return urlObj.href
  }
  catch {
    return url
  }
}

/**
 * 当前页面去掉主站语言段后的 pathname，用于路径判断。
 */
export function getBilibiliPathname(url: string = location.href): string {
  return new URL(stripBilibiliLocaleUrl(url)).pathname
}
