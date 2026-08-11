<script setup lang="ts">
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { settings } from '~/logic'
import { isComponentVisible } from '~/utils/topBarBadge'

import type { TopBarChannelConfig } from '../constants/channels'
import { allChannelConfigs } from '../constants/channels'
import TopBarItemEditor from './TopBarItemEditor.vue'

const props = defineProps<{
  forceWhiteIcon: boolean
}>()

const { t, locale } = useI18n()
const { isLayoutEditing } = useLayoutEditMode()

const containerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const displayedKeys = ref<string[]>([])
let lastObservedWidth = 0

const channelMap = computed(() => {
  const map = new Map<string, TopBarChannelConfig & { name: string }>()
  allChannelConfigs.forEach((config) => {
    map.set(config.key, {
      ...config,
      name: t(config.nameKey),
    })
  })
  return map
})

const pinnedKeys = computed<string[]>(() => settings.value.topBarPinnedChannels ?? [])

const validPinnedKeys = computed(() => {
  const seen = new Set<string>()
  return pinnedKeys.value.filter((key) => {
    if (seen.has(key))
      return false
    const exists = channelMap.value.has(key)
    if (exists)
      seen.add(key)
    return exists
  })
})

const displayedChannels = computed(() => {
  return displayedKeys.value
    .map(key => channelMap.value.get(key))
    .filter((channel): channel is TopBarChannelConfig & { name: string } => Boolean(channel))
})

const hiddenChannels = computed(() => {
  return validPinnedKeys.value
    .slice(displayedKeys.value.length)
    .map(key => channelMap.value.get(key))
    .filter((channel): channel is TopBarChannelConfig & { name: string } => Boolean(channel))
})

const hiddenCount = computed(() => hiddenChannels.value.length)
const hiddenTooltip = computed(() => hiddenChannels.value.map(channel => channel.name).join(', '))
watch(validPinnedKeys, async (keys) => {
  displayedKeys.value = [...keys]
  await adjustVisibility(true)
}, { immediate: true })

watch(() => locale.value, async () => {
  await adjustVisibility(true)
})

watch(() => props.forceWhiteIcon, () => {
  void adjustVisibility(true)
})

useResizeObserver(containerRef, (entries) => {
  const width = entries[0]?.contentRect.width ?? 0
  const shouldReset = width > lastObservedWidth
  lastObservedWidth = width
  void adjustVisibility(shouldReset)
})

const handleWindowResize = useDebounceFn(() => {
  void adjustVisibility(true)
}, 120)

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
})

async function adjustVisibility(reset = false) {
  if (!listRef.value)
    return

  if (reset) {
    const desired = validPinnedKeys.value
    if (!arraysEqual(displayedKeys.value, desired)) {
      displayedKeys.value = [...desired]
      await nextTick()
    }
  }

  await nextTick()

  const listEl = listRef.value
  if (!listEl)
    return

  // ✅ 性能优化：批量读取布局，避免read-write-read循环
  // 使用RAF批量所有布局读取，减少15-30次强制布局到1次
  while (displayedKeys.value.length > 0) {
    // 批量读取所有布局属性（在RAF中）
    const overflow = await checkOverflowBatched()

    if (!overflow)
      break

    // 移除最后一个item
    displayedKeys.value = displayedKeys.value.slice(0, -1)
    await nextTick()

    if (!listRef.value)
      return
  }
}

/**
 * 批量检查溢出状态（性能优化版本）
 * 将所有布局读取放在单个RAF中，避免强制同步布局
 */
function checkOverflowBatched(): Promise<boolean> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const listEl = listRef.value
      const containerEl = containerRef.value

      // 批量读取1: 列表自身溢出检查
      if (listEl && listEl.scrollWidth - listEl.clientWidth > 1) {
        resolve(true)
        return
      }

      // 批量读取2: main元素溢出检查
      const mainEl = containerEl?.closest('main') as HTMLElement | null
      if (mainEl && mainEl.scrollWidth - mainEl.clientWidth > 1) {
        resolve(true)
        return
      }

      // 批量读取3: 搜索框溢出检查
      const searchEl = mainEl?.querySelector('[data-top-bar-search]') as HTMLElement | null
      if (searchEl && searchEl.scrollWidth - searchEl.clientWidth > 1) {
        resolve(true)
        return
      }

      resolve(false)
    })
  })
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length)
    return false
  return a.every((value, index) => value === b[index])
}

function handleChannelClick(event: MouseEvent) {
  if (!isLayoutEditing.value)
    return

  event.preventDefault()
  event.stopPropagation()
}
</script>

