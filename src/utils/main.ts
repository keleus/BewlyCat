/**
 * Get cookie by name
 * @param name cookie name
 * @returns cookie value
 */
export function getCookie(name: string): string {
  const value = `; ${document.cookie}`
  const parts: Array<string> = value.split(`; ${name}=`)
  if (parts.length === 2) {
    const result = parts?.pop()?.split(';').shift() || ''
    return result
  }
  return ''
}

/**
 * Set cookie
 * @param name cookie name
 * @param value cookie value
 */
export function setCookie(name: string, value: any, expDays: number) {
  const date = new Date()
  date.setTime(date.getTime() + expDays * 24 * 60 * 60 * 1000)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${value}; ${expires}; domain=.bilibili.com; path=/`
}

/**
 * Get current login user id
 * @returns userId
 */
export const getUserID = (): string => getCookie('DedeUserID')

/**
 * Get csrf token
 */
export const getCSRF = (): string => getCookie('bili_jct')

/**
 * Remove the 'http:' or 'https:' prefix from a URL
 * @param url
 * @returns The result of removing the 'http:' or 'https:' prefix from a url
 */
export function removeHttpFromUrl(url: string): string {
  return url.replace(/^https?:/, '')
}

export function openLinkToNewTab(url: string, features: string = '') {
  window.open(url, '_blank', features)
}

export function isElectron(): boolean {
  if (typeof navigator === 'undefined')
    return false

  // 检测 userAgent
  if (/Electron/i.test(navigator.userAgent))
    return true

  return false
}

/**
 * Convert a hex color value to HSLA, thanks ChatGPT 🫡
 * @param hex hex color value
 * @param alpha color opacity
 * @returns HSLA or HSL color string
 */
export function hexToHSL(hex: string, alpha: number | null = null): string {
  // Remove the hash at the start if it's there
  hex = hex.replace(/^#/, '')

  // Ensure the input is valid
  if (hex.length !== 6) {
    throw new Error('Invalid HEX color.')
  }

  // Parse the r, g, b values
  let r = Number.parseInt(hex.substring(0, 2), 16)
  let g = Number.parseInt(hex.substring(2, 4), 16)
  let b = Number.parseInt(hex.substring(4, 6), 16)

  // Convert r, g, b to percentages
  r /= 255
  g /= 255
  b /= 255

  // Find the greatest and smallest channel values
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h: number = 0
  let s: number = 0
  let l: number = (max + min) / 2

  // Calculate the hue
  if (max === min) {
    h = s = 0 // achromatic
  }
  else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }

    h /= 6
  }

  // Convert to degrees and percentages
  h = Math.round(h * 360)
  s = Math.round(s * 100)
  l = Math.round(l * 100)

  if (alpha !== null)
    return `hsla(${h}, ${s}%, ${l}%, ${alpha})`
  return `hsl(${h}, ${s}%, ${l}%)`
}

/**
 * Smooth scroll to the top of the html element
 */
export function scrollToTop(element: HTMLElement, targetScrollTop = 0 as number) {
  // cancel if already on top
  if (element.scrollTop === targetScrollTop)
    return

  element.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth',
  })
}

export function injectCSS(css: string, element: HTMLElement | ShadowRoot = document.documentElement): HTMLStyleElement {
  const el = document.createElement('style')
  el.setAttribute('rel', 'stylesheet')
  el.textContent = css
  element.appendChild(el)
  return el
}

/**
 * delay
 * @param ms milliseconds delay time
 */
export function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Check if the current page is the home page
 * @param url the url to check
 * @returns true if the current page is the home page
 */
export function isHomePage(url: string = location.href): boolean {
  if (
    /https?:\/\/(?:www\.)?bilibili.com\/?(?:#\/?)?$/.test(url)
    || /https?:\/\/(?:www\.)?bilibili.com\/index\.html$/.test(url)
    || /https?:\/\/(?:www\.)?bilibili.com\/\?spm_id_from=.*/.test(url)
    || /https?:\/\/www\.bilibili\.com\/\?.*$/.test(url)
  ) {
    return true
  }
  return false
}

/**
 * Check if the current page is a video or bangumi page
 * @param url the url to check
 * @returns true if the current page is a video or bangumi page
 */
export function isVideoOrBangumiPage(url: string = location.href): boolean {
  if (
    // video page
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:video|list)\/.*/.test(url)
    // anime playback & movie page
    || /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/.*/.test(url)
    // watch later playlist
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/watchlater\?(?:bvid|avid).*/.test(url)
    // favorite playlist
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/ml.*/.test(url)
    || /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(url)
  ) {
    return true
  }
  return false
}

/**
 * Check if the current page is the notifications page
 * @param url the url to check
 * @returns true if the current page is the notifications page
 */
export function isNotificationPage(url: string = location.href): boolean {
  if (
    /https?:\/\/message\.bilibili\.com\.*/.test(url)
  ) {
    return true
  }
  return false
}

/**
 * Check if the current page is a search results page
 * @param url the url to check
 * @returns true if the current page is a search results page
 */
export function isSearchResultsPage(url: string = location.href): boolean {
  // 检查是否是 B站原生搜索结果页
  if (/https?:\/\/search\.bilibili\.com\/.*/.test(url)) {
    return true
  }
  // 检查是否是插件搜索结果页（URL 中带 page=Search 参数）
  const urlObj = new URL(url)
  if (urlObj.searchParams.get('page') === 'Search') {
    return true
  }
  return false
}

/**
 * Check if the current page is a user space page
 * @param url the url to check
 * @returns true if the current page is a user space page
 */
export function isUserSpacePage(url: string = location.href): boolean {
  if (
    /https?:\/\/space\.bilibili\.com\.*/.test(url)
  ) {
    return true
  }
  return false
}

/**
 * Compresses and resizes an image file.
 *
 * @param file - The image file to compress and resize.
 * @param maxWidth - The maximum width of the resized image.
 * @param maxHeight - The maximum height of the resized image.
 * @param quality - The quality of the compressed image (0-1).
 * @param callback - The callback function to execute with the compressed file.
 */
export function compressAndResizeImage(file: File, maxWidth: number, maxHeight: number, quality: number, callback: any) {
  // Create an Image object
  const img = new Image()

  // Create a FileReader to read the file
  const reader = new FileReader()
  reader.onload = function (e) {
    img.src = e.target?.result as string

    img.onload = function () {
      // Create a canvas
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      // Calculate new size
      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round(height * maxWidth / width)
          width = maxWidth
        }
      }
      else {
        if (height > maxHeight) {
          width = Math.round(width * maxHeight / height)
          height = maxHeight
        }
      }

      // Set canvas dimensions
      canvas.width = width
      canvas.height = height

      if (!ctx) {
        console.error('compressAndResizeImage => ctx is null')
        return
      }

      // Draw the image on the canvas
      ctx.drawImage(img, 0, 0, width, height)

      // Compress the image
      canvas.toBlob((blob) => {
        // Create a new blob file
        const compressedFile = new File([blob as Blob], file.name, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        })

        // Execute the callback with the new compressed file
        callback(compressedFile)
      }, 'image/jpeg', quality)
    }
  }

  // Read the file as a Data URL (base64)
  reader.readAsDataURL(file)
}

/**
 * Generate a blurred version of an image for better performance
 * @param imageUrl - The original image URL (can be http/https/data URI)
 * @param blurRadius - The blur radius in pixels (recommended: 40-80 for wallpapers)
 * @param scale - Scale factor for performance optimization (0.3-0.5 recommended)
 * @returns Promise<string> - Base64 data URL of the blurred image
 */
export async function generateBlurredWallpaper(
  imageUrl: string,
  blurRadius: number = 60,
  scale: number = 0.4,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // Handle CORS for external images

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { alpha: false })

        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Scale down for better performance (user won't notice on blurred background)
        const scaledWidth = Math.floor(img.width * scale)
        const scaledHeight = Math.floor(img.height * scale)

        canvas.width = scaledWidth
        canvas.height = scaledHeight

        // Apply blur using CSS filter (GPU accelerated during rendering)
        ctx.filter = `blur(${blurRadius * scale}px)`

        // Draw the scaled and blurred image
        ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight)

        // Convert to base64 with compression
        const blurredDataUrl = canvas.toDataURL('image/jpeg', 0.7)
        resolve(blurredDataUrl)
      }
      catch (error) {
        reject(error)
      }
    }

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imageUrl}`))
    }

    img.src = imageUrl
  })
}

