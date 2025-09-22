<script setup lang="ts">
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import { settings } from '~/logic'

import type { TopBarChannelConfig } from '../constants/channels'
import { allChannelConfigs } from '../constants/channels'

const props = defineProps<{
  forceWhiteIcon: boolean
}>()

const { t, locale } = useI18n()

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

  // Remove overflowing items until it fits
  while (hasOverflow() && displayedKeys.value.length > 0) {
    displayedKeys.value = displayedKeys.value.slice(0, -1)
    await nextTick()
    if (!listRef.value)
      return
  }
}

function hasOverflow(): boolean {
  const listEl = listRef.value
  const containerEl = containerRef.value
  if (listEl && listEl.scrollWidth - listEl.clientWidth > 1)
    return true

  const mainEl = containerEl?.closest('main') as HTMLElement | null
  if (mainEl && mainEl.scrollWidth - mainEl.clientWidth > 1)
    return true

  const searchEl = mainEl?.querySelector('[data-top-bar-search]') as HTMLElement | null
  if (searchEl && searchEl.scrollWidth - searchEl.clientWidth > 1)
    return true

  return false
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length)
    return false
  return a.every((value, index) => value === b[index])
}
</script>

<template>
  <div
    v-if="validPinnedKeys.length"
    ref="containerRef"
    class="pinned-channels"
  >
    <div ref="listRef" class="pinned-channels__list">
      <ALink
        v-for="channel in displayedChannels"
        :key="channel.key"
        :href="channel.href"
        type="topBar"
        class="pinned-channels__item"
        :class="{ 'white-icon': props.forceWhiteIcon }"
        :title="channel.name"
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
  </div>
</template>

<style scoped lang="scss">
.pinned-channels {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;

  &__list {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    min-width: 0;
  }

  &__item {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 40px;
    color: var(--bew-text-1);
    transition: background-color 0.3s ease;
    filter: drop-shadow(0 0 4px var(--bew-bg));

    &:hover {
      background: var(--bew-fill-2);
    }

    &.white-icon {
      color: white;
      filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.6));

      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }
    }
  }

  &__icon {
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;

    svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    i {
      font-size: 20px;
    }
  }

  &__more {
    display: grid;
    place-items: center;
    height: 34px;
    min-width: 34px;
    padding: 0 10px;
    border-radius: 40px;
    background: var(--bew-fill-1);
    color: var(--bew-text-2);
    font-size: 14px;
    filter: drop-shadow(0 0 4px var(--bew-bg));
    transition: background-color 0.3s ease;

    &:hover {
      background: var(--bew-fill-2);
    }

    &.white-icon {
      color: white;
      background: rgba(255, 255, 255, 0.12);

      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }
    }
  }
}
</style>
