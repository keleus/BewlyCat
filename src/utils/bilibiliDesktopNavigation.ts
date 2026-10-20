export const BILIBILI_DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface BilibiliDesktopNavigatorValues {
  userAgent: string
  appVersion: string
  platform: string
  /** 仅 Firefox 提供 navigator.oscpu */
  oscpu?: string
}

/**
 * 防止跳转移动端使用的桌面端标识。Firefox 按真实版本号伪装为 Windows 桌面 Firefox，
 * 避免页面与内容脚本把 Gecko 识别成 Chromium；其他浏览器使用 Chrome 桌面 UA。
 */
export function getBilibiliDesktopNavigatorValues(originalUserAgent: string): BilibiliDesktopNavigatorValues {
  const firefoxVersion = originalUserAgent.match(/\bFirefox\/([\d.]+)/)?.[1]
  if (!firefoxVersion) {
    return {
      userAgent: BILIBILI_DESKTOP_USER_AGENT,
      appVersion: BILIBILI_DESKTOP_USER_AGENT.replace(/^Mozilla\//, ''),
      platform: 'Win32',
    }
  }

  const geckoRevision = originalUserAgent.match(/\brv:([\d.]+)/)?.[1] ?? firefoxVersion
  return {
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${geckoRevision}) Gecko/20100101 Firefox/${firefoxVersion}`,
    appVersion: '5.0 (Windows)',
    platform: 'Win32',
    oscpu: 'Windows NT 10.0; Win64; x64',
  }
}

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
