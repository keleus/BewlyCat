<script lang="ts" setup>
import type { CSSProperties } from 'vue'
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import type { BewlyAppProvider } from '~/composables/useAppProvider'

type Placement = 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'

const props = withDefaults(defineProps<{
  content: string
  placement?: Placement
  type?: 'default' | 'dark' | 'white'
  /**
   * 浮层模式：将提示传送至 shadow root 顶层并以 fixed 定位，
   * 用于触发器处在 overflow:hidden 容器（如视频/动态封面）内的场景。
   * 默认关闭，保持原位纯 CSS 浮层行为不变；找不到顶层容器时也自动回退原位模式。
   */
  floating?: boolean
}>(), {
  placement: 'top',
  type: 'default',
  floating: false,
})

// 通用组件不能假设一定挂在 Bewly App 树内（useBewlyApp 在 dev 下无 provider 会抛错），
// 这里用安全 inject；仅 floating 模式需要它。
const app = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)
const teleportTarget = computed(() => app?.mainAppRef.value)
const floatingEnabled = computed(() => props.floating && Boolean(teleportTarget.value))

const anchorRef = ref<HTMLSpanElement>()
const tipRef = ref<HTMLDivElement>()
const visible = ref(false)
const tipStyles = ref<CSSProperties>({})

const GAP = 8
const INSET = 8
let rafId = 0
let listenersBound = false
let scrollRoot: ShadowRoot | undefined
let disposed = false

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** 按 placement 计算 fixed 坐标；视口空间不足时向对侧翻转，并夹紧到视口内。 */
function place() {
  const anchorRect = anchorRef.value?.getBoundingClientRect()
  const tip = tipRef.value
  if (!anchorRect || !tip)
    return

  const { width, height } = tip.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const fits = (space: number, size: number) => space >= size + GAP + INSET

  let left: number
  let top: number

  if (props.placement === 'left' || props.placement === 'right') {
    const spaceRight = viewportWidth - anchorRect.right
    const spaceLeft = anchorRect.left
    const preferRight = props.placement === 'right'
    // 首选方向放不下、对侧放得下时才翻转，避免临界宽度来回抖动
    const openRight = preferRight
      ? !(spaceRight < width + GAP + INSET && fits(spaceLeft, width))
      : (!fits(spaceLeft, width) && fits(spaceRight, width))

    left = openRight ? anchorRect.right + GAP : anchorRect.left - width - GAP
    top = anchorRect.top + anchorRect.height / 2 - height / 2
  }
  else {
    const spaceBelow = viewportHeight - anchorRect.bottom
    const spaceAbove = anchorRect.top
    const preferBelow = props.placement !== 'top'
    const openBelow = preferBelow
      ? !(spaceBelow < height + GAP + INSET && fits(spaceAbove, height))
      : (!fits(spaceAbove, height) && fits(spaceBelow, height))

    top = openBelow ? anchorRect.bottom + GAP : anchorRect.top - height - GAP

    if (props.placement === 'bottom-left')
      left = anchorRect.left
    else if (props.placement === 'bottom-right')
      left = anchorRect.right - width
    else
      left = anchorRect.left + anchorRect.width / 2 - width / 2
  }

  tipStyles.value = {
    left: `${clamp(left, INSET, viewportWidth - width - INSET)}px`,
    top: `${clamp(top, INSET, viewportHeight - height - INSET)}px`,
  }
}

function schedulePlace() {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(place)
}

function bindRepositionListeners() {
  if (listenersBound)
    return
  // 元素 scroll 不跨越 Shadow DOM 边界；同时监听组件所在根与外部页面。
  const root = anchorRef.value?.getRootNode()
  scrollRoot = root instanceof ShadowRoot ? root : undefined
  scrollRoot?.addEventListener('scroll', schedulePlace, { capture: true, passive: true })
  window.addEventListener('scroll', schedulePlace, { capture: true, passive: true })
  window.addEventListener('resize', schedulePlace)
  listenersBound = true
}

function unbindRepositionListeners() {
  if (!listenersBound)
    return
  scrollRoot?.removeEventListener('scroll', schedulePlace, { capture: true })
  scrollRoot = undefined
  window.removeEventListener('scroll', schedulePlace, { capture: true })
  window.removeEventListener('resize', schedulePlace)
  listenersBound = false
}

