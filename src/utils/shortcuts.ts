import { toggleListenVideo } from '~/contentScripts/listenVideoFeature'
import { settings } from '~/logic'
import type { BaseShortcutSetting } from '~/logic/storage'
import { applyBewlyWidescreen, exitBewlyWidescreen, isBewlyWidescreenActive, isBewlyWidescreenEngaged } from '~/utils/bewlyWidescreen'
import { isVideoOrBangumiPage, isVideoPlaybackPage } from '~/utils/main'
// 导入需要的函数
import {
  adjustVideoSize,
  changePlaybackRate,
  playPause as playerPlayPause,
  replay as playerReplay,
  resetPlaybackRate,
  showDanmuState,
  stepSeek,
  toggleCaption,
  toggleClockTime,
  toggleLight,
  togglePictureInPicture,
  toggleVideoTime,
  toggleVideoTitle,
  webFullscreenClick,
  widescreenClick,
} from '~/utils/player'
import { getShortcutKeyCandidates, normalizeShortcutKey } from '~/utils/shortcutKeys'
import { captureVideoScreenshot } from '~/utils/videoScreenshot'

// 定义快捷键处理器类型
type ShortcutHandler = (e: KeyboardEvent, player?: Element) => void

// 快捷键处理映射
const shortcutHandlers: Record<string, ShortcutHandler> = {}

/**
 * 注册快捷键处理函数
 * @param id 快捷键ID
 * @param handler 处理函数
 * @returns 是否注册成功
 */
export function registerShortcutHandler(id: string, handler: ShortcutHandler): boolean {
  try {
    if (!id || typeof handler !== 'function') {
      return false
    }

    shortcutHandlers[id] = handler
    return true
  }
  catch {
    return false
  }
}

/**
 * 注销快捷键处理函数
 * @param id 快捷键ID
 * @returns 是否注销成功
 */
export function unregisterShortcutHandler(id: string): boolean {
  try {
    if (!id) {
      return false
    }

    if (!shortcutHandlers[id]) {
      return false
    }

    delete shortcutHandlers[id]
    return true
  }
  catch {
    return false
  }
}

/**
 * 获取快捷键处理函数
 * @param id 快捷键ID
 * @returns 处理函数或undefined
 */
export function getShortcutHandler(id: string): ShortcutHandler | undefined {
  return shortcutHandlers[id]
}

// 放大视频旧默认为 Shift++ 并启用，现已默认未绑定。按新格式 Shift++ 等同 +，会在关闭倍速快捷键后抢占 + 键。
// 新录制不会产生 Shift++，仍是该值即为未改动的旧默认，运行时按未绑定处理，不改写用户设置。
const LEGACY_DEFAULT_SHORTCUT_KEYS: Record<string, string> = {
  increaseVideoSize: 'Shift++',
}

/**
 * 实际生效的快捷键配置；未改动的旧默认绑定视为未绑定。
 */
export function getEffectiveShortcutSetting(id: string): BaseShortcutSetting | undefined {
  const shortcutConfig = settings.value.shortcuts?.[id]
  if (shortcutConfig && LEGACY_DEFAULT_SHORTCUT_KEYS[id] === shortcutConfig.key)
    return { key: '', enabled: false }
  return shortcutConfig
}

// 缓存快捷键配置：标准化后的按键 -> 快捷键 ID，配置靠前的快捷键优先
let cachedShortcutIds: Map<string, string> | null = null
let lastSettingsUpdate = 0

// 更新快捷键配置缓存
function updateShortcutsCache(force = false) {
  const now = Date.now()
  // 每100ms最多更新一次缓存
  if (!force && now - lastSettingsUpdate < 100)
    return

  lastSettingsUpdate = now
  const shortcutIds = new Map<string, string>()
  for (const id of Object.keys(settings.value.shortcuts || {})) {
    const shortcutConfig = getEffectiveShortcutSetting(id)
    if (!shortcutConfig?.enabled || !shortcutConfig.key)
      continue
    const key = normalizeShortcutKey(String(shortcutConfig.key)).toLowerCase()
    if (key && !shortcutIds.has(key))
      shortcutIds.set(key, id)
  }
  cachedShortcutIds = shortcutIds
}

