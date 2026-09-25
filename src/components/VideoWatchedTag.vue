<script setup lang="ts">
import { settings } from '~/logic'
import type { VideoIdentity } from '~/utils/videoVisitHistory'
import { getVideoWatchState } from '~/utils/videoVisitHistory'

const props = defineProps<VideoIdentity>()

const status = computed(() =>
  settings.value.showVideoWatchedBadge ? getVideoWatchState(props)?.status : undefined,
)
</script>

<template>
  <span
    v-if="status"
    class="video-watched-tag"
    :class="{ 'video-watched-tag--browsed': status === 'browsed' }"
  >
    {{ status === 'watched' ? $t('video_card.watched') : $t('video_card.browsed') }}
  </span>
</template>

<style scoped>
.video-watched-tag {
  display: inline-flex;
  align-items: center;
  margin-right: var(--bew-space-1);
  padding: 0 var(--bew-space-1);
  border: 1px solid var(--bew-text-3);
  border-radius: var(--bew-radius-sm);
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  vertical-align: 0.08em;
  white-space: nowrap;
}

/* :global() 会把整条选择器替换为 .dark，祖先类直接写在 scoped 选择器前即可。 */
.dark .video-watched-tag {
  color: var(--bew-text-1);
}

/* 仅打开过、未实际播放：弱化显示，与「已观看」区分。 */
.video-watched-tag--browsed,
.dark .video-watched-tag--browsed {
  border-color: var(--bew-border-color);
  color: var(--bew-text-3);
  background: var(--bew-fill-1);
}
</style>