function showTip() {
  if (floatingEnabled.value && props.content)
    visible.value = true
}

function hideTip() {
  visible.value = false
}

// 显隐切换（含首次定位）与文案变化（加入/移除稍后再看会改变浮层宽度）共用一次重算
watch([visible, () => props.content, floatingEnabled], async ([isVisible, content, enabled]) => {
  if (!isVisible || !content || !enabled) {
    unbindRepositionListeners()
    cancelAnimationFrame(rafId)
    return
  }
  await nextTick()
  // nextTick 期间提示可能关闭或组件卸载，不能重新挂上全局监听。
  if (disposed || !visible.value || !props.content || !floatingEnabled.value)
    return
  place()
  bindRepositionListeners()
})

onBeforeUnmount(() => {
  disposed = true
  unbindRepositionListeners()
  cancelAnimationFrame(rafId)
})
</script>

<template>
  <span
    ref="anchorRef"
    class="b-tooltip-wrapper"
    @mouseenter="showTip"
    @mouseleave="hideTip"
    @focusin="showTip"
    @focusout="hideTip"
  >
    <!-- 浮层模式：传送至 shadow root 顶层，不受任何封面 overflow:hidden 裁切 -->
    <Teleport v-if="floatingEnabled && content" :to="teleportTarget!">
      <Transition name="b-tooltip-fade">
        <div
          v-if="visible"
          ref="tipRef"
          class="b-tooltip-floating"
          :class="`b-tooltip-floating--type-${type}`"
          role="tooltip"
          :style="tipStyles"
        >
          {{ content }}
        </div>
      </Transition>
    </Teleport>

    <!-- 默认（及 floating 不可用时的回退）：原位纯 CSS 浮层 -->
    <div
      v-else-if="content"
      class="b-tooltip"
      :class="[`b-tooltip--placement-${placement}`, `b-tooltip--type-${type}`]"
    >
      {{ content }}
    </div>
    <slot />
  </span>
</template>

<style lang="scss" scoped>
.b-tooltip-wrapper {
  --uno: "flex items-center relative";

  .b-tooltip {
    --uno: "absolute px-2 rounded-$bew-radius-half pointer-events-none opacity-0 duration-300 shadow-$bew-shadow-2 whitespace-nowrap z-9999";

    padding-block: var(--bew-space-1);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-medium);
    line-height: var(--bew-line-height-control);

    &--placement-right {
      --uno: "left-[calc(100%+0.5em)]";
    }

    &--placement-left {
      --uno: "right-[calc(100%+0.5em)]";
    }

    &--placement-top {
      --uno: "top--2.5em left-1/2 translate-x--1/2";
    }

    &--placement-bottom {
      --uno: "bottom--2.5em left-1/2 translate-x--1/2";
    }

    &--placement-bottom-left {
      --uno: "bottom--2.5em left--2";
    }

    &--placement-bottom-right {
      --uno: "bottom--2.5em right--2";
    }

    &--type-default {
      --uno: "text-white dark:text-black bg-black dark:bg-white";
    }

    &--type-dark {
      --uno: "text-white bg-black";
    }

    &--type-white {
      --uno: "text-black bg-white";
    }
  }

  &:hover .b-tooltip {
    --uno: "opacity-100";
  }
}

/* floating 模式样式自包含（不与上方 .b-tooltip 共享类，避免 opacity/定位优先级冲突）；
   传送后仍带本组件 scope id，故 --uno 工具类照常生效，配色与原位浮层完全一致。 */
.b-tooltip-floating {
  position: fixed;
  z-index: 9999;
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-radius-half);
  pointer-events: none;
  white-space: nowrap;
  box-shadow: var(--bew-shadow-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);

  &--type-default {
    --uno: "text-white dark:text-black bg-black dark:bg-white";
  }

  &--type-dark {
    --uno: "text-white bg-black";
  }

  &--type-white {
    --uno: "text-black bg-white";
  }
}

.b-tooltip-fade-enter-active,
.b-tooltip-fade-leave-active {
  transition: opacity var(--bew-duration-fast, 150ms) ease;
}

.b-tooltip-fade-enter-from,
.b-tooltip-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .b-tooltip-fade-enter-active,
  .b-tooltip-fade-leave-active {
    transition: none;
  }
}
</style>
