import { settings, settingsReady } from '~/logic'
import api from '~/utils/api'
import { getUserID } from '~/utils/main'
import { getVideoElement } from '~/utils/player'

import { setupPlayerSettingSync } from './playerSettingSync'

const QUALITY_ITEM_SELECTOR = '.bpx-player-ctrl-quality-menu-item[data-value]'
const ACTIVE_CLASS = 'bpx-state-active'
// 与 B 站播放器 isSuperQuality 一致：100 及以上（智能修复、1080P 高码率、4K 等）为大会员清晰度。
// 非大会员点击这些选项会弹出开通引导并暂停播放，或消耗试用次数。
const PREMIUM_QUALITY_MIN = 100
const VIP_CHECK_RETRY_DELAY = 60_000
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
    // 按账号缓存大会员状态；未知时先查询，结果返回后再重新同步。
    let vipState: { mid: string, isVip: boolean } | null = null
    let vipCheckingMid: string | null = null
    let vipCheckRetryAt = 0
    let scheduleSync = () => {}

    function canUsePremiumQuality(): boolean {
      const mid = getUserID()
      if (!mid)
        return false
      if (vipState?.mid === mid)
        return vipState.isVip
      if (vipCheckingMid === mid || Date.now() < vipCheckRetryAt)
        return false

      vipCheckingMid = mid
      void api.user.getUserInfo()
        .then((res: any) => {
          if (res?.code === 0 && String(res.data?.mid) === mid)
            vipState = { mid, isVip: res.data.vipStatus === 1 || res.data.vip?.status === 1 }
          else if (res?.code === -101)
            vipState = { mid, isVip: false }
          else
            vipCheckRetryAt = Date.now() + VIP_CHECK_RETRY_DELAY
        })
        .catch(() => {
          vipCheckRetryAt = Date.now() + VIP_CHECK_RETRY_DELAY
        })
        .finally(() => {
          vipCheckingMid = null
          if (vipState?.mid === mid && vipState.isVip)
            scheduleSync()
        })
      return false
    }

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
      // 非大会员时交给 B 站自身记忆降级，不主动点击大会员清晰度。
      if (savedQuality >= PREMIUM_QUALITY_MIN && !canUsePremiumQuality())
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
    scheduleSync = syncController.schedule

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
