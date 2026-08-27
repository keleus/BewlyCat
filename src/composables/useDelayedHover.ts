import { useEventListener } from '@vueuse/core'
import type { Ref } from 'vue'

import { settings } from '~/logic'

// Hover and focus-triggered opening are disabled when touchscreen optimization is enabled.
export function useDelayedHover({ enterDelay = 300, leaveDelay = 300, beforeEnter, enter, beforeLeave, leave }:
{ enterDelay?: number, leaveDelay?: number, beforeEnter?: () => void, enter: () => void, beforeLeave?: () => void, leave: () => void }) {
  const el = ref<HTMLElement>() as Ref<HTMLElement | undefined> & { reset: () => void }

  let enterTimer: any | undefined
  let leaveTimer: any | undefined
  let focusWithin = false
  let mouseWithin = false
  let isEntered = false
  // 区分焦点来源：鼠标点击弹窗内容也会把焦点落进去（focusin 冒泡到容器），
  // 若算作焦点驻留，移出后关闭逻辑会被 focusWithin 卡住，需要再点一下才能收起。
  // 只有非指针触发的焦点（键盘 Tab 等）才维持弹窗打开。
  let lastPointerDownAt = 0
  // 切回标签页时浏览器会恢复失焦前的焦点并向该元素派发 focusin（实测与
  // window:focus 同任务、间隔约 1ms），这不是键盘驻留，却会把弹窗重新打开。
  // 用 restoringWindowFocus 标记过滤这批焦点事件：window:focus 时置位，
  // 渲染一帧后自动过期 —— 恢复焦点的 focusin 必然落在同帧内，而真实键盘
  // Tab 聚焦发生在人手操作的时间尺度上，远晚于一帧。
  let restoringWindowFocus = false

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
      isEntered = true
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
      isEntered = false
      leave()
    }, leaveDelay)
  }

  // 主动复位该 hover 实例：清掉 pending enter/leave timer、回到 idle、关闭已打开弹窗。
  // 幂等，可重复调用。
  // focusWithin 承担键盘/焦点语义（键盘 Tab 驻留弹窗），不属于 hover 的 transient
  // 状态，reset() 不清除它，避免破坏键盘驻留。
  function reset() {
    clearHoverTimers()
    mouseWithin = false
    if (isEntered) {
      isEntered = false
      if (beforeLeave)
        beforeLeave()
      leave()
    }
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

    // 切回标签页时浏览器恢复焦点派发的 focusin 也不算键盘驻留
    if (restoringWindowFocus)
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

  // 页面失焦（如点击打开新标签、切换到其它窗口）是交互生命周期边界：复位 hover 状态，
  // 避免 pending enter timer 在后台标签触发把弹窗重新打开，或已打开的弹窗残留到下次聚焦。
  // VueUse useEventListener 随组件 scope 自动清理，不会重复注册。
  useEventListener(window, 'blur', reset)

  // 标记窗口正在恢复焦点：本帧内到达的 focusin 是浏览器自动恢复的焦点，
  // 不代表键盘驻留（见 restoringWindowFocus 注释）。渲染一帧后标记过期。
  useEventListener(window, 'focus', () => {
    restoringWindowFocus = true
    requestAnimationFrame(() => {
      restoringWindowFocus = false
    })
  })

  el.reset = reset

  return el
}
