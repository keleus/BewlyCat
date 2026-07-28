<script setup lang="ts">
import { settings } from '~/logic'
import type { VideoIdentity } from '~/utils/videoVisitHistory'
import { wasVideoVisited } from '~/utils/videoVisitHistory'

const props = defineProps<VideoIdentity>()

const visible = computed(() =>
  settings.value.showVideoWatchedBadge && wasVideoVisited(props),
)
</script>

<template>
  <span v-if="visible" class="video-watched-tag">
    {{ $t('video_card.watched') }}
  </span>
</template>

<style scoped>
.video-watched-tag {
  display: inline-flex;
  align-items: center;
  margin-right: var(--bew-space-1);
  padding: 0 var(--bew-space-1);
  border-radius: var(--bew-radius-sm);
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  opacity: 0.75;
  vertical-align: 0.08em;
  white-space: nowrap;
}
</style>
