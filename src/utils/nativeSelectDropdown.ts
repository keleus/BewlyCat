// 轻量原生下拉菜单（供 MAIN-world 注入脚本与原生页面 DOM 复用，不依赖 Vue）。
// 视觉规范与 `.bew-popover-surface`、`Select.vue` 保持一致，在 Shadow DOM 或普通 DOM 中均可工作。

export interface NativeSelectOption {
  value: string
  label: string
  disabled?: boolean
  hidden?: boolean
}

export interface NativeSelectDropdownOptions {
  /** 触发按钮 id（可选） */
  triggerId?: string
  /** 触发按钮额外 class（可选） */
  triggerClassName?: string
  /** 浮层额外 class（可选） */
  menuClassName?: string
  /** 浮层挂载目标；默认挂到 document.body，脱离祖先层叠上下文与 Shadow DOM 裁切 */
  mountTarget?: HTMLElement | ShadowRoot
  /** 浮层与触发器的间距，默认 4px（对齐 4px 间距网格） */
  gap?: number
  /** 浮层最大高度，默认 300px（对齐 Select.vue） */
  maxHeight?: number
  /** 浮层最小宽度，默认 100px */
  minMenuWidth?: number
  /** z-index；需高于 B 站顶栏(1002)、Bewly 顶栏(1004)与宽屏侧栏(2002/2004)，低于 Bewly 宿主(10003) */
  zIndex?: string
  /** 选项变更回调 */
  onChange?: (value: string) => void
}

export interface NativeSelectController {
  readonly trigger: HTMLButtonElement
  readonly menu: HTMLDivElement
  getValue: () => string
  setValue: (value: string) => void
  setOptions: (options: readonly NativeSelectOption[]) => void
  setDisabled: (disabled: boolean) => void
  setAriaLabel: (label: string) => void
  close: (options?: { restoreFocus?: boolean }) => void
  destroy: () => void
}

const DROPDOWN_VIEWPORT_MARGIN = 8
const DEFAULT_DROPDOWN_GAP = 4
const DEFAULT_DROPDOWN_MAX_HEIGHT = 300
const DEFAULT_DROPDOWN_MIN_WIDTH = 100
const CLOSE_ANIMATION_FALLBACK_MS = 220
// 高于原页顶栏与宽屏侧栏，低于 #bewly 宿主（--bew-z-settings-host: 10003），
// 避免浮层盖住设置弹窗等插件自身界面。
const DEFAULT_DROPDOWN_Z_INDEX = '2100'