const fullscreenOnlyShortcutIds = new Set(['increaseVideoSize', 'decreaseVideoSize', 'resetVideoSize'])

function isBrowserFullscreen(): boolean {
  return !!(document.fullscreenElement
    || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement)
}

function isWebFullscreen(): boolean {
  const webFullscreenButton = document.querySelector<HTMLElement>('.bpx-player-ctrl-web, .bilibili-player-video-web-fullscreen')
  return !!webFullscreenButton?.classList.contains('bpx-state-entered')
}

function isPlayerFullscreen(): boolean {
  return isBrowserFullscreen() || isWebFullscreen()
}

function findShortcutId(e: KeyboardEvent): string | null {
  if (!cachedShortcutIds)
    return null

  for (const candidate of getShortcutKeyCandidates(e)) {
    const id = cachedShortcutIds.get(candidate.toLowerCase())
    if (!id || !shortcutHandlers[id])
      continue
    // 截图与听视频只在视频播放页响应，避免拦截其他页面或输入法的按键。
    if ((id === 'videoScreenshot' || id === 'listenVideo')
      && (e.isComposing || !(isVideoPlaybackPage() || isVideoOrBangumiPage()))) {
      continue
    }
    if (id === 'listenVideo' && !settings.value.enableListenVideo)
      continue
    // 视频尺寸属于全屏模式快捷键，非全屏时不占用按键，避免抢走其他扩展（如倍速插件）的同名按键。
    if (fullscreenOnlyShortcutIds.has(id) && !isPlayerFullscreen())
      continue
    return id
  }
  return null
}

function shouldIgnoreShortcutEvent(e: KeyboardEvent): boolean {
  if (document.getElementById('bewly')?.classList.contains('settings-open'))
    return true

  // 插件界面在 #bewly 的 Shadow DOM 中，e.target 会被重定向到宿主元素；取实际焦点元素判断，
  // 否则焦点留在插件界面（如刚关闭设置）时快捷键会被跳过，按键落到 B 站原有快捷键上。
  const target = (e.composedPath()[0] ?? e.target) as HTMLElement | null
  if (target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target?.isContentEditable
    || (e.target as HTMLElement | null)?.tagName === 'BILI-COMMENTS') {
    return true
  }

  // 分隔线使用方向键和 Home/End 调宽，不能被播放器快捷键提前拦截。
  return !!target?.closest?.('.bewly-widescreen-sidebar-resize-handle')
}

// 已被插件接管的物理按键，对应的 keypress/keyup 也要拦截，避免 B 站在这些阶段执行原有快捷键。
const interceptedKeyCodes = new Set<string>()

function interceptEvent(e: KeyboardEvent) {
  e.preventDefault()
  e.stopImmediatePropagation()
}

function handleShortcutKeydown(e: KeyboardEvent) {
  // macOS 按住 Cmd 时松开其他键不会触发 keyup，重新按下时清理残留的拦截标记。
  if (e.code)
    interceptedKeyCodes.delete(e.code)

  if (settings.value.keyboard === false || shouldIgnoreShortcutEvent(e))
    return

  updateShortcutsCache()
  const id = findShortcutId(e)
  if (!id)
    return

  interceptEvent(e)
  if (e.code)
    interceptedKeyCodes.add(e.code)

  try {
    const player = document.querySelector('.bpx-player') || document.querySelector('.bilibili-player')
    shortcutHandlers[id](e, player || undefined)
  }
  catch {
    // 处理器执行错误
  }
}

function handleShortcutKeypress(e: KeyboardEvent) {
  if (e.code && interceptedKeyCodes.has(e.code))
    interceptEvent(e)
}

