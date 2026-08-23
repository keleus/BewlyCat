import { settings } from '~/logic'

// Hover and focus-triggered opening are disabled when touchscreen optimization is enabled.
export function useDelayedHover({ enterDelay = 300, leaveDelay = 300, beforeEnter, enter, beforeLeave, leave }:
{ enterDelay?: number, leaveDelay?: number, beforeEnter?: () => void, enter: () => void, beforeLeave?: () => void, leave: () => void }) {
  const el = ref<HTMLElement>()

  let enterTimer: any | undefined
  let leaveTimer: any | undefined
  let focusWithin = false
  let mouseWithin = false
  // 区分焦点来源：鼠标点击弹窗内容也会把焦点落进去（focusin 冒泡到容器），
  // 若算作焦点驻留，移出后关闭逻辑会被 focusWithin 卡住，需要再点一下才能收起。
  // 只有非指针触发的焦点（键盘 Tab 等）才维持弹窗打开。
  let lastPointerDownAt = 0

  function clearHoverTimers() {
    if (enterTimer) {
      clearTimeout(enterTimer)
      enterTimer = undefined
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = undefined
    }
  }

  function scheduleEnter() {
    if (beforeEnter)
      beforeEnter()

    if (enterTimer) {
      clearTimeout(enterTimer)
      enterTimer = undefined
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = undefined
    }
    enterTimer = setTimeout(() => {
      enter()
    }, enterDelay)
  }
  function scheduleLeave() {
    if (focusWithin || mouseWithin)
      return

    if (beforeLeave)
      beforeLeave()

    if (enterTimer) {
      clearTimeout(enterTimer)
      enterTimer = undefined
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = undefined
    }
    leaveTimer = setTimeout(() => {
      leave()
    }, leaveDelay)
  }

  function handleMouseEnter() {
    mouseWithin = true
    scheduleEnter()
  }

  function handleMouseLeave() {
    mouseWithin = false
    scheduleLeave()
  }

  function handlePointerDown() {
    lastPointerDownAt = Date.now()
    // 指针交互接管驻留状态：清掉键盘留下的 focusWithin，避免焦点在弹窗内
    // 移动（不触发 focusout）导致鼠标移出后仍被旧状态卡住
    focusWithin = false
  }

  function handleFocusIn() {
    // pointerdown 后紧随的 focusin 是点击顺带产生的，不算键盘驻留
    if (Date.now() - lastPointerDownAt < 200)
      return

    focusWithin = true
    scheduleEnter()
  }

  function handleFocusOut(event: FocusEvent) {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && el.value?.contains(nextTarget))
      return

    focusWithin = false
    scheduleLeave()
  }

  function addInteractionListeners(element: HTMLElement) {
    element.addEventListener('pointerdown', handlePointerDown)
    element.addEventListener('focusin', handleFocusIn)
    element.addEventListener('focusout', handleFocusOut)
    element.addEventListener('mouseenter', handleMouseEnter)
    element.addEventListener('mouseleave', handleMouseLeave)
  }

  function removeInteractionListeners(element: HTMLElement) {
    element.removeEventListener('pointerdown', handlePointerDown)
    element.removeEventListener('focusin', handleFocusIn)
    element.removeEventListener('focusout', handleFocusOut)
    element.removeEventListener('mouseenter', handleMouseEnter)
    element.removeEventListener('mouseleave', handleMouseLeave)
  }

  watch(el, (element, _, onCleanup) => {
    if (element && !settings.value.touchScreenOptimization)
      addInteractionListeners(element)

    onCleanup(() => {
      if (element)
        removeInteractionListeners(element)
    })
  }, { flush: 'post' })

  watch(() => settings.value.touchScreenOptimization, (newValue) => {
    if (newValue) {
      clearHoverTimers()
      focusWithin = false
      mouseWithin = false
      if (el.value)
        removeInteractionListeners(el.value)
    }
    else if (el.value) {
      addInteractionListeners(el.value)
    }
  }, { immediate: true })

  onScopeDispose(clearHoverTimers)

  return el
}