export const NATIVE_SELECT_DROPDOWN_CSS = `
.bewly-native-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-1, 4px);
  box-sizing: border-box;
  min-width: var(--bew-space-6, 24px);
  min-height: var(--bew-space-6, 24px);
  padding: 0 var(--bew-space-1, 4px);
  border: 0;
  border-radius: var(--bew-radius-sm, 4px);
  background: transparent;
  color: var(--bew-text-2, var(--text2, #61666d));
  font: inherit;
  line-height: inherit;
  cursor: pointer;
  vertical-align: baseline;
  transition:
    color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
    background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
    box-shadow var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
}

.bewly-native-select-trigger:is(:hover, :active):not(:disabled),
.bewly-native-select-trigger[aria-expanded="true"]:not(:disabled) {
  color: var(--bew-theme-color, #00aeec);
  background: var(--bew-fill-1, var(--graph_bg_thin, #f1f2f3));
}

.bewly-native-select-trigger:focus-visible {
  outline: var(--bew-space-0-5, 2px) solid var(--bew-theme-color, #00aeec);
  outline-offset: var(--bew-space-0-5, 2px);
}

.bewly-native-select-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.bewly-native-select-trigger__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bewly-native-select-trigger__arrow {
  flex: none;
  width: 12px;
  height: 12px;
  opacity: 0.78;
  transition: transform var(--bew-duration-normal, 200ms) var(--bew-ease-standard, ease);
}

.bewly-native-select-trigger[aria-expanded="true"] .bewly-native-select-trigger__arrow {
  transform: rotate(180deg);
}

.bewly-native-select-menu {
  position: fixed;
  box-sizing: border-box;
  margin: 0;
  padding: var(--bew-popover-padding, 8px);
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1, 4px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--bew-text-1, var(--text1, #18191c));
  background: var(--bew-elevated, var(--bg1_float, rgba(255, 255, 255, 0.92)));
  border: 1px solid var(--bew-popover-border-color, var(--line_regular, rgba(148, 153, 160, 0.25)));
  border-radius: var(--bew-popover-surface-radius, 12px);
  box-shadow: var(--bew-shadow-2, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.08));
  -webkit-backdrop-filter: var(--bew-pop-glass, var(--bew-filter-glass-1, blur(20px) saturate(180%)));
  backdrop-filter: var(--bew-pop-glass, var(--bew-filter-glass-1, blur(20px) saturate(180%)));
  transform-origin: top left;
  opacity: 0;
  scale: 0.9;
  --bew-pop-glass: blur(0px) saturate(100%);
  transition:
    opacity var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
    scale var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
    backdrop-filter var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
}

.bewly-native-select-menu[data-open-up="true"] {
  transform-origin: bottom left;
}

.bewly-native-select-menu.is-open {
  opacity: 1;
  scale: 1;
  --bew-pop-glass: var(--bew-filter-glass-1, blur(20px) saturate(180%));
}

.bewly-native-select-menu::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.bewly-native-select-menu::-webkit-scrollbar-track {
  background: transparent;
}

.bewly-native-select-menu::-webkit-scrollbar-thumb {
  background-color: rgba(120, 120, 140, 0.44);
  border-radius: var(--bew-radius-full, 9999px);
}

.bewly-native-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2, 8px);
  width: 100%;
  min-height: 30px;
  box-sizing: border-box;
  padding: var(--bew-space-1, 4px) var(--bew-space-2, 8px);
  border: 0;
  border-radius: var(--bew-interactive-radius, 8px);
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--bew-font-size-control, 13px);
  font-weight: var(--bew-font-weight-regular, 400);
  line-height: var(--bew-line-height-control, 18px);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease),
    color var(--bew-duration-fast, 150ms) var(--bew-ease-standard, ease);
}

.bewly-native-select-option:hover:not(:disabled),
.bewly-native-select-option:focus-visible:not(:disabled) {
  outline: none;
  background: var(--bew-fill-2, rgba(131, 131, 145, 0.24));
}

.bewly-native-select-option[aria-selected="true"] {
  color: var(--bew-theme-color, #00aeec);
  background: var(--bew-theme-color-10, rgba(0, 174, 236, 0.12));
  font-weight: var(--bew-font-weight-medium, 500);
}

.bewly-native-select-option[aria-selected="true"]:hover:not(:disabled),
.bewly-native-select-option[aria-selected="true"]:focus-visible:not(:disabled) {
  background: var(--bew-theme-color-20, rgba(0, 174, 236, 0.2));
}

.bewly-native-select-option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bewly-native-select-option__check {
  flex: none;
  width: 14px;
  height: 14px;
  opacity: 0;
}

.bewly-native-select-option[aria-selected="true"] .bewly-native-select-option__check {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .bewly-native-select-trigger,
  .bewly-native-select-trigger__arrow,
  .bewly-native-select-menu,
  .bewly-native-select-option {
    transition: none;
  }
}
`

const SVG_NS = 'http://www.w3.org/2000/svg'

// 两个 world（MAIN 注入脚本与 ISOLATED 内容脚本）各有独立模块状态，
// 但共享同一份 document。ID 前缀随机化，避免跨 world 生成同名 id 与 aria-controls。
const DROPDOWN_ID_PREFIX = `bewly-native-select-menu-${Math.random().toString(36).slice(2, 8)}`
let nextDropdownId = 0
let globalStyleEl: HTMLStyleElement | null = null

const GLOBAL_STYLE_ID = 'bewly-native-select-dropdown-style'

// 浮层默认挂到 document.body，脱离触发器所在 Shadow DOM；Shadow DOM 内注入的样式
// 无法覆盖到 body 下的浮层，因此全局再注入一份，保证菜单在任何挂载点都被样式覆盖。
// 先按 id 复用文档中已有的节点，避免 MAIN / ISOLATED 两个 world 重复插入。
function ensureGlobalStyle(): void {
  if (globalStyleEl?.isConnected) return

  const existing = document.getElementById(GLOBAL_STYLE_ID)
  if (existing instanceof HTMLStyleElement) {
    globalStyleEl = existing
    return
  }

  globalStyleEl = document.createElement('style')
  globalStyleEl.id = GLOBAL_STYLE_ID
  globalStyleEl.textContent = NATIVE_SELECT_DROPDOWN_CSS
  const target = document.head || document.documentElement
  target.appendChild(globalStyleEl)
}

