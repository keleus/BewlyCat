// 注入按钮只在控制栏确实放不下时收起，不按播放器宽度阈值猜测。
// 数组顺序即保留优先级：空间不足时从末尾开始收起。
const MANAGED_CONTROL_SELECTORS = [
  '.bewly-widescreen-control',
  '.bewly-video-screenshot-control',
  '.bewly-local-loudness-control',
]
const COLLAPSED_CLASS = 'bewly-player-control-collapsed'
const CONTROL_BAR_SELECTOR = '.bpx-player-control-bottom-right'
const CONTROL_BAR_LEFT_SELECTOR = '.bpx-player-control-bottom-left'
// 按钮宽度含小数，允许不足 1px 的挤压，避免刚好放得下时被误收起。
const SUBPIXEL_TOLERANCE = 1

let observedControlBottom: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let fitFrame: number | null = null

// 底栏由左右两组按钮决定是否放得下；中间弹幕发送区会自行伸缩，不计入。
// 右侧分区及其按钮可被 flex 压缩，需按不压缩时的自然宽度判断，而非看是否溢出。
function fitsControlBottom(controlBottom: HTMLElement, left: HTMLElement | null, right: HTMLElement): boolean {
  const style = getComputedStyle(controlBottom)
  const available = controlBottom.getBoundingClientRect().width
    - Number.parseFloat(style.paddingLeft)
    - Number.parseFloat(style.paddingRight)
    - Number.parseFloat(style.borderLeftWidth)
    - Number.parseFloat(style.borderRightWidth)

  const previousFlexShrink = right.style.flexShrink
  right.style.flexShrink = '0'
  const required = (left?.getBoundingClientRect().width ?? 0) + right.getBoundingClientRect().width
  right.style.flexShrink = previousFlexShrink

  return required <= available + SUBPIXEL_TOLERANCE
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

  const left = controlBottom.querySelector<HTMLElement>(`:scope > ${CONTROL_BAR_LEFT_SELECTOR}`)
  controls.forEach(control => control.classList.add(COLLAPSED_CLASS))
  for (const control of controls) {
    control.classList.remove(COLLAPSED_CLASS)
    if (!fitsControlBottom(controlBottom, left, right)) {
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

function observeControlBottom(controlBottom: HTMLElement) {
  if (observedControlBottom === controlBottom && resizeObserver)
    return

  stopObservingControlBottom()
  observedControlBottom = controlBottom
  const observer = new ResizeObserver(scheduleFit)
  resizeObserver = observer
  // 底栏尺寸覆盖播放器缩放和模式切换；左右分区尺寸覆盖原生按钮增减、时间与清晰度文字变化。
  observer.observe(controlBottom)
  controlBottom.querySelectorAll<HTMLElement>(`:scope > ${CONTROL_BAR_LEFT_SELECTOR}, :scope > ${CONTROL_BAR_SELECTOR}`)
    .forEach(section => observer.observe(section))
}

export function schedulePlayerControlFit(control: HTMLElement) {
  const controlBottom = control.closest<HTMLElement>(CONTROL_BAR_SELECTOR)?.parentElement
  if (!controlBottom)
    return

  observeControlBottom(controlBottom)
  scheduleFit()
}
