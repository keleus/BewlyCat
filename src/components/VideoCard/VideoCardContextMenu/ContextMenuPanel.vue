<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

export interface ContextMenuPanelItem {
  key: string | number
  name: string
  icon: string
  color?: string
  select: () => void
}

// 视频卡片菜单的外壳：定位、滚动指示、键盘导航与遮罩，选项和对应操作由调用方提供。
const props = defineProps<{
  show: boolean
  groups: ContextMenuPanelItem[][]
  menuStyles: CSSProperties
  triggerElement?: HTMLElement | null
}>()
const emit = defineEmits<{
  (event: 'close'): void
}>()

const { t } = useI18n()

// styles 带 bottom（无 top）即向上展开，缩放原点随之翻转到锚点下缘
const opensUpward = computed(() => props.menuStyles.bottom !== undefined && props.menuStyles.top === undefined)
const visibleGroups = computed(() => props.groups.filter(group => group.length > 0))

const menuListRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)
const activeMenuIndex = ref(0)
let shouldRestoreFocus = true

function getMenuItems() {
  return Array.from(menuListRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
}

function focusMenuItem(index: number) {
  const items = getMenuItems()
  if (!items.length)
    return

  activeMenuIndex.value = (index + items.length) % items.length
  items.forEach((item, itemIndex) => item.tabIndex = itemIndex === activeMenuIndex.value ? 0 : -1)
  items[activeMenuIndex.value].focus({ preventScroll: true })
}

function setActiveMenuItem(event: FocusEvent) {
  const index = getMenuItems().indexOf(event.currentTarget as HTMLButtonElement)
  if (index >= 0)
    activeMenuIndex.value = index
}

function handleMenuKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      focusMenuItem(activeMenuIndex.value + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      focusMenuItem(activeMenuIndex.value - 1)
      break
    case 'Home':
      event.preventDefault()
      focusMenuItem(0)
      break
    case 'End':
      event.preventDefault()
      focusMenuItem(getMenuItems().length - 1)
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      emit('close')
      break
    case 'Tab':
      shouldRestoreFocus = false
      emit('close')
      break
  }
}

// 处理滚动事件，更新箭头显示状态
function handleScroll() {
  if (!menuListRef.value)
    return

  const { scrollTop, scrollHeight, clientHeight } = menuListRef.value
  canScrollUp.value = scrollTop > 0
  canScrollDown.value = scrollTop < scrollHeight - clientHeight - 5 // 5px 容差
}

function scrollToTop() {
  menuListRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToBottom() {
  if (!menuListRef.value)
    return
  menuListRef.value.scrollTo({ top: menuListRef.value.scrollHeight, behavior: 'smooth' })
}

// 监听菜单列表尺寸变化，确保滚动指示器状态正确
let resizeObserver: ResizeObserver | null = null

watch(() => props.show, (show) => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!show)
    return

  nextTick(() => {
    handleScroll()
    focusMenuItem(0)
    if (menuListRef.value) {
      resizeObserver = new ResizeObserver(handleScroll)
      resizeObserver.observe(menuListRef.value)
    }
  })
}, { immediate: true })

// Fixed menu coordinates are calculated from the viewport at open time. Close
// when its dimensions change so an upward menu cannot drift from its trigger.
function handleViewportResize() {
  if (props.show)
    emit('close')
}

onMounted(() => {
  window.addEventListener('resize', handleViewportResize)
  window.visualViewport?.addEventListener('resize', handleViewportResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleViewportResize)
  window.visualViewport?.removeEventListener('resize', handleViewportResize)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (shouldRestoreFocus && props.triggerElement?.isConnected)
    props.triggerElement.focus({ preventScroll: true })
})
</script>