function createSvgIcon(pathData: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', className)

  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', pathData)
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.6')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

function isDarkModeActive(): boolean {
  const root = document.documentElement
  return root.classList.contains('dark') || root.classList.contains('bili_dark')
}

function isBiliDarkOnlyActive(): boolean {
  const root = document.documentElement
  return root.classList.contains('bili_dark') && !root.classList.contains('dark')
}

/** 从触发器（含 Shadow DOM 继承）与文档根解析当前生效的主题变量值。 */
function getEffectiveThemeVars(
  anchor: HTMLElement,
  skipRootSurfaceVars: boolean,
): {
  elevated: string
  text1: string
  borderColor: string
  fill2: string
  themeColor: string
  themeColor10: string
  themeColor20: string
} {
  // 视频页关闭「适应其他页面样式」时变量可能只存在于局部作用域，
  // 因此以锚点计算结果为准，再回落到文档根。
  const anchorStyle = getComputedStyle(anchor)
  const rootStyle = getComputedStyle(document.documentElement)
  const readVar = (name: string) =>
    anchorStyle.getPropertyValue(name).trim() || rootStyle.getPropertyValue(name).trim()
  // 当页面仅有 B 站原生 bili_dark（无插件 .dark）时，:root 上仍挂着浅色 --bew-* 变量，
  // 需忽略与 :root 相同的浅色底/文字变量，避免覆盖深色兜底；仅保留锚点局部覆写。
  const readSurfaceVar = (name: string) => {
    const anchorVal = anchorStyle.getPropertyValue(name).trim()
    const rootVal = rootStyle.getPropertyValue(name).trim()
    if (skipRootSurfaceVars) return anchorVal && anchorVal !== rootVal ? anchorVal : ''
    return anchorVal || rootVal
  }
  return {
    elevated: readSurfaceVar('--bew-elevated'),
    text1: readSurfaceVar('--bew-text-1'),
    borderColor: readSurfaceVar('--bew-popover-border-color'),
    fill2: readSurfaceVar('--bew-fill-2'),
    themeColor: readVar('--bew-theme-color'),
    themeColor10: readVar('--bew-theme-color-10'),
    themeColor20: readVar('--bew-theme-color-20'),
  }
}

/**
 * 浮层挂在 document.body 上，未必能继承到触发器局部作用域里的自定义属性。
 * 打开时把解析结果直接写到浮层元素上：有值就原样透传，缺失时才用明暗兜底。
 */
function applyDarkThemeFallbackVars(element: HTMLElement, anchor: HTMLElement): void {
  const dark = isDarkModeActive()
  const vars = getEffectiveThemeVars(anchor, isBiliDarkOnlyActive())

  const fallback = dark
    ? {
        elevated: 'rgba(42, 45, 50, 0.92)',
        text1: '#f1f2f3',
        borderColor: 'rgba(255, 255, 255, 0.14)',
        fill2: 'rgba(131, 131, 145, 0.24)',
        themeColor: '#00aeec',
        themeColor10: 'rgba(0, 174, 236, 0.14)',
        themeColor20: 'rgba(0, 174, 236, 0.24)',
      }
    : {
        elevated: 'rgba(255, 255, 255, 0.92)',
        text1: '#18191c',
        borderColor: 'rgba(148, 153, 160, 0.28)',
        fill2: 'rgba(131, 131, 145, 0.16)',
        themeColor: '#00aeec',
        themeColor10: 'rgba(0, 174, 236, 0.12)',
        themeColor20: 'rgba(0, 174, 236, 0.2)',
      }

  const resolved: Record<string, string> = {
    '--bew-elevated': vars.elevated || fallback.elevated,
    '--bew-text-1': vars.text1 || fallback.text1,
    '--bew-popover-border-color': vars.borderColor || fallback.borderColor,
    '--bew-fill-2': vars.fill2 || fallback.fill2,
    '--bew-theme-color': vars.themeColor || fallback.themeColor,
    '--bew-theme-color-10': vars.themeColor10 || fallback.themeColor10,
    '--bew-theme-color-20': vars.themeColor20 || fallback.themeColor20,
  }
  for (const [name, value] of Object.entries(resolved)) element.style.setProperty(name, value)
}

export function createNativeSelectDropdown(
  config: NativeSelectDropdownOptions = {},
): NativeSelectController {
  ensureGlobalStyle()
  const gap = config.gap ?? DEFAULT_DROPDOWN_GAP
  const maxHeight = config.maxHeight ?? DEFAULT_DROPDOWN_MAX_HEIGHT
  const minMenuWidth = config.minMenuWidth ?? DEFAULT_DROPDOWN_MIN_WIDTH
  const listboxId = `${DROPDOWN_ID_PREFIX}-${++nextDropdownId}`

  const trigger = document.createElement('button')
  trigger.type = 'button'
  if (config.triggerId) trigger.id = config.triggerId
  trigger.className = config.triggerClassName
    ? `bewly-native-select-trigger ${config.triggerClassName}`
    : 'bewly-native-select-trigger'
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.setAttribute('aria-controls', listboxId)

  const labelEl = document.createElement('span')
  labelEl.className = 'bewly-native-select-trigger__label'
  const arrowEl = createSvgIcon('M4 6l4 4 4-4', 'bewly-native-select-trigger__arrow')
  trigger.append(labelEl, arrowEl)

  const menu = document.createElement('div')
  menu.id = listboxId
  menu.className = config.menuClassName
    ? `bewly-native-select-menu ${config.menuClassName}`
    : 'bewly-native-select-menu'
  menu.setAttribute('role', 'listbox')
  menu.style.zIndex = config.zIndex ?? DEFAULT_DROPDOWN_Z_INDEX

  let options: NativeSelectOption[] = []
  let optionButtons: HTMLButtonElement[] = []
  let currentValue = ''
  let isOpen = false
  let closeTimer: number | undefined
  let openListenersAbort: AbortController | undefined
  let spaceKeyupAbort: AbortController | undefined
  let positionRaf: number | undefined
  /** 内容高度只随选项变化，缓存后避免每帧测量触发同步重排 */
  let contentHeightCache: number | undefined
  /** 上一帧的锚点/视口快照，未变化时跳过定位写入 */
  let lastPositionKey = ''

  function syncSelectionState() {
    let matchedLabel = ''
    optionButtons.forEach((button, index) => {
      const option = options[index]
      if (!option) return
      const selected = option.value === currentValue
      button.setAttribute('aria-selected', selected ? 'true' : 'false')
      if (selected) matchedLabel = option.label
    })
    if (!matchedLabel && options.length > 0) {
      const firstVisible = options.find((opt) => !opt.hidden)
      matchedLabel = firstVisible?.label ?? ''
    }
    if (labelEl.textContent !== matchedLabel) labelEl.textContent = matchedLabel
  }

  function resolveMountHost(): HTMLElement | ShadowRoot {
    // 默认挂到 document.body，脱离祖先层叠上下文与 Shadow DOM 边界，
    // 避免 transform/isolation/低 z-index 祖先把浮层裁切或盖住。
    if (config.mountTarget) return config.mountTarget
    return document.body || document.documentElement
  }

  function getEnabledIndices(): number[] {
    const indices: number[] = []
    options.forEach((option, index) => {
      if (!option.hidden && !option.disabled) indices.push(index)
    })
    return indices
  }

  function focusOptionByIndex(index: number) {
    const button = optionButtons[index]
    if (!button) return
    button.focus({ preventScroll: true })
    button.scrollIntoView({ block: 'nearest' })
  }

  /**
   * 测量浮层内容高度。scrollHeight 返回滚动内容高度、不受 max-height 钳制，
   * 因此无需临时放宽 max-height（那会让 max-height 变小时把 scrollTop 反复钳回顶部）。
   * 仅在选项变化或打开时调用。
   */
  function measureContentHeight(): number {
    if (menu.isConnected) {
      const measured = menu.scrollHeight
      if (measured > 0) contentHeightCache = measured
    }
    return contentHeightCache ?? maxHeight
  }

  /** 穿透多层开放 Shadow DOM 命中坐标下的实际元素，用于识别顶栏/吸顶头/滚动裁切遮挡。 */
  function deepElementFromPoint(x: number, y: number): Element | null {
    let current: Element | null = document.elementFromPoint(x, y)
    const visited = new Set<Element>()
    while (current?.shadowRoot && !visited.has(current)) {
      visited.add(current)
      const next = current.shadowRoot.elementFromPoint(x, y)
      if (!next || next === current) break
      current = next
    }
    return current
  }

  function isTriggerOccluded(
    rect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
  ): boolean {
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    if (cx < 0 || cx > viewportWidth || cy < 0 || cy > viewportHeight) return true
    const hit = deepElementFromPoint(cx, cy)
    if (!hit) return false
    return !trigger.contains(hit) && !menu.contains(hit)
  }

  function positionMenu(force = false, precomputedRect?: DOMRect): void {
    if (!trigger.isConnected) return

    const rect = precomputedRect ?? trigger.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight

    // 几何与视口都未变化时不做任何布局读写，避免每帧强制同步重排。
    const positionKey = [
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.bottom),
      Math.round(rect.width),
      Math.round(rect.height),
      viewportWidth,
      viewportHeight,
      contentHeightCache ?? 0,
    ].join(',')
    if (!force && positionKey === lastPositionKey) return

    // 仅在触发器几何变化时做遮挡检测（如滚到固定顶栏/宽屏吸顶栏/溢出裁切区背后），
    // 静态帧零开销，且在移动浮层前直接关闭，避免浮层先跳到顶栏上方再淡出。
    if (!force && isTriggerOccluded(rect, viewportWidth, viewportHeight)) {
      close()
      return
    }
    lastPositionKey = positionKey

    const spaceBelow = viewportHeight - rect.bottom - gap - DROPDOWN_VIEWPORT_MARGIN
    const spaceAbove = rect.top - gap - DROPDOWN_VIEWPORT_MARGIN
    const contentHeight = Math.min(maxHeight, contentHeightCache ?? maxHeight)
    const openUp = spaceBelow < contentHeight && spaceAbove > spaceBelow
    const availableHeight = Math.max(0, Math.min(maxHeight, openUp ? spaceAbove : spaceBelow))
    menu.dataset.openUp = openUp ? 'true' : 'false'

    const nextMaxHeight = `${availableHeight}px`
    if (menu.style.maxHeight !== nextMaxHeight) menu.style.maxHeight = nextMaxHeight

    // 宽度基于已有的 offsetWidth，不额外触发重排。
    const menuWidth = Math.max(menu.offsetWidth, Math.ceil(rect.width), minMenuWidth)
    const nextMinWidth = `${Math.max(Math.ceil(rect.width), minMenuWidth)}px`
    if (menu.style.minWidth !== nextMinWidth) menu.style.minWidth = nextMinWidth

    const maxLeft = Math.max(
      DROPDOWN_VIEWPORT_MARGIN,
      viewportWidth - menuWidth - DROPDOWN_VIEWPORT_MARGIN,
    )
    const left = Math.max(DROPDOWN_VIEWPORT_MARGIN, Math.min(rect.left, maxLeft))
    const nextLeft = `${left}px`
    if (menu.style.left !== nextLeft) menu.style.left = nextLeft

    if (openUp) {
      const nextBottom = `${Math.max(DROPDOWN_VIEWPORT_MARGIN, viewportHeight - rect.top + gap)}px`
      if (menu.style.top) menu.style.top = ''
      if (menu.style.bottom !== nextBottom) menu.style.bottom = nextBottom
    } else {
      const nextTop = `${Math.max(DROPDOWN_VIEWPORT_MARGIN, rect.bottom + gap)}px`
      if (menu.style.bottom) menu.style.bottom = ''
      if (menu.style.top !== nextTop) menu.style.top = nextTop
    }
  }

  function cleanupOpenListeners() {
    openListenersAbort?.abort()
    openListenersAbort = undefined
    stopPositionTracking()
  }

  // 打开期间持续按触发器位置重算浮层坐标：原生 <select> 弹层始终锚定触发器，
  // 这里用 rAF 模拟，滚动回复列表或页面时浮层跟随而非关闭。
  function startPositionTracking() {
    stopPositionTracking()
    const tick = () => {
      if (!isOpen) return
      if (!trigger.isConnected) {
        close()
        return
      }
      const rect = trigger.getBoundingClientRect()
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight
      // 触发器隐藏或完全离开视口时关闭，避免浮层悬空指向不可见入口。
      if (
        (rect.width === 0 && rect.height === 0) ||
        rect.bottom < 0 ||
        rect.top > viewportHeight ||
        rect.right < 0 ||
        rect.left > viewportWidth
      ) {
        close()
        return
      }
      positionMenu(false, rect)
      if (!isOpen) return
      positionRaf = requestAnimationFrame(tick)
    }
    positionRaf = requestAnimationFrame(tick)
  }

  function stopPositionTracking() {
    if (positionRaf !== undefined) {
      cancelAnimationFrame(positionRaf)
      positionRaf = undefined
    }
  }

  function close(closeOpts: { restoreFocus?: boolean } = {}) {
    if (!isOpen) return
    isOpen = false
    trigger.setAttribute('aria-expanded', 'false')
    cleanupOpenListeners()
    menu.classList.remove('is-open')

    window.clearTimeout(closeTimer)
    const finishDetach = () => {
      if (!isOpen && menu.isConnected) menu.remove()
    }
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === menu) finishDetach()
    }
    menu.addEventListener('transitionend', onTransitionEnd, { once: true })
    closeTimer = window.setTimeout(finishDetach, CLOSE_ANIMATION_FALLBACK_MS)

    if (closeOpts.restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true })
  }

  function attachOpenListeners() {
    cleanupOpenListeners()
    const abort = new AbortController()
    openListenersAbort = abort
    const { signal } = abort

    window.addEventListener(
      'pointerdown',
      (event) => {
        const path = event.composedPath()
        if (path.includes(trigger) || path.includes(menu)) return
        close()
      },
      { capture: true, signal },
    )

    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close({ restoreFocus: true })
        }
      },
      { capture: true, signal },
    )

    startPositionTracking()
  }

  function open() {
    if (isOpen || trigger.disabled) return

    window.clearTimeout(closeTimer)
    isOpen = true
    trigger.setAttribute('aria-expanded', 'true')
    applyDarkThemeFallbackVars(menu, trigger)

    const host = resolveMountHost()
    if (menu.parentElement !== host && menu.parentNode !== host) host.appendChild(menu)

    menu.classList.remove('is-open')
    // 挂载后先测一次内容高度，再按它决定方向与 max-height（此后不再每帧测量）。
    lastPositionKey = ''
    measureContentHeight()
    positionMenu(true)
    // 强制一帧后再加 is-open，保证 Shadow DOM 内每次打开都能播放入场过渡。
    void menu.offsetWidth
    menu.classList.add('is-open')
    attachOpenListeners()

    const selectedIndex = options.findIndex(
      (opt) => opt.value === currentValue && !opt.hidden && !opt.disabled,
    )
    const targetIndex = selectedIndex >= 0 ? selectedIndex : (getEnabledIndices()[0] ?? -1)
    if (targetIndex >= 0) {
      requestAnimationFrame(() => {
        if (isOpen) focusOptionByIndex(targetIndex)
      })
    }
  }

  function selectValue(nextValue: string) {
    const previousValue = currentValue
    currentValue = nextValue
    syncSelectionState()
    close({ restoreFocus: true })
    if (nextValue !== previousValue) config.onChange?.(nextValue)
  }

  function handleOptionClick(option: NativeSelectOption, disabled: boolean, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!disabled) selectValue(option.value)
  }

  function handleTriggerClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (isOpen) close()
    else open()
  }

  function handleTriggerPointerDown(event: PointerEvent) {
    // 阻止外层容器（如原版动态页空白点击收起评论）在 pointerdown 阶段误判或抢焦点
    event.stopPropagation()
  }

  function clearSpaceKeyupGuard() {
    spaceKeyupAbort?.abort()
    spaceKeyupAbort = undefined
  }

  // 空格键在 keydown 阶段已被下拉菜单消费后，捕获并拦截随后的 keyup，
  // 避免 B 站播放器在 keyup 阶段误触暂停或长按倍速。
  function swallowNextSpaceKeyup() {
    clearSpaceKeyupGuard()
    const abort = new AbortController()
    spaceKeyupAbort = abort
    const { signal } = abort
    window.addEventListener(
      'keyup',
      (event) => {
        if (event.key !== ' ' && event.code !== 'Space') return
        event.preventDefault()
        event.stopPropagation()
        clearSpaceKeyupGuard()
      },
      { capture: true, signal },
    )
    window.addEventListener('blur', clearSpaceKeyupGuard, { signal })
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (trigger.disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      open()
      return
    }
    // 空格在 keydown 阶段立即切换并拦截后续 keyup，避免触发 B 站播放器的暂停/长按倍速。
    if (event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      swallowNextSpaceKeyup()
      if (isOpen) close()
      else open()
      return
    }
    // 回车交给按钮原生激活，但要拦住冒泡。
    if (event.key === 'Enter') event.stopPropagation()
  }

  function handleMenuClick(event: MouseEvent) {
    event.stopPropagation()
  }

  function handleMenuPointerDown(event: PointerEvent) {
    event.stopPropagation()
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    const enabled = getEnabledIndices()
    if (enabled.length === 0) return

    const activeEl = (menu.getRootNode() as Document | ShadowRoot).activeElement
    const currentFocusedIndex =
      activeEl instanceof HTMLButtonElement ? optionButtons.indexOf(activeEl) : -1
    const pos = enabled.indexOf(currentFocusedIndex)

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault()
        event.stopPropagation()
        const nextPos = pos >= 0 ? (pos + 1) % enabled.length : 0
        focusOptionByIndex(enabled[nextPos])
        break
      }
      case 'ArrowUp': {
        event.preventDefault()
        event.stopPropagation()
        const nextPos = pos >= 0 ? (pos - 1 + enabled.length) % enabled.length : enabled.length - 1
        focusOptionByIndex(enabled[nextPos])
        break
      }
      case 'Home': {
        event.preventDefault()
        event.stopPropagation()
        focusOptionByIndex(enabled[0])
        break
      }
      case 'End': {
        event.preventDefault()
        event.stopPropagation()
        focusOptionByIndex(enabled[enabled.length - 1])
        break
      }
      case 'Tab': {
        close()
        break
      }
      case ' ':
      case 'Enter': {
        // 选项本身是 button；这里主动激活并阻断冒泡，避免空格被 B 站播放器快捷键占用。
        event.preventDefault()
        event.stopPropagation()
        if (event.key === ' ') swallowNextSpaceKeyup()
        if (pos >= 0) optionButtons[enabled[pos]]?.click()
        break
      }
    }
  }

  trigger.addEventListener('click', handleTriggerClick)
  trigger.addEventListener('pointerdown', handleTriggerPointerDown)
  trigger.addEventListener('keydown', handleTriggerKeydown)
  menu.addEventListener('click', handleMenuClick)
  menu.addEventListener('pointerdown', handleMenuPointerDown)
  menu.addEventListener('keydown', handleMenuKeydown)

  return {
    trigger,
    menu,
    getValue: () => currentValue,
    setValue: (value: string) => {
      currentValue = value
      syncSelectionState()
    },
    setOptions: (nextOptions: readonly NativeSelectOption[]) => {
      options = nextOptions.map((item) => ({ ...item }))
      const fragment = document.createDocumentFragment()
      optionButtons = options.map((option) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'bewly-native-select-option'
        button.setAttribute('role', 'option')
        button.dataset.value = option.value
        button.disabled = Boolean(option.disabled)
        button.hidden = Boolean(option.hidden)

        const textSpan = document.createElement('span')
        textSpan.textContent = option.label
        const checkSvg = createSvgIcon('M3.5 8.5l3 3 6-6.5', 'bewly-native-select-option__check')
        button.append(textSpan, checkSvg)

        button.addEventListener('click', (event) => {
          handleOptionClick(option, Boolean(option.disabled), event)
        })
        fragment.appendChild(button)
        return button
      })
      menu.replaceChildren(fragment)
      syncSelectionState()
      if (isOpen) {
        // 选项变化后内容高度可能改变，重新测量一次再定位（不在每帧重复测量）。
        contentHeightCache = undefined
        measureContentHeight()
        lastPositionKey = ''
        positionMenu(true)
      } else {
        // 关闭状态下菜单可能不在文档中，下次打开时重测。
        contentHeightCache = undefined
      }
    },
    setDisabled: (disabled: boolean) => {
      trigger.disabled = disabled
      if (disabled && isOpen) close()
    },
    setAriaLabel: (label: string) => {
      trigger.title = label
      trigger.setAttribute('aria-label', label)
      menu.setAttribute('aria-label', label)
    },
    close,
    destroy: () => {
      window.clearTimeout(closeTimer)
      clearSpaceKeyupGuard()
      cleanupOpenListeners()
      trigger.removeEventListener('click', handleTriggerClick)
      trigger.removeEventListener('pointerdown', handleTriggerPointerDown)
      trigger.removeEventListener('keydown', handleTriggerKeydown)
      menu.removeEventListener('click', handleMenuClick)
      menu.removeEventListener('pointerdown', handleMenuPointerDown)
      menu.removeEventListener('keydown', handleMenuKeydown)
      stopPositionTracking()
      menu.remove()
    },
  }
}
