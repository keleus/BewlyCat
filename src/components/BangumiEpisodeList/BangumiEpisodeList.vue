<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, ref } from 'vue'

interface Episode {
  id: string
  title: string
  longTitle?: string
  url?: string
  badge?: string
  number?: number
}

const props = defineProps<{
  episodes: Episode[]
  totalEpisodes?: number
  fallbackUrl?: string
}>()

interface EpisodeEntry {
  type: 'episode'
  key: string
  number: number
  title: string
  longTitle?: string
  url?: string
  disabled: boolean
}

interface EllipsisEntry {
  type: 'ellipsis'
  key: string
}

type Entry = EpisodeEntry | EllipsisEntry

const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)

useResizeObserver(containerRef, (entries) => {
  const entry = entries[0]
  containerWidth.value = entry.contentRect.width
})

const BUTTON_BASE_WIDTH = 44
const BUTTON_GAP = 8
const MIN_BUTTONS = 6
const DEFAULT_MAX_BUTTONS = 12

const normalizedEpisodes = computed(() => Array.isArray(props.episodes) ? props.episodes : [])

const episodeMap = computed(() => {
  const map = new Map<number, Episode>()
  // 有正片序号时跳过没有序号的特殊集；全部没有序号（如上/下篇）时按顺序编号
  const hasNumberedEpisode = normalizedEpisodes.value.some(episode => episode.number)
  normalizedEpisodes.value.forEach((episode, index) => {
    const resolvedNumber = hasNumberedEpisode ? episode.number : index + 1
    if (resolvedNumber && !map.has(resolvedNumber))
      map.set(resolvedNumber, episode)
  })
  return map
})

const episodeNumbers = computed(() => {
  const knownNumbers = [...episodeMap.value.keys()].sort((a, b) => a - b)
  const provided = Number(props.totalEpisodes)
  const total = Number.isFinite(provided) && provided > 0 ? provided : knownNumbers.length

  // 列表已覆盖全部集数时用真实序号，兼容跨季连续编号（13~24）和缺集；否则按总数补齐
  if (knownNumbers.length >= total)
    return knownNumbers
  return Array.from({ length: total }, (_, index) => index + 1)
})

const maxVisibleButtons = computed(() => {
  const width = containerWidth.value
  if (!width || !Number.isFinite(width))
    return DEFAULT_MAX_BUTTONS

  const estimated = Math.floor((width + BUTTON_GAP) / (BUTTON_BASE_WIDTH + BUTTON_GAP))
  return Math.min(Math.max(estimated, MIN_BUTTONS), DEFAULT_MAX_BUTTONS)
})

const entries = computed<Entry[]>(() => {
  const numbers = episodeNumbers.value
  const limit = Math.max(maxVisibleButtons.value, MIN_BUTTONS)

  if (numbers.length <= limit)
    return numbers.map(createEpisodeEntry)

  return [
    ...numbers.slice(0, limit - 2).map(createEpisodeEntry),
    {
      type: 'ellipsis',
      key: 'ellipsis',
    },
    createEpisodeEntry(numbers[numbers.length - 1]),
  ]
})

function createEpisodeEntry(number: number): EpisodeEntry {
  const episode = episodeMap.value.get(number)
  const url = episode?.url || props.fallbackUrl
  return {
    type: 'episode',
    key: `episode-${number}`,
    number,
    title: episode?.title || `第${number}话`,
    longTitle: episode?.longTitle,
    url,
    disabled: !url,
  }
}
</script>

<template>
  <div
    v-if="entries.length"
    ref="containerRef"
    class="bangumi-episode-buttons"
  >
    <template v-for="entry in entries" :key="entry.key">
      <a
        v-if="entry.type === 'episode' && !entry.disabled"
        :href="entry.url"
        target="_blank"
        rel="noopener"
        class="episode-button"
        :title="entry.longTitle || entry.title"
        @click.stop
      >
        {{ entry.number }}
      </a>
      <span
        v-else-if="entry.type === 'episode'"
        class="episode-button disabled"
        :title="entry.longTitle || entry.title"
      >
        {{ entry.number }}
      </span>
      <span
        v-else
        class="episode-ellipsis"
      >
        …
      </span>
    </template>
  </div>
</template>

<style scoped lang="scss">
.bangumi-episode-buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
}

.episode-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 32px;
  padding: 0 var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  color: var(--bew-text-1);
  text-decoration: none;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  border: 1px solid transparent;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-fill-2);
  }

  &.disabled {
    cursor: default;
    color: var(--bew-text-3);
  }
}

.episode-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-title);
}
</style>