<template>
  <Transition name="context-menu" appear>
    <div
      v-if="show"
      style="backdrop-filter: var(--b-context-menu-glass, var(--bew-filter-glass-1));"
      :style="menuStyles"
      class="context-menu-container bew-popover-surface"
      :class="opensUpward && 'context-menu-container--up'"
    >
      <button
        v-show="canScrollUp"
        type="button"
        class="scroll-indicator scroll-indicator-top"
        :aria-label="t('video_card.operation.scroll_top')"
        @click="scrollToTop"
      >
        <i class="i-mingcute:up-line" aria-hidden="true" />
      </button>

      <ul
        ref="menuListRef"
        flex="~ col gap-1"
        class="context-menu-list"
        role="menu"
        aria-orientation="vertical"
        @scroll="handleScroll"
        @keydown="handleMenuKeydown"
      >
        <template v-for="(group, index) in visibleGroups" :key="index">
          <li
            v-for="item in group"
            :key="item.key"
            role="none"
          >
            <button
              type="button" role="menuitem" tabindex="-1" class="context-menu-item" :class="item.color"
              @focus="setActiveMenuItem" @click="item.select()"
            >
              <i class="item-icon" :class="[item.icon, item.color]" />
              {{ item.name }}
            </button>
          </li>

          <div v-if="index !== visibleGroups.length - 1" class="divider" role="separator" />
        </template>
      </ul>

      <button
        v-show="canScrollDown"
        type="button"
        class="scroll-indicator scroll-indicator-bottom"
        :aria-label="t('video_card.operation.scroll_bottom')"
        @click="scrollToBottom"
      >
        <i class="i-mingcute:down-line" aria-hidden="true" />
      </button>
    </div>
  </Transition>

  <!-- mask -->
  <Transition name="fade">
    <div
      v-if="show"
      pos="fixed top-0 left-0" w-full h-full
      style="z-index: 9998;"
      @click="emit('close')"
      @click.right.prevent.stop="emit('close')"
    />
  </Transition>
</template>

<style lang="scss" scoped>
// Chromium 在 opacity/transform 动画期间会丢弃 backdrop-filter（crbug.com/40877283），
// 故玻璃与缩放同步插值到恒等滤镜，避免动画结束才出现毛玻璃
.context-menu-enter-active,
.context-menu-leave-active {
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard),
    backdrop-filter var(--bew-duration-fast) var(--bew-ease-standard);
}

.context-menu-enter-from,
.context-menu-leave-to {
  --b-context-menu-glass: blur(0px) saturate(100%);

  opacity: 0;
  transform: scale(0.9);
}

.context-menu-item {
  --uno: "hover:bg-$bew-fill-2 rounded-$bew-menu-item-radius cursor-pointer";
  --uno: "flex items-center transition-colors duration-200 ease-$bew-ease-standard";

  width: 100%;
  min-height: 32px;
  padding: var(--bew-space-2) var(--bew-space-3) var(--bew-space-2) var(--bew-space-2);
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
}

.item-icon {
  --uno: "inline-block color-$bew-text-color-2";

  margin-right: var(--bew-space-3);
}

.divider {
  --uno: "w-full h-1px bg-$bew-border-color";

  // 菜单限高并滚动时仍保留完整的 1px 分割线。
  flex-shrink: 0;
  margin: var(--bew-space-1) 0;
}

.context-menu-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(240px, calc(100vw - var(--bew-space-4)));
  padding: var(--bew-popover-padding);
  transform-origin: top right; // 菜单右缘对齐按钮右缘，右上角即按钮位置
  max-height: min(480px, calc(100vh - var(--bew-space-4))); // 与 floatingMenu.ts 的 preferredMaxHeight 同步
  overflow: hidden;
  z-index: 9999;
}

.context-menu-container--up {
  transform-origin: bottom right;
}

.context-menu-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0;
  list-style: none;

  > li {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* 完全隐藏滚动条 */
  -ms-overflow-style: none; /* IE 和 Edge */
  scrollbar-width: none; /* Firefox */

  /* 隐藏 Webkit 浏览器的滚动条 */
  &::-webkit-scrollbar {
    display: none;
  }
}

.scroll-indicator {
  position: absolute;
  left: 50%;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--bew-space-6);
  height: var(--bew-space-4);
  padding: 0;
  border: none;
  color: var(--bew-text-color-2);
  background: transparent;
  transform: translateX(-50%);
  cursor: pointer;

  i {
    width: var(--bew-icon-size-sm);
    height: var(--bew-icon-size-sm);
  }

  &:hover {
    color: var(--bew-text-color-1);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
    outline-offset: -2px;
  }

  &-top {
    top: 0;
  }

  &-bottom {
    bottom: 0;
  }
}
</style>