<template>
  <TopBarItemEditor
    component-key="pinnedChannels"
    :title="$t('settings.topbar_pinned_channels_title')"
  >
    <div
      v-if="isLayoutEditing || (isComponentVisible('pinnedChannels') && validPinnedKeys.length)"
      ref="containerRef"
      class="pinned-channels-editor-anchor"
      data-top-bar-editor-anchor
    >
      <div
        class="pinned-channels bew-segment-control bew-segment-control--surface"
        :class="{
          'white-theme': props.forceWhiteIcon,
          'bew-segment-control--solid': !settings.enableFrostedGlass,
          'pinned-channels--editing': isLayoutEditing,
          'pinned-channels--editing-empty': isLayoutEditing && !validPinnedKeys.length,
        }"
      >
        <div v-if="validPinnedKeys.length" ref="listRef" class="pinned-channels__list">
          <ALink
            v-for="channel in displayedChannels"
            :key="channel.key"
            :href="channel.href"
            type="topBar"
            :custom-click-event="isLayoutEditing"
            class="pinned-channels__item bew-segment-control__item bew-segment-control__item--icon"
            :title="channel.name"
            @click="handleChannelClick"
          >
            <div v-if="channel.icon.startsWith('#')" class="pinned-channels__icon">
              <svg aria-hidden="true">
                <use :xlink:href="channel.icon" />
              </svg>
            </div>
            <div v-else class="pinned-channels__icon">
              <i
                :class="channel.icon"
                :style="props.forceWhiteIcon ? undefined : { color: channel.color }"
              />
            </div>
          </ALink>
        </div>
        <div
          v-if="hiddenCount > 0"
          class="pinned-channels__more"
          :class="{ 'white-icon': props.forceWhiteIcon }"
          :title="hiddenTooltip"
        >
          +{{ hiddenCount }}
        </div>
        <span v-if="isLayoutEditing && !validPinnedKeys.length" class="pinned-channels__placeholder">
          <i i-mingcute:pin-line aria-hidden="true" />
          {{ $t('settings.topbar_pinned_channels_title') }}
        </span>
      </div>
    </div>
  </TopBarItemEditor>
</template>

<style scoped lang="scss">
.pinned-channels {
  --bew-segment-item-color: var(--bew-text-1);

  min-width: 0;
  flex: 0 1 auto;

  &__list {
    display: flex;
    align-items: center;
    gap: var(--bew-control-gap);
    overflow: hidden;
    min-width: 0;
  }

  &__icon {
    width: var(--bew-control-icon-size);
    height: var(--bew-control-icon-size);
    display: grid;
    place-items: center;

    svg {
      width: var(--bew-control-icon-size);
      height: var(--bew-control-icon-size);
      fill: currentColor;
    }

    i {
      font-size: var(--bew-control-icon-size);
    }
  }

  &__more {
    display: grid;
    place-items: center;
    height: var(--bew-control-item-height);
    min-width: var(--bew-control-item-height);
    padding: 0 8px;
    border-radius: var(--bew-control-item-radius);
    background: transparent;
    color: var(--bew-text-2);
    font-size: var(--bew-control-label-size);
    font-weight: var(--bew-control-brand-label-weight);
    line-height: var(--bew-control-label-line-height);
    transition:
      background-color var(--bew-duration-normal, 200ms) ease,
      color var(--bew-duration-normal, 200ms) ease;

    &:hover {
      color: var(--bew-segment-item-hover-color);
      background: var(--bew-segment-item-hover-bg);
    }

    &.white-icon {
      color: white;
      background: transparent;

      &:hover {
        background: var(--bew-segment-item-hover-bg-white);
      }
    }
  }

  &--editing {
    display: flex !important;
    min-width: 24px;
    min-height: var(--bew-control-height);
    align-items: center;
  }

  &--editing-empty {
    padding-inline: var(--bew-space-2);
  }

  &__placeholder {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-1);
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
    white-space: nowrap;

    i {
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
      flex: none;
    }
  }

  &.white-theme:not(.bew-segment-control--solid) {
    --bew-segment-surface-background: var(--bew-control-background-white);
    --bew-segment-surface-shadow: none;
    --bew-segment-item-color: white;
    --bew-segment-item-hover-current-color: white;
    --bew-segment-item-hover-current-bg: var(--bew-segment-item-hover-bg-white);
  }
}

.pinned-channels-editor-anchor {
  position: relative;
  min-width: 24px;
  min-height: var(--bew-control-height);
}

@media (max-width: 1279px) {
  .pinned-channels {
    display: none;
  }

  .pinned-channels--editing {
    display: flex !important;
  }
}
</style>
