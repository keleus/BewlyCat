<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import MomentRichText from './MomentRichText.vue'
import type { DisplayMoment } from './types'

// 动态列表附带的热评摘要，点击展开完整评论区。
const { comment, expanded = false, loading = false, controls } = defineProps<{
  comment: NonNullable<DisplayMoment['hotComment']>
  expanded?: boolean
  loading?: boolean
  /** 评论区元素 id */
  controls?: string
}>()

const emit = defineEmits<{
  toggle: []
}>()

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="moment-card__hot-comment"
    :aria-label="t('moment_card.view_hot_comment')"
    :aria-expanded="expanded"
    :aria-controls="controls"
    @click.stop="emit('toggle')"
  >
    <span class="moment-card__hot-comment-label">
      <span v-if="loading" i-svg-spinners:ring-resize aria-hidden="true" />
      <span v-else i-tabler-message-circle-filled aria-hidden="true" />
      {{ t('moment_card.hot_comment') }}
    </span>
    <span class="moment-card__hot-comment-content">
      <MomentRichText v-if="comment.richText.length" :segments="comment.richText" :linkable="false" />
      <template v-else>{{ comment.text }}</template>
    </span>
  </button>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__hot-comment {
  @include mixins.interactive-layer;

  display: flex;
  width: 100%;
  max-width: 100%;
  min-height: 40px;
  align-items: center;
  gap: var(--bew-space-2);
  margin: 0 0 var(--bew-space-3);
  padding: var(--bew-space-2) var(--bew-space-4);
  overflow: hidden;
  border: 0;
  border-radius: 0;
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  box-sizing: border-box;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-align: left;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__hot-comment:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.moment-card__hot-comment-label {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--bew-space-1);
  color: var(--bew-theme-color);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-card__hot-comment-content {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
