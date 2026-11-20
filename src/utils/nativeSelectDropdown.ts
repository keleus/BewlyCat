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
  /** 浮层挂载目标；默认挂到触发器同属 ShadowRoot 或 document.body，确保继承宿主样式 */
  mountTarget?: HTMLElement | ShadowRoot
  /** 浮层与触发器的间距，默认 8px（对齐 Select.vue） */
  gap?: number
  /** 浮层最大高度，默认 300px（对齐 Select.vue） */
  maxHeight?: number
  /** 浮层最小宽度，默认 100px */
  minMenuWidth?: number
  /** z-index（可用 CSS var 回退字符串） */
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
const DEFAULT_DROPDOWN_GAP = 8
const DEFAULT_DROPDOWN_MAX_HEIGHT = 300
const DEFAULT_DROPDOWN_MIN_WIDTH = 100
const CLOSE_ANIMATION_FALLBACK_MS = 220
const DEFAULT_DROPDOWN_Z_INDEX = '10004'

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
  cursor: wait;
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
  gap: var(--bew-space-0-5, 2px);
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

let nextDropdownId = 0

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

function getEffectiveThemeVars(anchor: HTMLElement): {
  elevated: string
  text1: string
  borderColor: string
  fill2: string
  themeColor: string
} {
  // 向上兼容宿主或文档样式（如视频页关闭「适应其他页面样式」时仅局部存在主题变量）
  const anchorStyle = getComputedStyle(anchor)
  const rootStyle = getComputedStyle(document.documentElement)
  const readVar = (name: string) => anchorStyle.getPropertyValue(name).trim() || rootStyle.getPropertyValue(name).trim()
  return {
    elevated: readVar('--bew-elevated'),
    text1: readVar('--bew-text-1'),
    borderColor: readVar('--bew-popover-border-color'),
    fill2: readVar('--bew-fill-2'),
    themeColor: readVar('--bew-theme-color'),
  }
}

function applyDarkThemeFallbackVars(element: HTMLElement, anchor: HTMLElement): void {
  // 在未开启「适应其他页面样式」的深色上下文或未继承变量的场景提供兜底，
  // 已有外层 `--bew-elevated` 等自定义属性时优先沿用主题变量。
  const vars = getEffectiveThemeVars(anchor)
  const hasThemeVars = Boolean(vars.elevated)
  const hasThemeColor = Boolean(vars.themeColor)
  if (hasThemeVars) {
    element.style.removeProperty('--bew-elevated')
    element.style.removeProperty('--bew-text-1')
    element.style.removeProperty('--bew-popover-border-color')
    element.style.removeProperty('--bew-fill-2')
  }
  if (hasThemeColor) {
    element.style.removeProperty('--bew-theme-color')
    element.style.removeProperty('--bew-theme-color-10')
    element.style.removeProperty('--bew-theme-color-20')
  }
  if (hasThemeVars && hasThemeColor)
    return

  if (isDarkModeActive()) {
    if (!hasThemeVars) {
      element.style.setProperty('--bew-elevated', 'rgba(42, 45, 50, 0.92)')
      element.style.setProperty('--bew-text-1', '#f1f2f3')
      element.style.setProperty('--bew-popover-border-color', 'rgba(255, 255, 255, 0.14)')
      element.style.setProperty('--bew-fill-2', 'rgba(131, 131, 145, 0.24)')
    }
    if (!hasThemeColor) {
      element.style.setProperty('--bew-theme-color', '#00aeec')
      element.style.setProperty('--bew-theme-color-10', 'rgba(0, 174, 236, 0.14)')
      element.style.setProperty('--bew-theme-color-20', 'rgba(0, 174, 236, 0.24)')
    }
  }
  else {
    if (!hasThemeVars) {
      element.style.setProperty('--bew-elevated', 'rgba(255, 255, 255, 0.92)')
      element.style.setProperty('--bew-text-1', '#18191c')
      element.style.setProperty('--bew-popover-border-color', 'rgba(148, 153, 160, 0.28)')
      element.style.setProperty('--bew-fill-2', 'rgba(131, 131, 145, 0.16)')
    }
    if (!hasThemeColor) {
      element.style.setProperty('--bew-theme-color', '#00aeec')
      element.style.setProperty('--bew-theme-color-10', 'rgba(0, 174, 236, 0.12)')
      element.style.setProperty('--bew-theme-color-20', 'rgba(0, 174, 236, 0.2)')
    }
  }
}

