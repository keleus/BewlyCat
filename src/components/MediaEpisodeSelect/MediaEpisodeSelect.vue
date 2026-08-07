<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'

interface Episode {
  id: string
  title: string
  longTitle?: string
  url?: string
  badge?: string
}

const props = defineProps<{
  episodes: Episode[]
  fallbackUrl?: string
}>()

const { mainAppRef } = useBewlyApp()

const isOpen = ref(false)
const dropdownPosition = ref({ top: 0, left: 0, width: 0 })
const containerRef = ref<HTMLElement | null>(null)

const normalizedEpisodes = computed(() => {
  return Array.isArray(props.episodes) ? props.episodes : []
})

const hasEpisodes = computed(() => normalizedEpisodes.value.length > 0)

const defaultLabel = computed(() => {
  if (normalizedEpisodes.value.length > 0) {
    return normalizedEpisodes.value[0].title
  }
  return '选集'
})

onMounted(() => {
  window.addEventListener('resize', calculatePosition)
})

onUnmounted(() => {
  window.removeEventListener('resize', calculatePosition)
})

/** 计算下拉菜单绝对位置 */
function calculatePosition() {
  if (!containerRef.value)
    return

  const rect = containerRef.value.getBoundingClientRect()
  dropdownPosition.value = {
    top: rect.bottom,
    left: rect.left,
    width: rect.width,
  }
}

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function closeDropdown() {
  isOpen.value = false
}

function handleEpisodeClick(url?: string) {
  if (url) {
    window.open(url, '_blank', 'noopener')
  }
  closeDropdown()
}

/** when you click on it outside, the selection option will be turned off  */
function onMouseLeave() {
  window.addEventListener('click', closeDropdown)
}

function onMouseEnter() {
  window.removeEventListener('click', closeDropdown)
}

// 显示选项时计算位置
watchEffect(() => {
  if (isOpen.value) {
    calculatePosition()
  }
}, { flush: 'pre' })
</script>

<template>
  <div
    v-if="hasEpisodes"
    ref="containerRef"
    class="media-episode-select"
    pos="relative"
    @mouseleave="onMouseLeave"
    @mouseenter="onMouseEnter"
  >
    <button
      class="select-button"
      p="x-4 y-2"
      bg="$bew-fill-1"
      rounded="$bew-interactive-radius"
      text="$bew-text-1"
      cursor="pointer"
      flex="~"
      justify="between"
      items="center"
      w="full"
      :ring="isOpen ? '2px $bew-theme-color' : ''"
      duration-300
      @click.stop="toggleDropdown"
    >
      <span truncate>{{ defaultLabel }}</span>

      <!-- arrow -->
      <div
        border="~ solid t-0 l-0 r-2 b-2"
        :border-color="isOpen ? '$bew-theme-color' : '$bew-fill-4'"
        p="3px"
        m="l-2"
        display="inline-block"
        :transform="`~ ${!isOpen ? 'rotate-45 -translate-y-1/4' : 'rotate-225 translate-y-1/4'} `"
        transition="background-color duration-200, color duration-200, box-shadow duration-200"
      />
    </button>

    <Teleport :to="mainAppRef">
      <Transition name="dropdown">
        <div
          v-if="isOpen"
          class="bew-popover-surface"
          :style="{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
          }"
          pos="fixed"
          p="2"
          m="t-2"
          z="10004"
          flex="~ col gap-1"
          w="full"
          max-h-400px
          overflow-y-overlay
          will-change-transform
          @click.stop
        >
          <a
            v-for="(episode, index) in normalizedEpisodes"
            :key="episode.id || index"
            :href="episode.url || fallbackUrl"
            target="_blank"
            rel="noopener"
            class="dropdown-item"
            p="x-2 y-2"
            rounded="$bew-interactive-radius"
            w="full"
            bg="hover:$bew-fill-2"
            transition="background-color duration-200, color duration-200, box-shadow duration-200"
            cursor="pointer"
            :title="episode.longTitle || episode.title"
            @click.stop="handleEpisodeClick(episode.url || fallbackUrl)"
          >
            <span class="episode-title">{{ episode.title }}</span>
            <span v-if="episode.badge" class="episode-badge">{{ episode.badge }}</span>
          </a>
        </div>
      </Transition>

      <!-- 遮罩 外部滚动时关闭下拉菜单 -->
      <div
        v-if="isOpen"
        pos="fixed top-0 left-0"
        w-full
        h-full
        z="10003"
        @wheel="closeDropdown"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.media-episode-select {
  display: inline-block;
  margin-top: var(--bew-space-3);
}

.select-button {
  min-height: var(--bew-control-height);
  border: 1px solid transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  user-select: none;

  &:hover {
    background: var(--bew-fill-2);
  }
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  color: var(--bew-text-1);
  text-decoration: none;
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);

  .episode-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .episode-badge {
    flex-shrink: 0;
    padding: var(--bew-space-0-5) var(--bew-space-2);
    border-radius: var(--bew-badge-radius);
    background: var(--bew-theme-color-20);
    color: var(--bew-theme-color);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }
}
</style>
