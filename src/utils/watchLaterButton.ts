import type { List as WatchLaterItem, WatchLaterResult } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { i18n } from '~/utils/i18n'
import { getCSRF } from '~/utils/main'

const BUTTON_CLASS = 'bewly-watch-later-btn'
const INACTIVE_ICON_CLASS = 'i-mingcute:carplay-line'
const ACTIVE_ICON_CLASS = 'i-mingcute:check-line'

export interface VideoIds {
  bvid?: string
  aid?: number
}

interface WatchLaterButtonState {
  aid?: number
  isInWatchLater: boolean
  pendingAid?: Promise<number | undefined>
}

interface MountedWatchLaterButton {
  button: HTMLButtonElement
  ids: VideoIds
  ready: Promise<void>
  state: WatchLaterButtonState
}

/**
 * 从URL中提取视频ID
 * 支持 /video/BV...、/video/av...，以及 /list/...?bvid= / ?avid= 等合集/列表页
 * @param url 视频页面URL，默认为当前页面URL
 * @returns 包含bvid或aid的对象
 */
export function extractVideoIds(url: string = location.href): VideoIds {
  // 提取路径中的 BVID（普通视频页）
  const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/)
  if (bvidMatch)
    return { bvid: bvidMatch[1] }

  // 提取路径中的 AID
  const aidMatch = url.match(/\/video\/av(\d+)/i)
  if (aidMatch)
    return { aid: Number.parseInt(aidMatch[1]) }

  // 合集/列表页：ID 在 query 中（SPA 切集时 pathname 不变，bvid/avid 会变）
  try {
    const searchParams = new URL(url).searchParams
    const bvid = searchParams.get('bvid')
    if (bvid)
      return { bvid }

    const avid = searchParams.get('avid') || searchParams.get('aid')
    if (avid)
      return { aid: Number.parseInt(avid) }
  }
  catch {
    // ignore invalid URL
  }

  return {}
}

function getVideoKey({ bvid, aid }: VideoIds): string {
  return bvid || (aid ? `av${aid}` : '')
}

function findWatchLaterItem(list: WatchLaterItem[] | undefined, { bvid, aid }: VideoIds): WatchLaterItem | undefined {
  return list?.find(item => (bvid && item.bvid === bvid) || (aid && item.aid === aid))
}

function translate(key: string): string {
  return String(i18n.global.t(key))
}

function updateButtonState(button: HTMLButtonElement, isInWatchLater: boolean) {
  const icon = button.querySelector<HTMLElement>('.bewly-watch-later-btn__icon')
  const label = button.querySelector<HTMLElement>('.bewly-watch-later-btn__label')
  const addLabel = translate('common.add_to_watch_later')
  const addedLabel = translate('common.added_to_watch_later')
  const actionLabel = isInWatchLater
    ? translate('common.remove_from_watch_later')
    : addLabel

  button.classList.toggle('is-active', isInWatchLater)
  button.dataset.inWatchLater = String(isInWatchLater)
  button.setAttribute('aria-pressed', String(isInWatchLater))
  button.setAttribute('aria-label', actionLabel)
  button.title = actionLabel
  button.style.color = isInWatchLater
    ? 'var(--bew-theme-color, var(--brand_blue, #00aeec))'
    : 'var(--text2, #61666d)'

  if (isInWatchLater) {
    button.style.backgroundColor = 'rgba(0, 174, 236, 0.12)'
    button.style.setProperty('background-color', 'color-mix(in srgb, var(--bew-theme-color, #00aeec) 12%, transparent)')
  }
  else {
    button.style.backgroundColor = 'transparent'
  }

  if (icon)
    icon.className = `${ACTIVE_ICON_CLASS} bewly-watch-later-btn__icon`
  if (icon && !isInWatchLater)
    icon.className = `${INACTIVE_ICON_CLASS} bewly-watch-later-btn__icon`
  if (label)
    label.textContent = isInWatchLater ? addedLabel : addLabel
}

function setButtonBusy(button: HTMLButtonElement, isBusy: boolean) {
  button.disabled = isBusy
  button.setAttribute('aria-busy', String(isBusy))
  button.style.cursor = isBusy ? 'wait' : 'pointer'
  button.style.opacity = isBusy ? '0.65' : '1'
}

function animateButton(button: HTMLButtonElement) {
  button.style.transform = 'scale(1.05)'
  window.setTimeout(() => {
    if (button.isConnected)
      button.style.transform = 'scale(1)'
  }, 150)
}

function scheduleTopBarRefresh() {
  window.setTimeout(() => {
    try {
      void useTopBarStore().getAllWatchLaterList()
    }
    catch (error) {
      console.error('刷新稍后再看列表失败:', error)
    }
  }, 1000)
}

async function resolveAid(ids: VideoIds, state: WatchLaterButtonState): Promise<number | undefined> {
  if (state.aid)
    return state.aid
  if (!ids.bvid)
    return undefined
  if (state.pendingAid)
    return state.pendingAid

  state.pendingAid = api.video.getVideoInfo({ bvid: ids.bvid })
    .then((result: any) => {
      const aid = result.code === 0 && Number.isFinite(result.data?.aid)
        ? Number(result.data.aid)
        : undefined
      state.aid = aid
      return aid
    })
    .finally(() => {
      state.pendingAid = undefined
    })

  return state.pendingAid
}

