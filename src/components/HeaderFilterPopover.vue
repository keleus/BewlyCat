<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'

import { settings } from '~/logic'

// 页面标签栏旁的过滤入口：图标按钮 + 锚定浮层。内容由调用方通过插槽提供，
// 打开、关闭时机通过事件通知调用方，以便在关闭时按新条件刷新列表。
defineProps<{
  /** 按钮的无障碍名称与悬停提示 */
  label: string
  /** 浮层标题 */
  title: string
  /** 有过滤条件生效时图标改为实心 */
  active?: boolean
}>()

const emit = defineEmits<{
  open: []
  close: []
}>()

const PANEL_WIDTH = 320
const VIEWPORT_MARGIN = 8
const PANEL_GAP = 8
const MIN_PANEL_HEIGHT = 160

const rootRef = ref<HTMLElement>()
const triggerRef = ref<HTMLButtonElement>()
const open = ref(false)
const panelStyle = ref<Record<string, string>>({})

function placePanel() {
  const root = rootRef.value
  const trigger = triggerRef.value
  if (!root || !trigger)
    return

  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const rootRect = root.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2)
  // 默认与按钮右对齐；窄屏换行后按钮靠左时，向右推回视口内。
  const left = Math.max(VIEWPORT_MARGIN, Math.min(triggerRect.right - width, viewportWidth - VIEWPORT_MARGIN - width))
  const top = rootRect.bottom + PANEL_GAP

  panelStyle.value = {
    width: `${width}px`,
    left: `${left - rootRect.left}px`,
    maxHeight: `${Math.max(MIN_PANEL_HEIGHT, viewportHeight - top - VIEWPORT_MARGIN)}px`,
  }
}

function show() {
  placePanel()
  open.value = true
  emit('open')
}

function close(options: { restoreFocus?: boolean } = {}) {
  if (!open.value)
    return
  open.value = false
  if (options.restoreFocus)
    triggerRef.value?.focus({ preventScroll: true })
  emit('close')
}

function toggle() {
  if (open.value)
    close()
  else
    show()
}

onClickOutside(rootRef, () => close())
useEventListener(window, 'resize', () => {
  if (open.value)
    placePanel()
})

defineExpose({ close })
</script>

<template>
  <div ref="rootRef" class="header-filter" @keydown.esc.stop="close({ restoreFocus: true })">
    <div
      class="glass-panel bew-segment-control bew-segment-control--surface bew-segment-control--static"
      :class="{ 'bew-segment-control--solid': !settings.enableFrostedGlass }"
      flex="~ shrink-0 items-center"
      box-border
    >
      <button
        ref="triggerRef"
        type="button"
        class="bew-segment-control__item bew-segment-control__item--icon"
        :data-active="open ? 'true' : undefined"
        :title="label"
        :aria-label="label"
        :aria-expanded="open"
        aria-haspopup="dialog"
        @click="toggle"
      >
        <span
          class="bew-segment-control__icon"
          :class="active ? 'i-mingcute:filter-2-fill' : 'i-mingcute:filter-2-line'"
          aria-hidden="true"
        />
      </button>
    </div>

    <Transition name="bew-pop">
      <div
        v-if="open"
        class="header-filter__panel bew-popover-surface"
        style="backdrop-filter: var(--bew-pop-glass, var(--bew-filter-glass-1));"
        :style="panelStyle"
        role="dialog"
        :aria-label="title"
      >
        <header class="header-filter__header">
          <span class="header-filter__title">{{ title }}</span>
          <slot name="actions" :close="close" />
        </header>
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.header-filter {
  position: relative;
  flex-shrink: 0;
}

.header-filter__panel {
  position: absolute;
  top: calc(100% + var(--bew-space-2));
  z-index: 10;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--bew-space-4);
  transform-origin: top right;
}

.header-filter__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-3);
}

.header-filter__title {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

// 插槽内容在调用方作用域编译，共用的分区与文字样式通过 :slotted 提供。
:slotted(.header-filter-section) {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
}

:slotted(.header-filter-section + .header-filter-section) {
  margin-top: var(--bew-space-3);
  padding-top: var(--bew-space-3);
  border-top: 1px solid var(--bew-border-color);
}

:slotted(.header-filter-item) {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

:slotted(.header-filter-switch) {
  justify-content: space-between;
  width: 100%;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

:slotted(.header-filter-caption) {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

:slotted(.header-filter-link) {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--bew-theme-color);
  font: inherit;
  font-size: var(--bew-font-size-caption);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}
</style>
