import type { SettingsMenu, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { sendMessage } from '~/utils/messaging'

export const SETTINGS_PAGE_PATH = 'dist/options/index.html'

/** B 站页面或工具栏 -> 后台：打开设置页，已打开时切换过去。 */
export const OPEN_SETTINGS_PAGE_MESSAGE = 'bewly-cat:settings-page:open'
/** 后台 -> 设置页：定位到指定设置项，并返回所在标签页。 */
export const NAVIGATE_SETTINGS_PAGE_MESSAGE = 'bewly-cat:settings-page:navigate'
/** 设置页 -> 后台 -> B 站标签页：执行依赖播放器或页面环境的操作。 */
export const BILIBILI_TAB_REQUEST_MESSAGE = 'bewly-cat:settings-page:bilibili-tab-request'

export interface SettingsPageTabLocation {
  tabId?: number
  windowId?: number
}

export type BilibiliTabRequest
  = | { action: 'applyPlaybackRate', rate: number }
    | { action: 'getEvolvedThemeColor' }

const MENU_SLUGS: Record<SettingsMenu, string> = {
  General: 'general',
  BewlyPages: 'bewly-pages',
  BewlyComponents: 'bewly-components',
  Bilibili: 'bilibili',
  Appearance: 'appearance',
  Shortcuts: 'shortcuts',
  Data: 'data',
  About: 'about',
}

const LOCATE_PARAM = 'locate'

export function openSettingsPage(target?: SettingsNavigationTarget) {
  sendMessage(OPEN_SETTINGS_PAGE_MESSAGE, target).catch((error) => {
    console.error('[BewlyCat] 打开设置页失败:', error)
  })
}

/** 按最近访问顺序交给 B 站标签页处理；没有页面能处理时返回 undefined。 */
export function requestBilibiliTab<R>(request: BilibiliTabRequest): Promise<R | undefined> {
  return sendMessage<BilibiliTabRequest, R | undefined>(BILIBILI_TAB_REQUEST_MESSAGE, request)
}

export function buildSettingsPageHash(target?: SettingsNavigationTarget): string {
  if (!target)
    return ''

  const path = [MENU_SLUGS[target.menu], target.secondaryPage].filter(Boolean).join('/')
  const query = target.targetTitleKey
    ? `?${LOCATE_PARAM}=${encodeURIComponent(target.targetTitleKey)}`
    : ''
  return `#/${path}${query}`
}

export function parseSettingsPageHash(hash: string): SettingsNavigationTarget | undefined {
  const match = hash.match(/^#\/([^?]*)(?:\?(.*))?$/)
  if (!match)
    return undefined

  const [menuSlug, secondaryPage] = match[1].split('/')
  const menu = (Object.keys(MENU_SLUGS) as SettingsMenu[]).find(key => MENU_SLUGS[key] === menuSlug)
  if (!menu)
    return undefined

  return {
    menu,
    secondaryPage: secondaryPage || undefined,
    targetTitleKey: new URLSearchParams(match[2]).get(LOCATE_PARAM) ?? undefined,
  }
}
