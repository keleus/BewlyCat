// 注入按钮只在控制栏确实放不下时收起，不按播放器宽度阈值猜测。
// 数组顺序即保留优先级：空间不足时从末尾开始收起。
const MANAGED_CONTROL_SELECTORS = [
  '.bewly-widescreen-control',
  '.bewly-video-screenshot-control',
  '.bewly-listen-video-control',
  '.bewly-local-loudness-control',
]
const COLLAPSED_CLASS = 'bewly-player-control-collapsed'
const CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-right'
// 按钮宽度含小数，允许不足 1px 的挤压，避免刚好放得下时被误收起。
const SUBPIXEL_TOLERANCE = 1
// 全屏、网页全屏等过渡期间底栏每帧都在变宽，测量会逐帧强制重排；等尺寸停止变化后再测一次。
const RESIZE_SETTLE_DELAY = 150

let observedControlBottom: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let fitFrame: number | null = null
let resizeSettleTimer: ReturnType<typeof setTimeout> | null = null

// 右侧分区及其按钮会被 flex 压缩而不溢出，不能直接看当前布局。
// 暂停右侧收缩后，左侧定宽、中间弹幕区缩到最小宽度（普通模式为空），右侧仍超出底栏即放不下。
function fitsControlBottom(controlBottom: HTMLElement, right: HTMLElement): boolean {
  const style = getComputedStyle(controlBottom)
  const contentRight = controlBottom.getBoundingClientRect().right
    - Number.parseFloat(style.paddingRight)
    - Number.parseFloat(style.borderRightWidth)

  const previousFlexShrink = right.style.flexShrink
  right.style.flexShrink = '0'
  const rightEdge = right.getBoundingClientRect().right
  right.style.flexShrink = previousFlexShrink

  return rightEdge <= contentRight + SUBPIXEL_TOLERANCE
}

function findManagedControls(right: HTMLElement): HTMLElement[] {
  return MANAGED_CONTROL_SELECTORS
    .map(selector => right.querySelector<HTMLElement>(selector))
    .filter((control): control is HTMLElement => Boolean(control))
}

function stopObservingControlBottom() {
  resizeObserver?.disconnect()
  resizeObserver = null
  observedControlBottom = null
  if (resizeSettleTimer !== null) {
    clearTimeout(resizeSettleTimer)
    resizeSettleTimer = null
  }
}

function fitControls() {
  fitFrame = null
  const controlBottom = observedControlBottom
  const right = controlBottom?.querySelector<HTMLElement>(`:scope > ${CONTROL_BAR_SELECTOR}`)
  if (!controlBottom?.isConnected || !right) {
    stopObservingControlBottom()
    return
  }

  const controls = findManagedControls(right)
  if (!controls.length) {
    stopObservingControlBottom()
    return
  }

  // 视口未显示播放器时无法测量，等尺寸变化后再判断。
  if (!controlBottom.clientWidth)
    return

  controls.forEach(control => control.classList.add(COLLAPSED_CLASS))
  for (const control of controls) {
    control.classList.remove(COLLAPSED_CLASS)
    if (!fitsControlBottom(controlBottom, right)) {
      control.classList.add(COLLAPSED_CLASS)
      break
    }
  }
}

function scheduleFit() {
  if (fitFrame !== null)
    return

  // 延到下一帧再改 DOM，避免在 ResizeObserver 回调内触发循环告警。
  fitFrame = requestAnimationFrame(fitControls)
}

function scheduleFitAfterResize() {
  if (resizeSettleTimer !== null)
    clearTimeout(resizeSettleTimer)

  resizeSettleTimer = setTimeout(() => {
    resizeSettleTimer = null
    scheduleFit()
  }, RESIZE_SETTLE_DELAY)
}

function observeControlBottom(controlBottom: HTMLElement) {
  if (observedControlBottom === controlBottom && resizeObserver)
    return

  stopObservingControlBottom()
  observedControlBottom = controlBottom
  const observer = new ResizeObserver(scheduleFitAfterResize)
  resizeObserver = observer
  // 底栏尺寸覆盖播放器缩放和模式切换；分区尺寸覆盖原生按钮增减、时间与清晰度文字、弹幕发送区变化。
  observer.observe(controlBottom)
  Array.from(controlBottom.children).forEach(section => observer.observe(section))
}

export function schedulePlayerControlFit(control: HTMLElement) {
  const controlBottom = control.closest<HTMLElement>(CONTROL_BAR_SELECTOR)?.parentElement
  if (!controlBottom)
    return

  observeControlBottom(controlBottom)
  scheduleFit()
}
