import md5 from 'md5'

// WBI签名重排映射表
const MIXIN_KEY_ENC_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]

// WBI密钥缓存
interface WbiKeys {
  imgKey: string
  subKey: string
  timestamp: number
}

interface WbiKeyOptions {
  noCookie?: boolean
}

const BILIBILI_API_ORIGIN = 'https://api.bilibili.com'
const NAV_PATH = '/x/web-interface/nav'
const BILI_TICKET_PATH = '/x/web-interface/bili_ticket'
const FEEDBACK_DISLIKE_PATH = '/x/web-interface/feedback/dislike'

/**
 * Parse an API URL only when it points at the exact Bilibili API origin.
 */
export function parseBilibiliApiUrl(url: string): URL | null {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.origin === BILIBILI_API_ORIGIN ? parsedUrl : null
  }
  catch {
    return null
  }
}

/**
 * Check whether a URL targets the nav endpoint (query parameters are allowed).
 */
export function isBilibiliNavUrl(url: string): boolean {
  return parseBilibiliApiUrl(url)?.pathname === NAV_PATH
}

// 登录态和匿名态的 nav 请求可能返回不同密钥，必须分别缓存。
let authenticatedWbiKeysCache: WbiKeys | null = null
let anonymousWbiKeysCache: WbiKeys | null = null

// 正在获取密钥的Promise，用于避免并发重复获取
let fetchingKeysPromise: Promise<boolean> | null = null
let fetchingNoCookieKeysPromise: Promise<boolean> | null = null

/**
 * 从URL中提取文件名（不含扩展名）
 */
function extractKeyFromUrl(url: string): string {
  const match = url.match(/\/([^/]+)\.png$/)
  return match ? match[1] : ''
}

/**
 * 生成混合密钥
 */
function generateMixinKey(imgKey: string, subKey: string): string {
  const rawWbiKey = imgKey + subKey
  let mixinKey = ''

  for (let i = 0; i < 32; i++) {
    mixinKey += rawWbiKey[MIXIN_KEY_ENC_TAB[i]]
  }

  return mixinKey
}

/**
 * 对参数进行URL编码（符合WBI要求）
 * 注意：根据官方规范，需要先过滤掉 !'()* 字符，然后再进行URL编码
 */
