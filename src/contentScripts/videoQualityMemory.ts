import { settings, settingsReady } from '~/logic'
import { getVideoElement } from '~/utils/player'

import { setupPlayerSettingSync } from './playerSettingSync'

const QUALITY_ITEM_SELECTOR = '.bpx-player-ctrl-quality-menu-item[data-value]'
const ACTIVE_CLASS = 'bpx-state-active'
let hasInitialized = false

function qualityOf(item: HTMLElement): number | null {
  const value = item.dataset.value
  if (!value || !/^\d+$/.test(value))
    return null
  const quality = Number(value)
  return Number.isSafeInteger(quality) ? quality : null
}

function isDisabled(item: HTMLElement) {
  return item.matches('[disabled], [aria-disabled="true"], .disabled, .bpx-state-disabled')
}

export function initVideoQualityMemory() {
  if (hasInitialized || location.hostname === 'live.bilibili.com')
    return
  hasInitialized = true

  void settingsReady.then(() => {
    let contextVideo: HTMLVideoElement | null = null
    let contextMenu: HTMLElement | null = null
    let contextUrl = ''
    let attemptedQualities = new Set<string>()
    let pending: { quality: number, expires: number } | null = null

    function syncQuality() {
      if (!settings.value.rememberVideoQuality) {
        pending = null
        attemptedQualities.clear()
        return
      }

      const video = getVideoElement()
      const items = Array.from(document.querySelectorAll<HTMLElement>(QUALITY_ITEM_SELECTOR))
      const menu = items[0]?.parentElement ?? null
      if (video !== contextVideo || menu !== contextMenu || location.href !== contextUrl) {
        // 清晰度切换也可能重建菜单，不能因此丢掉待确认的手动选择。
        if (location.href !== contextUrl)
          pending = null
        contextVideo = video
        contextMenu = menu
        contextUrl = location.href
        attemptedQualities = new Set()
      }
      if (!video || !menu)
        return

      const selected = items.find(item => item.classList.contains(ACTIVE_CLASS))
      const currentQuality = selected ? qualityOf(selected) : null
      if (currentQuality === null)
        return

      // 只记住已生效的手动选择；试看、自动降档和恢复操作都不能覆盖偏好。
      if (pending) {
        if (currentQuality === pending.quality) {
          settings.value.savedVideoQuality = pending.quality
          pending = null
          attemptedQualities.clear()
        }
        else if (Date.now() < pending.expires) {
          return
        }
        else {
          pending = null
        }
      }

      const savedQuality = settings.value.savedVideoQuality
      if (savedQuality === null) {
        settings.value.savedVideoQuality = currentQuality
        return
      }
      if (currentQuality === savedQuality) {
        attemptedQualities.clear()
        return
      }

      const target = items.find(item => qualityOf(item) === savedQuality)
      if (!target || isDisabled(target))
        return

      // 恢复成功前每种偏离只尝试一次，防止权限受限时重复弹窗。
      // 不以 currentSrc 识别新视频，因为切换清晰度本身也会更换媒体资源。
      const attempt = `${currentQuality}:${savedQuality}`
      if (attemptedQualities.has(attempt))
        return
      attemptedQualities.add(attempt)
      target.click()
    }

    const syncController = setupPlayerSettingSync({
      enabled: () => settings.value.rememberVideoQuality,
      preference: () => settings.value.savedVideoQuality,
      target: () => document.querySelector(QUALITY_ITEM_SELECTOR)?.parentElement ?? null,
      sync: syncQuality,
      pending: () => pending !== null,
      reset: () => {
        pending = null
        attemptedQualities.clear()
      },
    })

    document.addEventListener('click', (event) => {
      if (!event.isTrusted || !settings.value.rememberVideoQuality || !(event.target instanceof Element))
        return
      const item = event.target.closest<HTMLElement>(QUALITY_ITEM_SELECTOR)
      if (!item || isDisabled(item))
        return
      const quality = qualityOf(item)
      if (quality === null)
        return
      // 先同步播放上下文，再等待播放器确认这次选择，兼容异步加载。
      contextVideo = getVideoElement()
      contextMenu = item.parentElement
      contextUrl = location.href
      pending = { quality, expires: Date.now() + 10000 }
      syncController.schedule()
    }, { capture: true, signal: syncController.signal })
  })
}
