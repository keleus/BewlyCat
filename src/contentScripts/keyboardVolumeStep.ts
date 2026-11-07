import { settings } from '~/logic'
import { isImmersiveFeedFrame } from '~/utils/immersiveFeed'
import { normalizeKeyboardVolumeStep } from '~/utils/keyboardVolume'
import { adjustVolume, getVideoElement } from '~/utils/player'

/**
 * 上下方向键的音量步进。B 站播放器固定按 10 调节，这里在捕获阶段接管按键，
 * 按设置值调节后再拦下事件，避免两套幅度叠加。
 */

const LISTENER_OPTIONS = { capture: true } as const

let listenerInstalled = false
/** 已被插件接管的按键 code：keyup 阶段一并拦截，避免 B 站在抬起时再执行一次 */
let interceptedCode: string | undefined

function getEventTarget(event: KeyboardEvent): Element | null {
  const target = (event.composedPath?.()[0] ?? event.target) as Element | null
  return target instanceof Element ? target : null
}

function isEditableTarget(target: Element | null): boolean {
  if (!target)
    return false
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
    return true
  return target instanceof HTMLElement
    && (target.isContentEditable || target.closest('[contenteditable="true"], [role="textbox"]') !== null)
}

function handleKeydown(event: KeyboardEvent) {
  interceptedCode = undefined

  if (!settings.value.customKeyboardVolume)
    return
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
    return
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing)
    return

  // B 站自己是在文档级别接管方向键的（焦点在 body 也照常调音量），
  // 所以这里只按“页面上有播放器”判断，而不是要求焦点在播放器内。
  const target = getEventTarget(event)
  if (isEditableTarget(target))
    return
  if (!getVideoElement())
    return

  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.code)
    interceptedCode = event.code

  const step = normalizeKeyboardVolumeStep(settings.value.keyboardVolumeStep)
  adjustVolume(event.key === 'ArrowUp' ? step : -step)
}

function handleKeyup(event: KeyboardEvent) {
  if (!event.code || event.code !== interceptedCode)
    return
  interceptedCode = undefined
  event.preventDefault()
  event.stopImmediatePropagation()
}

export function initKeyboardVolumeStep() {
  // 首页沉浸式模式里方向键用于切换视频，交给 immersiveFeedFrame 处理
  if (listenerInstalled || isImmersiveFeedFrame())
    return

  listenerInstalled = true
  // 常驻监听：同一阶段按注册顺序执行，早于播放器注册才能拦下它自己的幅度
  window.addEventListener('keydown', handleKeydown, LISTENER_OPTIONS)
  window.addEventListener('keyup', handleKeyup, LISTENER_OPTIONS)
}