function handleShortcutKeyup(e: KeyboardEvent) {
  if (e.code && interceptedKeyCodes.delete(e.code))
    interceptEvent(e)
}

let shortcutListenerInstalled = false

/**
 * 在 window 捕获阶段常驻监听快捷键。
 * 需在 document_start 时尽早调用：同一阶段的监听器按注册顺序执行，先于 B 站注册才能拦截其默认快捷键；
 * 之后也不再移除重装，避免排到 B 站的监听器之后。
 */
export function installShortcutListener() {
  if (shortcutListenerInstalled)
    return
  shortcutListenerInstalled = true
  window.addEventListener('keydown', handleShortcutKeydown, true)
  window.addEventListener('keypress', handleShortcutKeypress, true)
  window.addEventListener('keyup', handleShortcutKeyup, true)
}

export function setupShortcutHandlers() {
  installShortcutListener()

  // 清空现有处理器
  Object.keys(shortcutHandlers).forEach((id) => {
    delete shortcutHandlers[id]
  })

  // 如果快捷键总开关关闭，不注册处理器
  if (settings.value.keyboard === false) {
    cachedShortcutIds = null
    return
  }

  // 注册默认快捷键处理器
  registerDefaultHandlers()

  // 更新快捷键配置缓存
  updateShortcutsCache(true)
}

/**
 * 注册默认的快捷键处理器
 */
export function registerDefaultHandlers(): void {
  // 弹幕开关
  // 弹幕状态显示（不切换状态）
  registerShortcutHandler('danmuStatus', () => {
    // 只显示当前弹幕状态，不切换
    showDanmuState()
  })

  // 网页全屏
  registerShortcutHandler('webFullscreen', () => {
    if (isBewlyWidescreenActive())
      exitBewlyWidescreen({ userInitiated: true })
    webFullscreenClick()
  })

  // 宽屏
  registerShortcutHandler('widescreen', () => {
    if (isBewlyWidescreenActive())
      exitBewlyWidescreen({ userInitiated: true })
    widescreenClick()
  })

  // Bewly 宽屏
  registerShortcutHandler('bewlyWidescreen', (event) => {
    if (event.repeat)
      return

    if (isBewlyWidescreenEngaged()) {
      exitBewlyWidescreen({ userInitiated: true })
      return
    }

    if (!isVideoOrBangumiPage() || isPlayerFullscreen())
      return

    applyBewlyWidescreen(settings.value.bewlyWidescreenSidebarPosition || 'right')
  })

  // 短步后退
  registerShortcutHandler('shortStepBackward', () => {
    stepSeek(false, 5)
  })

  // 长步后退
  registerShortcutHandler('longStepBackward', () => {
    stepSeek(false, 30)
  })

  // 短步前进
  registerShortcutHandler('shortStepForward', () => {
    stepSeek(true, 5)
  })

  // 长步前进
  registerShortcutHandler('longStepForward', () => {
    stepSeek(true, 30)
  })

  // 播放/暂停
  registerShortcutHandler('playPause', (e, player) => {
    playerPlayPause(player)
  })

  // 画中画
  registerShortcutHandler('pip', () => {
    togglePictureInPicture()
  })

  // 关灯
  registerShortcutHandler('turnOffLight', () => {
    toggleLight()
  })

  // 字幕
  registerShortcutHandler('caption', () => {
    toggleCaption()
  })

  // 视频截图独立于控制栏按钮开关，长按时只截取一次。
  registerShortcutHandler('videoScreenshot', (event) => {
    if (event.repeat)
      return

    void captureVideoScreenshot()
  })

  // 听视频模式独立于控制栏按钮开关，长按时不重复切换。
  registerShortcutHandler('listenVideo', (event) => {
    if (event.repeat)
      return

    void toggleListenVideo()
  })

  // 增加播放速度
  registerShortcutHandler('increasePlaybackRate', () => {
    changePlaybackRate(true)
  })

  // 减少播放速度
  registerShortcutHandler('decreasePlaybackRate', () => {
    changePlaybackRate(false)
  })

  // 重置播放速度
  registerShortcutHandler('resetPlaybackRate', () => {
    resetPlaybackRate()
  })

  // 随机播放切换已移除

  // 上一帧
  registerShortcutHandler('previousFrame', () => {
    stepSeek(false, 0.042)
  })

  // 下一帧
  registerShortcutHandler('nextFrame', () => {
    stepSeek(true, 0.042)
  })

  // 重播
  registerShortcutHandler('replay', () => {
    playerReplay()
  })

  // 增加视频大小
  registerShortcutHandler('increaseVideoSize', () => {
    adjustVideoSize(1)
  })

  // 减少视频大小
  registerShortcutHandler('decreaseVideoSize', () => {
    adjustVideoSize(-1)
  })

  // 重置视频大小
  registerShortcutHandler('resetVideoSize', () => {
    adjustVideoSize(0)
  })

  // 视频标题
  registerShortcutHandler('videoTitle', () => {
    toggleVideoTitle()
  })

  // 视频时间
  registerShortcutHandler('videoTime', () => {
    toggleVideoTime()
  })

  // 时钟时间
  registerShortcutHandler('clockTime', () => {
    toggleClockTime()
  })

  // 关注/取消关注
  registerShortcutHandler('toggleFollow', () => {
    toggleFollow()
  })
}

