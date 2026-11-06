// B 站多语言页面会在主站及动态、空间等子站路径前追加语言段，例如 /ja/video/BV...、/zh-Hans/2/dynamic。
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

const BILIBILI_LOCALE_HOSTS = new Set(['www.bilibili.com', 'bilibili.com', 't.bilibili.com', 'space.bilibili.com'])

const LOCALE_PATH_PREFIX_PATTERN = /^\/([^/]+)(?=\/|$)/

// 主站中会按语言段渲染的页面。番剧页会 307 去掉语言段，专栏、动态、课堂等加语言段后 404，不能统一追加。
const BILIBILI_LOCALIZED_TARGET_HOSTS = new Set(['www.bilibili.com', 'bilibili.com'])
const BILIBILI_LOCALIZED_PATH_PATTERN = /^\/(?:video|list)\//

// B 站网页只对这些语言默认开启标题翻译，用户可通过 always_translate=0 的 Cookie 关闭。
const BILIBILI_ALWAYS_TRANSLATE_LANGUAGES = new Set(['en', 'ja', 'es', 'pt', 'id', 'th', 'ar'])
const BILIBILI_ORIGINAL_TITLE_KEY = 'bewlyOriginalTitle'

function getPageLocaleSegment(): string {
  try {
    const { hostname, pathname } = new URL(location.href)
    if (!BILIBILI_LOCALE_HOSTS.has(hostname))
      return ''

    const segment = pathname.match(LOCALE_PATH_PREFIX_PATTERN)?.[1]
    return segment && BILIBILI_LOCALE_PATH_SEGMENTS.has(segment.toLowerCase()) ? segment : ''
  }
  catch {
    return ''
  }
}

/**
 * 生成当前页面语言对应的 x-bili-locale-json 请求参数，取值规则与 B 站网页一致；页面没有语言段时返回空字符串。
 */
export function getBilibiliLocaleRequestParam(): string {
  const segment = getPageLocaleSegment().toLowerCase()
  if (!segment)
    return ''

  const { language, script, region } = new Intl.Locale(segment)
  const alwaysTranslate = document.cookie.match(/(?:^|;\s*)always_translate=([^;]*)/)?.[1]
  return JSON.stringify({
    c_locale: { language, script, region },
    always_translate: BILIBILI_ALWAYS_TRANSLATE_LANGUAGES.has(language) && (!alwaysTranslate || alwaysTranslate === '1'),
  })
}

/**
 * 用接口返回的 translated_title 替换响应中的 title，原标题另存供关键词过滤等逻辑使用。
 * 搜索结果的 title 带关键词高亮且已是译文，保持原样。
 */
export function applyBilibiliTranslatedTitles<T>(data: T): T {
  if (Array.isArray(data)) {
    data.forEach(applyBilibiliTranslatedTitles)
  }
  else if (data && typeof data === 'object') {
    const item = data as Record<string, unknown>
    if (typeof item.translated_title === 'string' && item.translated_title && typeof item.title === 'string' && !item.title.includes('<em')) {
      item[BILIBILI_ORIGINAL_TITLE_KEY] = item.title
      item.title = item.translated_title
    }
    Object.values(item).forEach(applyBilibiliTranslatedTitles)
  }
  return data
}

/** 读取翻译前的标题；未翻译时即 title。 */
export function getBilibiliOriginalTitle(item: any): string | undefined {
  return item?.[BILIBILI_ORIGINAL_TITLE_KEY] ?? item?.title
}

/**
 * 将当前页面的语言段带到视频地址上，使插件打开的页面与 B 站原生链接一样按该语言翻译。
 * B 站只从路径首段判断语言，当前页面没有语言段或目标页面不支持时原样返回。
 */
export function localizeBilibiliUrl(url: string): string {
  const locale = getPageLocaleSegment()
  if (!locale)
    return url

  try {
    const urlObj = new URL(url, location.href)
    if (!BILIBILI_LOCALIZED_TARGET_HOSTS.has(urlObj.hostname) || !BILIBILI_LOCALIZED_PATH_PATTERN.test(urlObj.pathname))
      return url

    urlObj.pathname = `/${locale}${urlObj.pathname}`
    return urlObj.href
  }
  catch {
    return url
  }
}

/**
 * 去掉路径中的语言段，使 /ja/video/BV... 与 /video/BV... 按同一页面识别。
 */
export function stripBilibiliLocalePathname(pathname: string): string {
  const segment = pathname.match(LOCALE_PATH_PREFIX_PATTERN)?.[1]
  if (!segment || !BILIBILI_LOCALE_PATH_SEGMENTS.has(segment.toLowerCase()))
    return pathname

  return pathname.slice(segment.length + 1) || '/'
}

/**
 * 返回去掉语言段后的 URL；非受支持站点或无法解析的 URL 原样返回。
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