async function initializeButtonState(button: HTMLButtonElement, ids: VideoIds, state: WatchLaterButtonState) {
  try {
    const result = await api.watchlater.getAllWatchLaterList() as WatchLaterResult
    if (!button.isConnected)
      return

    if (result.code === 0) {
      const item = findWatchLaterItem(result.data?.list, ids)
      state.isInWatchLater = Boolean(item)
      state.aid = item?.aid || state.aid
      updateButtonState(button, state.isInWatchLater)
    }
  }
  catch (error) {
    console.error('获取稍后再看状态失败:', error)
  }
  finally {
    if (button.isConnected)
      setButtonBusy(button, false)
  }
}

async function toggleWatchLater(button: HTMLButtonElement, ids: VideoIds, state: WatchLaterButtonState) {
  setButtonBusy(button, true)

  try {
    if (state.isInWatchLater) {
      const aid = await resolveAid(ids, state)
      if (!aid) {
        console.warn('无法获取当前视频的 aid，不能从稍后再看中移除')
        return
      }

      const result = await api.watchlater.removeFromWatchLater({
        aid,
        csrf: getCSRF(),
      })
      if (result.code !== 0) {
        console.warn('从稍后再看中移除失败:', result.message || result.code)
        return
      }

      state.isInWatchLater = false
    }
    else {
      const result = await api.watchlater.saveToWatchLater({
        ...ids,
        csrf: getCSRF(),
      })
      if (result.code !== 0) {
        console.warn('添加到稍后再看失败:', result.message || result.code)
        return
      }

      state.isInWatchLater = true
    }

    updateButtonState(button, state.isInWatchLater)
    animateButton(button)
    scheduleTopBarRefresh()
  }
  catch (error) {
    console.error('更新稍后再看状态失败:', error)
  }
  finally {
    if (button.isConnected)
      setButtonBusy(button, false)
  }
}

function createButton(ids: VideoIds): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `video-toolbar-right-item ${BUTTON_CLASS}`
  button.dataset.videoKey = getVideoKey(ids)
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-sizing: border-box;
    width: auto;
    min-width: max-content;
    height: 32px;
    margin: 0 4px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font: inherit;
    font-size: 14px;
    line-height: 20px;
    white-space: nowrap;
    transition: color 0.2s ease, background-color 0.2s ease, transform 0.15s ease, opacity 0.2s ease;
  `
  button.innerHTML = `
    <i class="${INACTIVE_ICON_CLASS} bewly-watch-later-btn__icon" style="
      flex: none;
      color: inherit;
      font-size: 18px;
      line-height: 1;
    "></i>
    <span class="bewly-watch-later-btn__label" style="color: inherit; white-space: nowrap;"></span>
  `

  updateButtonState(button, false)
  setButtonBusy(button, true)
  return button
}

function mountWatchLaterButton(ids: VideoIds): MountedWatchLaterButton | undefined {
  const moreButton = document.querySelector('.video-tool-more')
  if (!moreButton?.parentNode)
    return undefined

  const state: WatchLaterButtonState = {
    aid: ids.aid,
    isInWatchLater: false,
  }
  const button = createButton(ids)
  const mounted: MountedWatchLaterButton = {
    button,
    ids,
    ready: Promise.resolve(),
    state,
  }

  button.addEventListener('click', () => {
    void handleButtonClick(mounted)
  })

  moreButton.parentNode.insertBefore(button, moreButton)
  mounted.ready = initializeButtonState(button, ids, state)
  return mounted
}

async function handleButtonClick(mounted: MountedWatchLaterButton) {
  // 合集/列表页切集后必须以点击瞬间的 URL 为准，不能继续使用旧按钮闭包中的视频 ID。
  const currentIds = extractVideoIds()
  const currentVideoKey = getVideoKey(currentIds)
  if (!currentVideoKey)
    return

  if (currentVideoKey !== getVideoKey(mounted.ids)) {
    mounted.button.remove()
    const replacement = mountWatchLaterButton(currentIds)
    if (!replacement)
      return

    await replacement.ready
    if (!replacement.button.isConnected || getVideoKey(extractVideoIds()) !== currentVideoKey)
      return

    await toggleWatchLater(replacement.button, replacement.ids, replacement.state)
    return
  }

  await mounted.ready
  if (!mounted.button.isConnected || getVideoKey(extractVideoIds()) !== currentVideoKey)
    return

  await toggleWatchLater(mounted.button, currentIds, mounted.state)
}

/**
 * 添加稍后再看按钮到视频页面。
 * @returns 是否已找到工具栏并成功插入（或复用）按钮
 */
export function addWatchLaterButton(): boolean {
  const ids = extractVideoIds()
  const videoKey = getVideoKey(ids)
  if (!videoKey)
    return false

  const existingButton = document.querySelector<HTMLButtonElement>(`.${BUTTON_CLASS}`)
  if (existingButton?.dataset.videoKey === videoKey)
    return true
  existingButton?.remove()

  return Boolean(mountWatchLaterButton(ids))
}