/**
 * 切换关注/取消关注
 * 在视频页点击关注按钮
 */
function toggleFollow(): void {
  try {
    // 查找关注按钮
    const followButton = document.querySelector<HTMLElement>(
      '.upinfo-btn-panel .follow-btn, ' // 新版视频页
      + '.up-info .follow-btn, ' // 旧版视频页
      + '.video-info-detail .follow-btn, ' // 其他可能的位置
      + 'button.follow-btn', // 通用关注按钮
    )

    if (!followButton) {
      return
    }

    // 检查是否未关注状态（有 not-follow 类）
    const isNotFollowing = followButton.classList.contains('not-follow')

    // 创建并触发鼠标事件，确保Vue组件能响应
    const triggerClick = (element: HTMLElement) => {
      // 尝试多种方式触发点击
      // 1. 标准 click
      element.click()

      // 2. 触发 mousedown 和 mouseup 事件
      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
      })
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
      })
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      })

      element.dispatchEvent(mouseDownEvent)
      element.dispatchEvent(mouseUpEvent)
      element.dispatchEvent(clickEvent)
    }

    if (isNotFollowing) {
      // 未关注，直接点击关注
      // 尝试找到内部的 follow-btn-inner 元素
      const innerButton = followButton.querySelector<HTMLElement>('.follow-btn-inner')
      if (innerButton) {
        triggerClick(innerButton)
      }
      else {
        triggerClick(followButton)
      }
    }
    else {
      // 已关注，需要打开下拉菜单后点击"取消关注"
      // 先尝试点击内部元素
      const innerButton = followButton.querySelector<HTMLElement>('.follow-btn-inner')
      if (innerButton) {
        triggerClick(innerButton)
      }
      else {
        triggerClick(followButton)
      }

      // 等待下拉框出现
      setTimeout(() => {
        try {
          // 查找取消关注按钮 - 支持中英文
          const unfollowItems = Array.from(
            document.querySelectorAll<HTMLElement>(
              '.follow_dropdown li, .van-popover li, .van-followed li, [class*="follow"] li',
            ),
          )

          const unfollowButton = unfollowItems.find(
            item =>
              item.textContent?.includes('取消关注')
              || item.textContent?.includes('取消關注')
              || item.textContent?.toLowerCase().includes('unfollow'),
          )

          if (unfollowButton) {
            triggerClick(unfollowButton)
          }
        }
        catch (error) {
          console.error('[BewlyCat] Error clicking unfollow:', error)
        }
      }, 150) // 增加等待时间到 150ms
    }
  }
  catch (error) {
    console.error('[BewlyCat] Error toggling follow:', error)
  }
}