/**
 * Compare two versions
 * @param version1
 * @param version2
 * @returns 1 if version1 is greater than version2, -1 if version1 is less than version2, 0 if version1 is equal to version2
 */
export function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number)
  const v2Parts = version2.split('.').map(Number)

  // Determine the longer length for iteration
  const maxLength = Math.max(v1Parts.length, v2Parts.length)

  for (let i = 0; i < maxLength; i++) {
    const num1 = v1Parts[i] || 0 // Defaults to 0 if undefined
    const num2 = v2Parts[i] || 0 // Defaults to 0 if undefined

    if (num1 > num2)
      return 1
    if (num1 < num2)
      return -1
  }

  return 0 // Versions are equal
}

export function queryDomUntilFound(selector: string, timeout = 500, abort?: AbortController): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const element = document.querySelector(selector)
      if (element) {
        clearInterval(interval)
        resolve(element as HTMLElement)
      }
    }, timeout)

    if (abort) {
      abort.signal.addEventListener('abort', () => {
        clearInterval(interval)
        resolve(null)
      })
    }
  })
}

/**
 * Check if the current page is in an iframe
 * @returns true if the current page is in an iframe
 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top
  }
  catch {
    // If we can't access window.top due to security restrictions,
    // we're definitely in an iframe
    return true
  }
}

/**
 * Bilibili tracking parameters to be removed from URLs
 */
