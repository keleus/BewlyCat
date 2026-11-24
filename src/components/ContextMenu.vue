<script setup lang="ts">
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'

export interface ContextMenuOption {
  value: string | number
  label: string
  icon: string
  danger?: boolean
  checked?: boolean
  type?: 'radio'
}

const props = defineProps<{
  options: ContextMenuOption[]
  menuStyles: CSSProperties
  cursorPosition?: { x: number; y: number }
  restoreFocus?: boolean
}>()

const emit = defineEmits<{
  (event: 'select', value: string | number): void
  (event: 'close'): void
}>()

const { mainAppRef } = useBewlyApp()
const activeIndex = ref(0)
const menuRef = ref<HTMLElement>()
const cursorStyles = ref<CSSProperties>()
const containerStyles = computed(() =>
  props.cursorPosition ? cursorStyles.value : props.menuStyles,
)

function positionAtCursor() {
  if (!props.cursorPosition || !menuRef.value) return

  const inset = 8
  const { width, height } = menuRef.value.getBoundingClientRect()
  cursorStyles.value = {
    position: 'fixed',
    margin: 0,
    left: `${Math.max(inset, Math.min(props.cursorPosition.x, window.innerWidth - width - inset))}px`,
    top: `${Math.max(inset, Math.min(props.cursorPosition.y, window.innerHeight - height - inset))}px`,
    maxWidth: `calc(100vw - ${inset * 2}px)`,
    maxHeight: `calc(100vh - ${inset * 2}px)`,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  }
}
const itemRefs = ref<Array<HTMLButtonElement | undefined>>([])

let triggerElement: HTMLElement | null = null
let shouldRestoreFocus = true

function getRootActiveElement() {
  const root = mainAppRef.value?.getRootNode()
  return root instanceof ShadowRoot
    ? (root.activeElement ?? document.activeElement)
    : document.activeElement
}

function setItemRef(element: Element | ComponentPublicInstance | null, index: number) {
  itemRefs.value[index] = element instanceof HTMLButtonElement ? element : undefined
}

function focusItem(index: number) {
  const itemCount = props.options.length
  if (!itemCount) return

  activeIndex.value = (index + itemCount) % itemCount
  nextTick(() => {
    const item = itemRefs.value[activeIndex.value]
    item?.focus({ preventScroll: true })
    if (!props.cursorPosition || !item || !menuRef.value) return

    const menuRect = menuRef.value.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    if (itemRect.top < menuRect.top) menuRef.value.scrollTop -= menuRect.top - itemRect.top
    else if (itemRect.bottom > menuRect.bottom)
      menuRef.value.scrollTop += itemRect.bottom - menuRect.bottom
  })
}

function dismissFromPointer() {
  shouldRestoreFocus = false
  emit('close')
}

function selectOption(option: ContextMenuOption) {
  emit('select', option.value)
  if (option.checked === undefined) emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      event.stopPropagation()
      focusItem(activeIndex.value + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      event.stopPropagation()
      focusItem(activeIndex.value - 1)
      break
    case 'Home':
      event.preventDefault()
      event.stopPropagation()
      focusItem(0)
      break
    case 'End':
      event.preventDefault()
      event.stopPropagation()
      focusItem(props.options.length - 1)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      event.stopPropagation()
      if (props.options[activeIndex.value]) selectOption(props.options[activeIndex.value])
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      emit('close')
      break
    case 'Tab':
      // Let the browser continue its normal tab order after closing the menu.
      shouldRestoreFocus = false
      emit('close')
      break
  }
}

onMounted(() => {
  positionAtCursor()
  const activeElement = getRootActiveElement()
  triggerElement = activeElement instanceof HTMLElement ? activeElement : null
  focusItem(0)
})

onBeforeUnmount(() => {
  if (props.restoreFocus !== false && shouldRestoreFocus && triggerElement?.isConnected)
    triggerElement.focus({ preventScroll: true })
})
</script>

<template>
  <Teleport :to="mainAppRef">
    <div
      ref="menuRef"
      class="context-menu-container"
      :class="{ 'context-menu-container--cursor': cursorPosition }"
      :style="containerStyles"
      style="
        backdrop-filter: var(--bew-filter-glass-1);
        box-shadow: var(--bew-shadow-1);
        z-index: 9999;
      "
      bg="$bew-elevated"
      min-w-140px
      m="t-1 l-[calc(-140px+0.5rem)]"
      border="1 $bew-popover-border-color"
      @contextmenu.prevent.stop
    >
      <ul
        class="context-menu-list"
        role="menu"
        aria-orientation="vertical"
        flex="~ col gap-1"
        @keydown="handleKeydown"
      >
        <li v-for="(option, index) in options" :key="option.value" role="none">
          <button
            :ref="(element) => setItemRef(element, index)"
            type="button"
            :role="
              option.type === 'radio'
                ? 'menuitemradio'
                : option.checked === undefined
                  ? 'menuitem'
                  : 'menuitemcheckbox'
            "
            :aria-checked="option.checked"
            class="context-menu-item"
            :class="{ danger: option.danger, active: activeIndex === index }"
            :tabindex="activeIndex === index ? 0 : -1"
            @mouseenter="activeIndex = index"
            @focus="activeIndex = index"
            @click="selectOption(option)"
          >
            <i class="item-icon" :class="option.icon" />
            <span class="item-label">{{ option.label }}</span>
            <i
              v-if="option.checked !== undefined"
              class="item-check"
              :class="{ 'i-mingcute:check-line': option.checked }"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>
    </div>

    <!-- 点击遮罩关闭菜单 -->
    <div
      pos="fixed top-0 left-0"
      w-full
      h-full
      style="z-index: 9998"
      @click="dismissFromPointer"
      @contextmenu.prevent.stop="dismissFromPointer"
    />
  </Teleport>
</template>

<style lang="scss" scoped>
.context-menu-container {
  padding: var(--bew-context-menu-padding);
  border-radius: var(--bew-popover-radius);
}

.context-menu-container--cursor {
  position: fixed;
  box-sizing: border-box;
  margin: 0;
  width: max-content;
  min-width: min(220px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.item-label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.item-check {
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
  flex: none;
  margin-left: var(--bew-space-2);
  color: var(--bew-theme-color);
}

.context-menu-list,
.context-menu-list > li {
  margin: 0;
  padding: 0;
  list-style: none;
}

.context-menu-item {
  --uno: 'flex items-center cursor-pointer';

  width: 100%;
  min-height: 32px;
  padding: var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-menu-item-radius);
  color: inherit;
  background: transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-align: left;
  appearance: none;

  &:hover,
  &.active {
    background: var(--bew-fill-2);
  }

  &:active {
    background: var(--bew-fill-3);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: calc(var(--bew-space-0-5) * -1);
  }

  &.danger {
    color: var(--bew-error-color);

    .item-icon {
      color: var(--bew-error-color);
    }
  }
}

.item-icon {
  --uno: 'inline-block color-$bew-text-color-2';

  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
  flex: none;
  margin-right: var(--bew-space-2);
}
</style>
