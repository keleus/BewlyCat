<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, ref } from 'vue'

import VideoCard from '~/components/VideoCard/VideoCard.vue'
import { settings } from '~/logic'

import { convertVideoData } from '../../searchTransforms'

const props = defineProps<{
  videos: any[]
  /**
   * 是否需要自动转换数据
   * 如果数据已经被转换过（如直播间数据），设置为 false
   */
  autoConvert?: boolean
}>()

// 默认开启自动转换以保持向后兼容
const shouldAutoConvert = computed(() => props.autoConvert !== false)

const baseCardMinWidth = computed(() => Math.max(160, settings.value.homeAdaptiveCardMinWidth || 280))
const gridRef = ref<HTMLElement | null>(null)
const gridWidth = ref(0)
const videoGridGap = ref(16)

useResizeObserver(gridRef, (entries) => {
  const entry = entries[0]
  gridWidth.value = entry.contentRect.width
})

function updateVideoGridGap() {
  if (typeof window === 'undefined')
    return
  const gap = Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16')
  if (Number.isFinite(gap))
    videoGridGap.value = gap
}

const VIDEO_GRID_MAX_COLUMNS = 12

const videoGridStyle = computed(() => {
  const containerWidth = gridWidth.value
  const targetWidth = baseCardMinWidth.value
  const gap = videoGridGap.value
  if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return {
      gridTemplateColumns: `repeat(1, minmax(${targetWidth}px, ${targetWidth}px))`,
      justifyContent: 'flex-start',
    }
  }

  const rawColumns = Math.floor((containerWidth + gap) / (targetWidth + gap))
  const columns = Math.min(VIDEO_GRID_MAX_COLUMNS, Math.max(rawColumns, 1))

  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    justifyContent: 'flex-start',
  }
})

// 初始化时更新 gap
if (typeof window !== 'undefined') {
  updateVideoGridGap()
  window.addEventListener('resize', updateVideoGridGap)
}
</script>

<template>
  <div
    ref="gridRef"
    class="video-grid"
    :style="videoGridStyle"
  >
    <VideoCard
      v-for="video in videos"
      :key="video.aid || video.id"
      :video="shouldAutoConvert ? convertVideoData(video) : video"
      :horizontal="false"
      :show-preview="true"
    />
  </div>
</template>

<style scoped lang="scss">
.video-grid {
  display: grid;
  gap: 1rem;
}
</style>