export function createNativeSelectDropdown(
  config: NativeSelectDropdownOptions = {},
): NativeSelectController {
  const gap = config.gap ?? DEFAULT_DROPDOWN_GAP
  const maxHeight = config.maxHeight ?? DEFAULT_DROPDOWN_MAX_HEIGHT
  const minMenuWidth = config.minMenuWidth ?? DEFAULT_DROPDOWN_MIN_WIDTH
  const listboxId = `bewly-native-select-menu-${++nextDropdownId}`

  const trigger = document.createElement('button')
  trigger.type = 'button'
  if (config.triggerId)
    trigger.id = config.triggerId
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

  function syncSelectionState() {
    let matchedLabel = ''
    optionButtons.forEach((button, index) => {
      const option = options[index]
      if (!option)
        return
      const selected = option.value === currentValue
      button.setAttribute('aria-selected', selected ? 'true' : 'false')
      if (selected)
        matchedLabel = option.label
    })
    if (!matchedLabel && options.length > 0) {
      const firstVisible = options.find(opt => !opt.hidden)
      matchedLabel = firstVisible?.label ?? ''
    }
    if (labelEl.textContent !== matchedLabel)
      labelEl.textContent = matchedLabel
  }

  function resolveMountHost(): HTMLElement | ShadowRoot {
    if (config.mountTarget)
      return config.mountTarget
    const root = trigger.getRootNode()
    if (root instanceof ShadowRoot)
      return root
    return document.body || document.documentElement
  }

  function getEnabledIndices(): number[] {
    const indices: number[] = []
    options.forEach((option, index) => {
      if (!option.hidden && !option.disabled)
        indices.push(index)
    })
    return indices
  }

  function focusOptionByIndex(index: number) {
    const button = optionButtons[index]
    if (!button)
      return
    button.focus({ preventScroll: true })
    button.scrollIntoView({ block: 'nearest' })
  }

  function positionMenu() {
    if (!trigger.isConnected)
      return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom - gap - DROPDOWN_VIEWPORT_MARGIN
    const spaceAbove = rect.top - gap - DROPDOWN_VIEWPORT_MARGIN

    // 先按默认展开方向预估高度，再按真实内容高度校正是否上翻。
    menu.style.maxHeight = `${maxHeight}px`
    menu.style.minWidth = `${Math.max(Math.ceil(rect.width), minMenuWidth)}px`
    const contentHeight = Math.min(maxHeight, menu.scrollHeight || maxHeight)
    const openUp = spaceBelow < contentHeight && spaceAbove > spaceBelow
    const availableHeight = Math.max(0, Math.min(maxHeight, openUp ? spaceAbove : spaceBelow))
    menu.style.maxHeight = `${availableHeight}px`
    menu.dataset.openUp = openUp ? 'true' : 'false'

    const menuWidth = Math.max(menu.offsetWidth, Math.ceil(rect.width), minMenuWidth)
    const maxLeft = Math.max(DROPDOWN_VIEWPORT_MARGIN, viewportWidth - menuWidth - DROPDOWN_VIEWPORT_MARGIN)
    const left = Math.max(DROPDOWN_VIEWPORT_MARGIN, Math.min(rect.left, maxLeft))
    menu.style.left = `${left}px`

    if (openUp) {
      menu.style.top = ''
      menu.style.bottom = `${Math.max(DROPDOWN_VIEWPORT_MARGIN, viewportHeight - rect.top + gap)}px`
    }
    else {
      menu.style.bottom = ''
      menu.style.top = `${Math.max(DROPDOWN_VIEWPORT_MARGIN, rect.bottom + gap)}px`
    }
  }

  function cleanupOpenListeners() {
    openListenersAbort?.abort()
    openListenersAbort = undefined
  }

  function close(closeOpts: { restoreFocus?: boolean } = {}) {
    if (!isOpen)
      return
    isOpen = false
    trigger.setAttribute('aria-expanded', 'false')
    cleanupOpenListeners()
    menu.classList.remove('is-open')

    window.clearTimeout(closeTimer)
    const finishDetach = () => {
      if (!isOpen && menu.isConnected)
        menu.remove()
    }
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === menu)
        finishDetach()
    }
    menu.addEventListener('transitionend', onTransitionEnd, { once: true })
    closeTimer = window.setTimeout(finishDetach, CLOSE_ANIMATION_FALLBACK_MS)

    if (closeOpts.restoreFocus && trigger.isConnected)
      trigger.focus({ preventScroll: true })
  }

  function attachOpenListeners() {
    cleanupOpenListeners()
    const abort = new AbortController()
    openListenersAbort = abort
    const { signal } = abort

    window.addEventListener('pointerdown', (event) => {
      const path = event.composedPath()
      if (path.includes(trigger) || path.includes(menu))
        return
      close()
    }, { capture: true, signal })

    window.addEventListener('wheel', (event) => {
      if (!event.composedPath().includes(menu))
        close()
    }, { capture: true, passive: true, signal })

    window.addEventListener('scroll', (event) => {
      if (!event.composedPath().includes(menu))
        close()
    }, { capture: true, passive: true, signal })

    window.addEventListener('resize', () => close(), { signal })

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close({ restoreFocus: true })
      }
    }, { capture: true, signal })
  }

  function open() {
    if (isOpen || trigger.disabled)
      return

    window.clearTimeout(closeTimer)
    isOpen = true
    trigger.setAttribute('aria-expanded', 'true')
    applyDarkThemeFallbackVars(menu, trigger)

    const host = resolveMountHost()
    if (menu.parentElement !== host && menu.parentNode !== host)
      host.appendChild(menu)

    menu.classList.remove('is-open')
    positionMenu()
    // 强制一帧后再加 is-open，保证 Shadow DOM 内每次打开都能播放入场过渡。
    void menu.offsetWidth
    menu.classList.add('is-open')
    attachOpenListeners()

    const selectedIndex = options.findIndex(opt => opt.value === currentValue && !opt.hidden && !opt.disabled)
    const targetIndex = selectedIndex >= 0 ? selectedIndex : (getEnabledIndices()[0] ?? -1)
    if (targetIndex >= 0) {
      requestAnimationFrame(() => {
        if (isOpen)
          focusOptionByIndex(targetIndex)
      })
    }
  }

  function selectValue(nextValue: string) {
    const previousValue = currentValue
    currentValue = nextValue
    syncSelectionState()
    close({ restoreFocus: true })
    if (nextValue !== previousValue)
      config.onChange?.(nextValue)
  }

  function handleTriggerClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (isOpen)
      close()
    else
      open()
  }

  function handleTriggerPointerDown(event: PointerEvent) {
    // 阻止外层容器（如原版动态页空白点击收起评论）在 pointerdown 阶段误判或抢焦点
    event.stopPropagation()
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (trigger.disabled)
      return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      open()
    }
  }

  function handleMenuClick(event: MouseEvent) {
    event.stopPropagation()
  }

  function handleMenuPointerDown(event: PointerEvent) {
    event.stopPropagation()
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    const enabled = getEnabledIndices()
    if (enabled.length === 0)
      return

    const activeEl = (menu.getRootNode() as Document | ShadowRoot).activeElement
    const currentFocusedIndex = activeEl instanceof HTMLButtonElement
      ? optionButtons.indexOf(activeEl)
      : -1
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
      options = nextOptions.map(item => ({ ...item }))
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
          event.preventDefault()
          event.stopPropagation()
          if (!button.disabled)
            selectValue(option.value)
        })
        fragment.appendChild(button)
        return button
      })
      menu.replaceChildren(fragment)
      syncSelectionState()
      if (isOpen)
        positionMenu()
    },
    setDisabled: (disabled: boolean) => {
      trigger.disabled = disabled
      if (disabled && isOpen)
        close()
    },
    setAriaLabel: (label: string) => {
      trigger.title = label
      trigger.setAttribute('aria-label', label)
      menu.setAttribute('aria-label', label)
    },
    close,
    destroy: () => {
      window.clearTimeout(closeTimer)
      cleanupOpenListeners()
      trigger.removeEventListener('click', handleTriggerClick)
      trigger.removeEventListener('pointerdown', handleTriggerPointerDown)
      trigger.removeEventListener('keydown', handleTriggerKeydown)
      menu.removeEventListener('click', handleMenuClick)
      menu.removeEventListener('pointerdown', handleMenuPointerDown)
      menu.removeEventListener('keydown', handleMenuKeydown)
      menu.remove()
    },
  }
}