function encodeWbiParam(value: any): string {
  // 先过滤掉 !'()* 字符
  const filtered = String(value).replace(/[!'()*]/g, '')
  // 再进行URL编码
  return encodeURIComponent(filtered)
}

/**
 * 存储WBI密钥（从 nav 接口获取）
 */
export function storeWbiKeys(imgUrl: string, subUrl: string, options: WbiKeyOptions = {}): void {
  const imgKey = extractKeyFromUrl(imgUrl)
  const subKey = extractKeyFromUrl(subUrl)

  if (imgKey && subKey) {
    const keys = {
      imgKey,
      subKey,
      timestamp: Date.now(),
    }
    if (options.noCookie)
      anonymousWbiKeysCache = keys
    else
      authenticatedWbiKeysCache = keys
    console.log(`[WBI] Stored ${options.noCookie ? 'anonymous' : 'authenticated'} keys from nav interface`)
  }
}

/**
 * 获取WBI密钥（如果缓存过期则返回null）
 */
export function getWbiKeys(options: WbiKeyOptions = {}): WbiKeys | null {
  const now = Date.now()
  const maxAge = 24 * 60 * 60 * 1000 // 24小时
  const keys = options.noCookie ? anonymousWbiKeysCache : authenticatedWbiKeysCache

  if (keys) {
    const cacheAge = now - keys.timestamp
    if (cacheAge <= maxAge) {
      return keys
    }
    // 密钥过期，清除
    if (options.noCookie)
      anonymousWbiKeysCache = null
    else
      authenticatedWbiKeysCache = null
  }

  return null
}

/**
 * 清除 WBI 密钥缓存
 */
export function clearWbiKeys(options: WbiKeyOptions = {}): void {
  if (options.noCookie)
    anonymousWbiKeysCache = null
  else
    authenticatedWbiKeysCache = null
  console.log(`[WBI] Cleared ${options.noCookie ? 'anonymous' : 'authenticated'} WBI keys cache`)
}

/**
 * 为参数添加WBI签名
 */
export function addWbiSign(params: Record<string, any>, options: WbiKeyOptions = {}): Record<string, any> {
  const keys = getWbiKeys(options)
  if (!keys) {
    // 如果没有密钥，返回原参数
    return params
  }

  // 添加时间戳
  const wts = Math.floor(Date.now() / 1000)
  const signParams = { ...params, wts }

  // 按键名升序排序
  const sortedKeys = Object.keys(signParams).sort()

  // 构建查询字符串
  const queryParts: string[] = []
  for (const key of sortedKeys) {
    const value = signParams[key]
    // 过滤空值参数：undefined、null、空字符串
    // 保留数字 0 和布尔值 false
    if (value !== undefined && value !== null && value !== '') {
      queryParts.push(`${encodeWbiParam(key)}=${encodeWbiParam(value)}`)
    }
  }

  const queryString = queryParts.join('&')

  // 生成混合密钥
  const mixinKey = generateMixinKey(keys.imgKey, keys.subKey)

  // 计算签名
  const w_rid = md5(queryString + mixinKey)

  return {
    ...signParams,
    w_rid,
  }
}

/**
 * 获取B站的cookie并组装成字符串
 */
async function getBilibiliCookies(): Promise<string> {
  try {
    // 动态导入 browser，避免在非浏览器环境下报错
    const browser = await import('webextension-polyfill').then(m => m.default)
    const cookies = await browser.cookies.getAll({
      domain: '.bilibili.com',
    })
    return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
  }
  catch {
    return ''
  }
}

/**
 * 初始化WBI密钥（从nav接口获取）
 * 应该在扩展启动时调用
 * 使用单例模式避免并发重复获取
 */
export async function initWbiKeys(options: WbiKeyOptions = {}): Promise<boolean> {
  const noCookie = options.noCookie === true

  // 如果已经有密钥且未过期，直接返回成功
  if (getWbiKeys(options)) {
    return true
  }

  // 如果正在获取中，等待当前获取完成
  if (noCookie) {
    if (fetchingNoCookieKeysPromise)
      return await fetchingNoCookieKeysPromise
  }
  else if (fetchingKeysPromise) {
    return await fetchingKeysPromise
  }

  // 开始新的获取流程
  const fetchPromise = (async () => {
    try {
      // 获取B站cookie
      const cookieStr = noCookie ? '' : await getBilibiliCookies()

      const headers: HeadersInit = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
      }

      // 如果有cookie，添加到请求头
      if (cookieStr) {
        headers.Cookie = cookieStr
      }

      const navResponse = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        method: 'GET',
        headers,
        credentials: noCookie ? 'omit' : 'include',
      })
      const navData = await navResponse.json()

      // 无论是否登录，nav接口都应该返回wbi_img
      if (navData.code === 0 && navData.data && navData.data.wbi_img) {
        const { img_url, sub_url } = navData.data.wbi_img
        if (img_url && sub_url) {
          storeWbiKeys(img_url, sub_url, options)
          return true
        }
      }
      // 未登录状态下也有 wbi_img
      else if (navData.code === -101 && navData.data && navData.data.wbi_img) {
        const { img_url, sub_url } = navData.data.wbi_img
        if (img_url && sub_url) {
          storeWbiKeys(img_url, sub_url, options)
          return true
        }
      }
      console.warn('[WBI] WBI keys not found in nav response')
      return false
    }
    catch (error) {
      console.error('[WBI] Failed to initialize WBI keys:', error)
      return false
    }
    finally {
      // 清除获取中的Promise标志
      if (noCookie)
        fetchingNoCookieKeysPromise = null
      else
        fetchingKeysPromise = null
    }
  })()

  if (noCookie)
    fetchingNoCookieKeysPromise = fetchPromise
  else
    fetchingKeysPromise = fetchPromise

  return await fetchPromise
}

/**
 * 检查是否需要WBI签名的URL
 */
export function needsWbiSign(url: string): boolean {
  const parsedUrl = parseBilibiliApiUrl(url)
  if (!parsedUrl)
    return false

  const { pathname } = parsedUrl

  // 排除nav接口
  if (pathname === NAV_PATH)
    return false
  // 排除bili_ticket接口
  if (pathname === BILI_TICKET_PATH)
    return false
  // 首页推荐的 web dislike 接口也要求附带 w_rid/wts
  if (pathname === FEEDBACK_DISLIKE_PATH)
    return true

  // WBI签名判断规则：
  // 1. URL中明确包含 /wbi/
  // 2. 匹配 /x/.../v1/、/x/.../v2/、/x/.../v3/ 模式（/.../可以是直接连着的，如/x/v2/）
  if (pathname.includes('/wbi/'))
    return true

  // 匹配版本号路径：/x/任意内容/v1/ 或 /x/任意内容/v2/ 或 /x/任意内容/v3/
  const versionPattern = /\/x\/.*\/v[123]\//
  return versionPattern.test(pathname)
}
