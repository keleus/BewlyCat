<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DisplayMoment } from './types'
import { formatCount } from './utils'

// 动态卡片底部操作栏：转发、评论、点赞；直播动态改为新标签打开与人气。
const {
  moment,
  repostExpanded = false,
  repostCount = 0,
  commentCount,
  commentsExpanded = false,
  commentsLoading = false,
  commentsControls,
  likeLoading = false,
} = defineProps<{
  moment: DisplayMoment
  repostExpanded?: boolean
  /** 本次会话内新增的转发数，叠加到接口计数上 */
  repostCount?: number
  /** 展示用评论数，缺省取 moment.commentCount；卡片内增删评论后由调用方传入修正值 */
  commentCount?: number
  commentsExpanded?: boolean
  commentsLoading?: boolean
  /** 评论区元素 id */
  commentsControls?: string
  likeLoading?: boolean
}>()

const emit = defineEmits<{
  toggleRepost: []
  toggleComments: []
  toggleLike: []
}>()

const { t } = useI18n()
const commentsToggleRef = ref<HTMLButtonElement | null>(null)

function focusCommentsToggle() {
  commentsToggleRef.value?.focus({ preventScroll: true })
}

defineExpose({ focusCommentsToggle })
</script>

<template>
  <footer class="moment-card__footer">
    <button
      v-if="!moment.isLive"
      type="button"
      :disabled="moment.isForwardDisabled"
      :aria-label="t('moment_card.repost')"
      :aria-expanded="repostExpanded"
      @click.stop="emit('toggleRepost')"
      @keydown.enter.stop
    >
      <span i-tabler-share-3 />
      <span>{{ moment.forwardCount || repostCount ? formatCount((moment.forwardCount || 0) + repostCount) : t('moment_card.repost') }}</span>
    </button>
    <a
      v-else
      draggable="false"
      :href="moment.url"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('moment_card.open_new_tab')"
      @click.stop
    >
      <span i-tabler-external-link />
      <span class="moment-card__open-label">{{ t('moment_card.open_new_tab_short') }}</span>
    </a>
    <button
      v-if="!moment.isLive"
      ref="commentsToggleRef"
      type="button"
      :class="{ 'is-expanded': commentsExpanded }"
      :aria-label="t(commentsExpanded ? 'moment_card.collapse_comments' : 'moment_card.view_comments')"
      :aria-expanded="commentsExpanded"
      :aria-controls="commentsControls"
      :title="t(commentsExpanded ? 'moment_card.collapse_comments' : 'moment_card.view_comments')"
      @click.stop="emit('toggleComments')"
    >
      <span v-if="commentsLoading" i-svg-spinners:ring-resize aria-hidden="true" />
      <span v-else-if="commentsExpanded" i-tabler-chevron-up aria-hidden="true" />
      <span v-else i-tabler-message-circle aria-hidden="true" />
      {{ commentsLoading || !commentsExpanded ? formatCount(commentCount ?? moment.commentCount) : t('moment_card.collapse_comments') }}
    </button>
    <span v-else class="moment-card__footer-stat" :aria-label="t('moment_card.live_popularity', { value: moment.livePopularity || t('moment_card.no_data') })">
      <span i-tabler-users />
      {{ moment.livePopularity || t('moment_card.live_now') }}
    </span>
    <!-- 请求期间不设 disabled：Firefox 会把 disabled 控件变成事件黑洞，光标停在按钮上时页面无法滚动 #1101 -->
    <button
      type="button"
      class="moment-card__likes"
      :class="{ 'is-liked': moment.isLiked, 'is-unavailable': moment.isLikeDisabled, 'is-loading': likeLoading }"
      :disabled="moment.isLikeDisabled"
      :aria-busy="likeLoading || undefined"
      :aria-disabled="likeLoading || moment.isLikeDisabled || undefined"
      :aria-label="moment.isLikeDisabled ? t('moment_card.like_unsupported') : moment.isLiked ? t('moment_card.unlike') : t('moment_card.like')"
      :aria-pressed="moment.isLiked"
      :title="moment.isLikeDisabled ? t('moment_card.like_unsupported') : moment.isLiked ? t('moment_card.unlike') : t('moment_card.like')"
      @click.stop="emit('toggleLike')"
      @keydown.enter.stop
    >
      <span v-if="likeLoading" i-svg-spinners:ring-resize aria-hidden="true" />
      <span v-else-if="moment.isLiked" i-tabler-heart-filled aria-hidden="true" />
      <span v-else i-tabler-heart aria-hidden="true" />
      {{ formatCount(moment.likeCount) }}
    </button>
  </footer>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  gap: 0;
  min-height: 42px;
  margin: 0;
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 64%);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.moment-card__footer > a,
.moment-card__footer > button {
  @include mixins.interactive-layer;
}

.moment-card__likes {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  margin-left: auto;
  padding: var(--bew-space-1) var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-radius-md);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;
}

.moment-card__likes:hover {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
}

.moment-card__likes.is-liked {
  color: var(--bew-theme-color);
}

.moment-card__likes.is-loading {
  cursor: wait;
  opacity: 0.65;
}

.moment-card__likes.is-unavailable {
  cursor: not-allowed;
}

.moment-card__footer > button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.moment-card__footer > a,
.moment-card__footer > button,
.moment-card__footer > .moment-card__footer-stat {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0 var(--bew-space-2);
  border: 0;
  border-radius: 0;
  color: inherit;
  background: transparent;
  box-sizing: border-box;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}

.moment-card__footer-stat {
  cursor: default;
}

.moment-card__footer > a:hover,
.moment-card__footer > button:hover {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
}

.moment-card__footer > button.is-expanded {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
}

.moment-card__footer > :not(:first-child) {
  border-left: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 72%);
}

@container (max-width: 379px) {
  .moment-card__open-label {
    display: none;
  }
}
</style>
