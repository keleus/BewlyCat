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
  normalizedEpisodes.value.forEach((episode, index) => {
    const resolvedNumber = resolveEpisodeNumber(episode, index)
    if (resolvedNumber && !map.has(resolvedNumber))
      map.set(resolvedNumber, episode)
  })
  return map
})

const totalEpisodes = computed(() => {
  const provided = Number(props.totalEpisodes)
  if (Number.isFinite(provided) && provided > 0)
    return provided

  const numbers = [...episodeMap.value.keys()]
  if (numbers.length > 0)
    return Math.max(...numbers)

  return normalizedEpisodes.value.length
})

const maxVisibleButtons = computed(() => {
  const width = containerWidth.value
  if (!width || !Number.isFinite(width))
    return DEFAULT_MAX_BUTTONS

  const estimated = Math.floor((width + BUTTON_GAP) / (BUTTON_BASE_WIDTH + BUTTON_GAP))
  return Math.min(Math.max(estimated, MIN_BUTTONS), DEFAULT_MAX_BUTTONS)
})

const entries = computed<Entry[]>(() => {
  const total = totalEpisodes.value
  if (!Number.isFinite(total) || total <= 0)
    return []

  const limit = Math.max(maxVisibleButtons.value, MIN_BUTTONS)
  const result: Entry[] = []

  if (total <= limit) {
    for (let number = 1; number <= total; number += 1)
      result.push(createEpisodeEntry(number))
    return result
  }

  const leadingCount = Math.min(total - 1, limit - 2)
  for (let number = 1; number <= leadingCount; number += 1)
    result.push(createEpisodeEntry(number))

  result.push({
    type: 'ellipsis',
    key: 'ellipsis',
  })

  result.push(createEpisodeEntry(total))
  return result
})

function resolveEpisodeNumber(episode: Episode, index: number): number | undefined {
  if (typeof episode.number === 'number' && Number.isFinite(episode.number) && episode.number > 0)
    return Math.round(episode.number)

  const match = episode.title.match(/(\d+)/)
  if (match) {
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed) && parsed > 0)
      return parsed
  }

  return index + 1
}

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
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.episode-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 32px;
  padding: 0 0.75rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-fill-1);
  color: var(--bew-text-1);
  text-decoration: none;
  font-size: 0.875rem;
  border: 1px solid transparent;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;

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
  font-size: 1rem;
}
</style>