const BILIBILI_TRACKING_PARAMS = [
  'spm_id_from',
  'vd_source',
  'share_source',
  'share_medium',
  'share_plat',
  'share_session_id',
  'share_tag',
  'share_times',
  'unique_k',
  'bbid',
  'ts',
  'from_source',
  'from_spmid',
  'from',
  'buvid',
  'is_story_h5',
  'mid',
  'p',
  'plat_id',
  'share_from',
  'timestamp',
  'csource',
  'launch_id',
  '-Arouter',
]

/**
 * Clean a Bilibili URL by removing tracking parameters
 * @param url the URL to clean
 * @returns the cleaned URL
 */
export function cleanBilibiliUrl(url: string): string {
  try {
    const urlObj = new URL(url)

    // Only clean bilibili.com URLs
    if (!urlObj.hostname.includes('bilibili.com') && !urlObj.hostname.includes('b23.tv'))
      return url

    // Remove tracking parameters
    for (const param of BILIBILI_TRACKING_PARAMS) {
      urlObj.searchParams.delete(param)
    }

    // If no search params left, return URL without trailing ?
    let cleanedUrl = urlObj.toString()
    if (urlObj.searchParams.toString() === '')
      cleanedUrl = cleanedUrl.replace(/\?$/, '')

    return cleanedUrl
  }
  catch {
    return url
  }
}

/**
 * Clean the share text from Bilibili's share button
 * Bilibili share text format: 【Title】 URL
 * @param text the share text to clean
 * @param options options for cleaning
 * @returns the cleaned share text
 */
export function cleanBilibiliShareText(
  text: string,
  options: { includeTitle?: boolean, removeTrackingParams?: boolean } = {},
): string {
  const { includeTitle = false, removeTrackingParams = true } = options

  // Match Bilibili share text format: 【Title】 URL
  const shareTextRegex = /【(.+?)】\s*(https?:\/\/\S+)/
  const match = text.match(shareTextRegex)

  if (match) {
    const title = match[1]
    let url = match[2]

    if (removeTrackingParams)
      url = cleanBilibiliUrl(url)

    if (includeTitle)
      return `${title} ${url}`

    return url
  }

  // If it doesn't match the share format, try to clean URLs in the text
  const urlRegex = /(https?:\/\/\S+)/g
  if (removeTrackingParams) {
    return text.replace(urlRegex, (url) => {
      return cleanBilibiliUrl(url)
    })
  }

  return text
}
