import { settings } from '~/logic'

// Hover and focus-triggered opening are disabled when touchscreen optimization is enabled.
export function useDelayedHover({ enterDelay = 300, leaveDelay = 300, beforeEnter, enter, beforeLeave, leave }:
{ enterDelay?: number, leaveDelay?: number, beforeEnter?: () => void, enter: () => void, beforeLeave?: () => void, leave: () => void }) {
  const el = ref<HTMLElement>()

  let enterTimer: any | undefined
  let leaveTimer: any | undefined
  let focusWithin = false
  let mouseWithin = false

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

  function handleFocusIn() {
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
    element.addEventListener('focusin', handleFocusIn)
    element.addEventListener('focusout', handleFocusOut)
    element.addEventListener('mouseenter', handleMouseEnter)
    element.addEventListener('mouseleave', handleMouseLeave)
  }

  function removeInteractionListeners(element: HTMLElement) {
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
