/**
 * 拦截 B 站原生空间页「订阅合集」的播放全部
 * 例：https://space.bilibili.com/{mid}/favlist?fid={seasonId}&ftype=collect&ctype=21
 */

import { settings } from '~/logic'
import { resolveFavoriteSeasonPlayAllUrl } from '~/utils/favoriteSeason'
import { openLinkToNewTab } from '~/utils/main'

const PLAY_ALL_TEXT = /播放全部/

let interceptInstalled = false
let isResolving = false

export function isCollectedSeasonFavlistUrl(url: string = location.href): boolean {
  try {
    const parsed = new URL(url)
    if (!/^space\.bilibili\.com$/i.test(parsed.hostname))
      return false
    if (!/\/favlist\/?$/i.test(parsed.pathname) && !/\/favlist/i.test(parsed.pathname))
      return false
    return parsed.searchParams.get('ftype') === 'collect'
  }
  catch {
    return false
  }
}

export function getSeasonIdFromFavlistUrl(url: string = location.href): number | null {
  try {
    const fid = new URL(url).searchParams.get('fid')
    if (!fid)
      return null
    const seasonId = Number(fid)
    return Number.isFinite(seasonId) && seasonId > 0 ? seasonId : null
  }
  catch {
    return null
  }
}

export function isNativeSeasonPlayAllTarget(el: Element): boolean {
  // 新版空间收藏：.favlist-info-detail__actions .playall-btn
  if (el.closest('.favlist-info-detail__actions .playall-btn, button.playall-btn'))
    return true

  // 旧版：.collection-details .collection-btn
  if (el.closest('.favInfo-box .collection-details .collection-btn'))
    return true

  // 文本兜底：合集详情区内的「播放全部」
  const inSeasonDetail = el.closest(
    '.favlist-info-detail__actions, .favlist-info-detail, .favInfo-box .collection-details',
  )
  if (!inSeasonDetail)
    return false

  const clickable = el.closest('a,button,[role="button"],.collection-btn,.playall-btn,.action-btn')
  if (!(clickable instanceof HTMLElement))
    return false

  return PLAY_ALL_TEXT.test(clickable.textContent || '')
}

function extractEntryFromClickTarget(el: Element): { link?: string, bvid?: string } {
  const anchor = el.closest('a[href]')
  if (anchor instanceof HTMLAnchorElement) {
    const fromHref = extractVideoIdsFromHref(anchor.href)
    if (fromHref.bvid || fromHref.link)
      return fromHref
  }

  // 新按钮是 <button> 无 href；尽量从列表首卡取入口
  const firstCard = document.querySelector<HTMLAnchorElement>([
    '#page-fav .fav-main a[href*="/video/"]',
    '.favlist-main a[href*="/video/"]',
    '.favlist-content a[href*="/video/"]',
    '.favInfo-box ~ * a[href*="/video/"]',
    '#page-fav a[href*="/video/"]',
    'a[href*="/video/BV"]',
  ].join(', '))
  if (firstCard)
    return extractVideoIdsFromHref(firstCard.href)

  return {}
}

function extractVideoIdsFromHref(href: string): { link?: string, bvid?: string } {
  try {
    const url = new URL(href, location.origin)
    const bvidMatch = url.pathname.match(/\/video\/(BV[a-z0-9]+)/i)
    if (bvidMatch)
      return { bvid: bvidMatch[1] }

    const avidMatch = url.pathname.match(/\/video\/av(\d+)/i)
    if (avidMatch)
      return { link: `bilibili://video/${avidMatch[1]}` }
  }
  catch {
    // ignore
  }
  return {}
}

async function handleNativeSeasonPlayAll(event: MouseEvent) {
  if (!isCollectedSeasonFavlistUrl())
    return

  const target = event.target
  if (!(target instanceof Element))
    return

  if (!isNativeSeasonPlayAllTarget(target))
    return

  // 新 UI 是 button + 捕获阶段拦截，需 stopImmediatePropagation 阻止原生起播
  event.preventDefault()
  event.stopImmediatePropagation()
  event.stopPropagation()

  if (isResolving)
    return

  const seasonId = getSeasonIdFromFavlistUrl()
  if (!seasonId)
    return

  isResolving = true
  try {
    const entry = extractEntryFromClickTarget(target)
    const result = await resolveFavoriteSeasonPlayAllUrl({
      seasonId,
      link: entry.link,
      bvid: entry.bvid,
      mode: settings.value.collectedSeasonPlayAllMode,
    })

    // SPA 可能已切走：打开前再确认仍是同一合集
    if (getSeasonIdFromFavlistUrl() !== seasonId)
      return

    openLinkToNewTab(result.url)
  }
  finally {
    isResolving = false
  }
}

export function initNativeFavoriteSeasonPlayAllIntercept(): void {
  if (interceptInstalled)
    return
  interceptInstalled = true
  document.addEventListener('click', handleNativeSeasonPlayAll, true)
}

export function stopNativeFavoriteSeasonPlayAllIntercept(): void {
  if (!interceptInstalled)
    return
  interceptInstalled = false
  document.removeEventListener('click', handleNativeSeasonPlayAll, true)
}
