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
/*
 * 标签外框（含边框）与所在标题的汉字等高，标题字号可由用户调整，故全部按 em 推算：
 * 自身字号为标题的 --watched-tag-scale 倍，1em / scale 即标题的 1em。
 * overflow: hidden 使 inline-block 的基线落在外框底边，再下移约 0.12 个标题字号，
 * 让外框覆盖汉字的字面框（基线下约 0.12em 至基线上约 0.88em）。
 */
.video-watched-tag {
  --watched-tag-scale: 0.75;

  display: inline-block;
  overflow: hidden;
  margin-right: var(--bew-space-1);
  padding: 0 var(--bew-space-1);
  border: 1px solid var(--bew-text-3);
  border-radius: var(--bew-radius-sm);
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
  font-size: calc(var(--watched-tag-scale) * 1em);
  font-weight: var(--bew-font-weight-medium);
  line-height: calc(1em / var(--watched-tag-scale) - 2px);
  vertical-align: calc(-0.12em / var(--watched-tag-scale));
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
