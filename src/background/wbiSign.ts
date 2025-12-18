// WBI签名重排映射表
const MIXIN_KEY_ENC_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]

// WBI密钥缓存
interface WbiKeys {
  imgKey: string
  subKey: string
  timestamp: number
}

// nav 接口获取的密钥缓存
let wbiKeysCache: WbiKeys | null = null

// 正在获取密钥的Promise，用于避免并发重复获取
let fetchingKeysPromise: Promise<boolean> | null = null

/**
 * 简单的MD5实现（用于WBI签名）
 */
function md5(text: string): string {
  function rotateLeft(value: number, amount: number): number {
    return (value << amount) | (value >>> (32 - amount))
  }

  function addUnsigned(x: number, y: number): number {
    const result = (x & 0x7FFFFFFF) + (y & 0x7FFFFFFF)
    if ((x & 0x80000000) !== 0 || (y & 0x80000000) !== 0) {
      if ((result & 0x80000000) !== 0) {
        return (result ^ 0x80000000) | 0x80000000
      }
      else {
        return result | 0x80000000
      }
    }
    return result
  }

  function f(x: number, y: number, z: number): number {
    return (x & y) | ((~x) & z)
  }

  function g(x: number, y: number, z: number): number {
    return (x & z) | (y & (~z))
  }

  function h(x: number, y: number, z: number): number {
    return x ^ y ^ z
  }

  function i(x: number, y: number, z: number): number {
    return y ^ (x | (~z))
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(f(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(g(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(h(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(i(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }

  function convertToWordArray(text: string): number[] {
    const wordArray: number[] = []
    const stringLength = text.length
    const numberOfWords = ((stringLength + 8 - ((stringLength + 8) % 64)) / 64 + 1) * 16
    for (let wordCount = 0; wordCount < numberOfWords; wordCount++) {
      wordArray[wordCount] = 0
    }
    let bytePosition = 0
    let byteCount = 0
    while (byteCount < stringLength) {
      wordArray[bytePosition] = (wordArray[bytePosition] | (text.charCodeAt(byteCount) << (8 * (byteCount % 4)))) >>> 0
      if ((byteCount % 4) === 3)
        bytePosition++
      byteCount++
    }
    wordArray[bytePosition] = (wordArray[bytePosition] | (0x80 << (8 * (byteCount % 4)))) >>> 0
    wordArray[numberOfWords - 2] = stringLength << 3
    wordArray[numberOfWords - 1] = stringLength >>> 29
    return wordArray
  }

  function wordToHex(value: number): string {
    let result = ''
    for (let count = 0; count <= 3; count++) {
      const byte = (value >>> (count * 8)) & 255
      result += (byte < 16 ? '0' : '') + byte.toString(16)
    }
    return result
  }

  const x = convertToWordArray(text)
  let a = 0x67452301
  let b = 0xEFCDAB89
  let c = 0x98BADCFE
  let d = 0x10325476

  for (let k = 0; k < x.length; k += 16) {
    const AA = a
    const BB = b
    const CC = c
    const DD = d
    a = ff(a, b, c, d, x[k + 0], 7, 0xD76AA478)
    d = ff(d, a, b, c, x[k + 1], 12, 0xE8C7B756)
    c = ff(c, d, a, b, x[k + 2], 17, 0x242070DB)
    b = ff(b, c, d, a, x[k + 3], 22, 0xC1BDCEEE)
    a = ff(a, b, c, d, x[k + 4], 7, 0xF57C0FAF)
    d = ff(d, a, b, c, x[k + 5], 12, 0x4787C62A)
    c = ff(c, d, a, b, x[k + 6], 17, 0xA8304613)
    b = ff(b, c, d, a, x[k + 7], 22, 0xFD469501)
    a = ff(a, b, c, d, x[k + 8], 7, 0x698098D8)
    d = ff(d, a, b, c, x[k + 9], 12, 0x8B44F7AF)
    c = ff(c, d, a, b, x[k + 10], 17, 0xFFFF5BB1)
    b = ff(b, c, d, a, x[k + 11], 22, 0x895CD7BE)
    a = ff(a, b, c, d, x[k + 12], 7, 0x6B901122)
    d = ff(d, a, b, c, x[k + 13], 12, 0xFD987193)
    c = ff(c, d, a, b, x[k + 14], 17, 0xA679438E)
    b = ff(b, c, d, a, x[k + 15], 22, 0x49B40821)
    a = gg(a, b, c, d, x[k + 1], 5, 0xF61E2562)
    d = gg(d, a, b, c, x[k + 6], 9, 0xC040B340)
    c = gg(c, d, a, b, x[k + 11], 14, 0x265E5A51)
    b = gg(b, c, d, a, x[k + 0], 20, 0xE9B6C7AA)
    a = gg(a, b, c, d, x[k + 5], 5, 0xD62F105D)
    d = gg(d, a, b, c, x[k + 10], 9, 0x2441453)
    c = gg(c, d, a, b, x[k + 15], 14, 0xD8A1E681)
    b = gg(b, c, d, a, x[k + 4], 20, 0xE7D3FBC8)
    a = gg(a, b, c, d, x[k + 9], 5, 0x21E1CDE6)
    d = gg(d, a, b, c, x[k + 14], 9, 0xC33707D6)
    c = gg(c, d, a, b, x[k + 3], 14, 0xF4D50D87)
    b = gg(b, c, d, a, x[k + 8], 20, 0x455A14ED)
    a = gg(a, b, c, d, x[k + 13], 5, 0xA9E3E905)
    d = gg(d, a, b, c, x[k + 2], 9, 0xFCEFA3F8)
    c = gg(c, d, a, b, x[k + 7], 14, 0x676F02D9)
    b = gg(b, c, d, a, x[k + 12], 20, 0x8D2A4C8A)
    a = hh(a, b, c, d, x[k + 5], 4, 0xFFFA3942)
    d = hh(d, a, b, c, x[k + 8], 11, 0x8771F681)
    c = hh(c, d, a, b, x[k + 11], 16, 0x6D9D6122)
    b = hh(b, c, d, a, x[k + 14], 23, 0xFDE5380C)
    a = hh(a, b, c, d, x[k + 1], 4, 0xA4BEEA44)
    d = hh(d, a, b, c, x[k + 4], 11, 0x4BDECFA9)
    c = hh(c, d, a, b, x[k + 7], 16, 0xF6BB4B60)
    b = hh(b, c, d, a, x[k + 10], 23, 0xBEBFBC70)
    a = hh(a, b, c, d, x[k + 13], 4, 0x289B7EC6)
    d = hh(d, a, b, c, x[k + 0], 11, 0xEAA127FA)
    c = hh(c, d, a, b, x[k + 3], 16, 0xD4EF3085)
    b = hh(b, c, d, a, x[k + 6], 23, 0x4881D05)
    a = hh(a, b, c, d, x[k + 9], 4, 0xD9D4D039)
    d = hh(d, a, b, c, x[k + 12], 11, 0xE6DB99E5)
    c = hh(c, d, a, b, x[k + 15], 16, 0x1FA27CF8)
    b = hh(b, c, d, a, x[k + 2], 23, 0xC4AC5665)
    a = ii(a, b, c, d, x[k + 0], 6, 0xF4292244)
    d = ii(d, a, b, c, x[k + 7], 10, 0x432AFF97)
    c = ii(c, d, a, b, x[k + 14], 15, 0xAB9423A7)
    b = ii(b, c, d, a, x[k + 5], 21, 0xFC93A039)
    a = ii(a, b, c, d, x[k + 12], 6, 0x655B59C3)
    d = ii(d, a, b, c, x[k + 3], 10, 0x8F0CCC92)
    c = ii(c, d, a, b, x[k + 10], 15, 0xFFEFF47D)
    b = ii(b, c, d, a, x[k + 1], 21, 0x85845DD1)
    a = ii(a, b, c, d, x[k + 8], 6, 0x6FA87E4F)
    d = ii(d, a, b, c, x[k + 15], 10, 0xFE2CE6E0)
    c = ii(c, d, a, b, x[k + 6], 15, 0xA3014314)
    b = ii(b, c, d, a, x[k + 13], 21, 0x4E0811A1)
    a = ii(a, b, c, d, x[k + 4], 6, 0xF7537E82)
    d = ii(d, a, b, c, x[k + 11], 10, 0xBD3AF235)
    c = ii(c, d, a, b, x[k + 2], 15, 0x2AD7D2BB)
    b = ii(b, c, d, a, x[k + 9], 21, 0xEB86D391)
    a = addUnsigned(a, AA)
    b = addUnsigned(b, BB)
    c = addUnsigned(c, CC)
    d = addUnsigned(d, DD)
  }

  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase()
}

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
export function storeWbiKeys(imgUrl: string, subUrl: string): void {
  const imgKey = extractKeyFromUrl(imgUrl)
  const subKey = extractKeyFromUrl(subUrl)

  if (imgKey && subKey) {
    wbiKeysCache = {
      imgKey,
      subKey,
      timestamp: Date.now(),
    }
    console.log('[WBI] Stored keys from nav interface')
  }
}

/**
 * 获取WBI密钥（如果缓存过期则返回null）
 */
export function getWbiKeys(): WbiKeys | null {
  const now = Date.now()
  const maxAge = 24 * 60 * 60 * 1000 // 24小时

  if (wbiKeysCache) {
    const cacheAge = now - wbiKeysCache.timestamp
    if (cacheAge <= maxAge) {
      return wbiKeysCache
    }
    // 密钥过期，清除
    wbiKeysCache = null
  }

  return null
}

/**
 * 清除 WBI 密钥缓存
 */
export function clearWbiKeys(): void {
  wbiKeysCache = null
  console.log('[WBI] Cleared WBI keys cache')
}

/**
 * 为参数添加WBI签名
 */
export function addWbiSign(params: Record<string, any>): Record<string, any> {
  const keys = getWbiKeys()
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
export async function initWbiKeys(): Promise<boolean> {
  // 如果已经有密钥且未过期，直接返回成功
  if (getWbiKeys()) {
    return true
  }

  // 如果正在获取中，等待当前获取完成
  if (fetchingKeysPromise) {
    return await fetchingKeysPromise
  }

  // 开始新的获取流程
  fetchingKeysPromise = (async () => {
    try {
      // 获取B站cookie
      const cookieStr = await getBilibiliCookies()

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
        credentials: 'include',
      })
      const navData = await navResponse.json()

      // 无论是否登录，nav接口都应该返回wbi_img
      if (navData.code === 0 && navData.data && navData.data.wbi_img) {
        const { img_url, sub_url } = navData.data.wbi_img
        if (img_url && sub_url) {
          storeWbiKeys(img_url, sub_url)
          return true
        }
      }
      // 未登录状态下也有 wbi_img
      else if (navData.code === -101 && navData.data && navData.data.wbi_img) {
        const { img_url, sub_url } = navData.data.wbi_img
        if (img_url && sub_url) {
          storeWbiKeys(img_url, sub_url)
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
      fetchingKeysPromise = null
    }
  })()

  return await fetchingKeysPromise
}

/**
 * 检查是否需要WBI签名的URL
 */
export function needsWbiSign(url: string): boolean {
  // 排除nav接口
  if (url.includes('https://api.bilibili.com/x/web-interface/nav'))
    return false
  // 排除bili_ticket接口
  if (url.includes('https://api.bilibili.com/x/web-interface/bili_ticket'))
    return false
  // 排除推荐接口（ForYou页面）- 这些接口不需要WBI签名
  if (url.includes('https://api.bilibili.com/x/web-interface/index/top/feed/rcmd'))
    return false
  if (url.includes('https://api.bilibili.com/x/web-interface/popular'))
    return false

  // 需要WBI签名的API接口
  const wbiApiPatterns = [
    /^https:\/\/api\.bilibili\.com\/x\/space\/wbi\//, // 明确的WBI端点
    /^https:\/\/api\.bilibili\.com\/x\/player\/wbi\//, // 播放器WBI端点
    /^https:\/\/api\.bilibili\.com\/x\/wbi\//, // 其他WBI端点
  ]

  return wbiApiPatterns.some(pattern => pattern.test(url))
}
