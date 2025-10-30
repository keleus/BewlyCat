import { settings } from '~/logic'
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

    // 如果已存在处理器，先注销
    if (shortcutHandlers[id]) {
      // 覆盖现有处理器
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

// 设置快捷键处理
// 保存事件监听器引用以便后续移除
let keydownListener: ((e: KeyboardEvent) => void) | null = null

// 缓存快捷键配置
let cachedShortcuts: Record<string, any> | null = null
let lastSettingsUpdate = 0

// 更新快捷键配置缓存
function updateShortcutsCache() {
  const now = Date.now()
  // 每100ms最多更新一次缓存
  if (now - lastSettingsUpdate < 100)
    return

  lastSettingsUpdate = now
  cachedShortcuts = settings.value.shortcuts || {}
}

export function setupShortcutHandlers() {
  // 如果快捷键总开关关闭，移除现有监听器并返回
  if (settings.value.keyboard === false) {
    if (keydownListener) {
      document.removeEventListener('keydown', keydownListener, true)
      keydownListener = null
    }
    cachedShortcuts = null
    return
  }

  // 如果已存在监听器，先移除
  if (keydownListener) {
    document.removeEventListener('keydown', keydownListener, true)
    keydownListener = null
  }

  // 清空现有处理器
  Object.keys(shortcutHandlers).forEach((id) => {
    delete shortcutHandlers[id]
  })

  // 注册默认快捷键处理器
  registerDefaultHandlers()

  // 更新快捷键配置缓存
  updateShortcutsCache()

  // 创建新的键盘事件监听器
  keydownListener = (e: KeyboardEvent) => {
    // 快速检查：如果在输入框中或按下meta键，直接返回
    if (e.target instanceof HTMLInputElement
      || e.target instanceof HTMLTextAreaElement
      || (e.target as HTMLElement).isContentEditable
      || (e.target instanceof HTMLElement && e.target.tagName === 'BILI-COMMENTS')
      || e.metaKey) {
      return
    }

    // 检查是否事件来自插件容器
    const target = e.target as HTMLElement
    if (target && target.id === 'bewly') {
      return
    }
    // 更新快捷键配置缓存
    updateShortcutsCache()

    // 如果没有缓存的快捷键配置，直接返回
    if (!cachedShortcuts)
      return

    // 获取播放器元素
    const player = document.querySelector('.bpx-player') || document.querySelector('.bilibili-player')

    // 生成当前按键组合
    const keyCombo = generateKeyCombo(e)

    // 遍历所有注册的快捷键
    try {
      // 获取所有快捷键ID
      const shortcutIds = Object.keys(cachedShortcuts)

      // 直接检查是否有匹配的快捷键ID
      for (const id of shortcutIds) {
        try {
          // 尝试获取快捷键配置
          const shortcutConfig = cachedShortcuts[id]

          // 如果快捷键未启用，跳过
          if (!shortcutConfig?.enabled)
            continue

          // 处理不同类型的快捷键配置
          let configKey = ''
          if (typeof shortcutConfig === 'string') {
            configKey = shortcutConfig
          }
          else if (shortcutConfig && typeof shortcutConfig === 'object') {
            configKey = String(shortcutConfig.key || '')
          }

          if (!configKey)
            continue

          // 如果快捷键匹配
          if (configKey.toLowerCase() === keyCombo.toLowerCase()) {
            // 获取处理函数
            const handler = shortcutHandlers[id]
            if (handler) {
              e.preventDefault()
              e.stopPropagation()

              try {
                handler(e, player || undefined)
              }
              catch {
                // 处理器执行错误
              }
              return
            }
          }
        }
        catch {
          // 处理单个快捷键时出错
        }
      }
    }
    catch {
      // 处理快捷键时出错
    }
  }

  // 添加事件监听器
  document.addEventListener('keydown', keydownListener, true)
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
    webFullscreenClick()
  })

  // 宽屏
  registerShortcutHandler('widescreen', () => {
    widescreenClick()
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

// 快捷键按键组合生成函数
// 生成标准化的按键组合字符串
function generateKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = []

  // 添加修饰键(顺序要与配置中的一致)
  if (e.ctrlKey)
    parts.push('Ctrl')
  if (e.altKey)
    parts.push('Alt')
  if (e.shiftKey)
    parts.push('Shift')

  // 处理主按键
  let mainKey = e.key
  // 对于单字符按键转为大写
  if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase()
  }
  // 特殊按键处理
  else if (mainKey === ' ') {
    mainKey = 'Space'
  }
  else if (mainKey === 'ArrowUp') {
    mainKey = '↑'
  }
  else if (mainKey === 'ArrowDown') {
    mainKey = '↓'
  }
  else if (mainKey === 'ArrowLeft') {
    mainKey = '←'
  }
  else if (mainKey === 'ArrowRight') {
    mainKey = '→'
  }

  parts.push(mainKey)

  // 返回标准化的按键组合
  const combo = parts.join('+')
  return combo
}
