<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { getCommentSexIcon } from '~/utils/commentUserInfo'

import type { CommentPreviewState } from './commentPreview'
import { getCommentRows } from './commentPreview'
import MomentCommentTree from './MomentCommentTree.vue'
import type { DisplayMoment } from './types'
import { useMomentComments } from './useMomentComments'
import { formatCount, getAuthorSpaceUrl } from './utils'

const { moment, state } = defineProps<{ moment: DisplayMoment, state: CommentPreviewState }>()
const emit = defineEmits<{
  collapse: []
  openImagePreview: [urls: string[], index: number, trigger: HTMLElement | null]
}>()
const { t } = useI18n()
const { loadComments, loadReplies, toggleReplies, toggleLike, saveScrollPosition } = useMomentComments(moment, state)
const scroller = ref<HTMLElement>()
const treeEnabled = computed(() => settings.value.enableCommentReplyTreeDisplay)
const treeMode = computed(() => settings.value.commentReplyTreeMode)
const groups = computed(() => state.comments.map(root => ({
  root,
  rows: getCommentRows(root, treeEnabled.value, treeMode.value),
})))

function openPicture(event: MouseEvent, pictures: string[], index: number) {
  emit('openImagePreview', pictures, index, event.currentTarget instanceof HTMLElement ? event.currentTarget : null)
}

function saveScroll() {
  // v-show 隐藏时浏览器可能报告 0，不覆盖收起前的位置。
  if (state.expanded && scroller.value)
    saveScrollPosition(scroller.value.scrollTop)
}

async function restoreScroll() {
  await nextTick()
  if (scroller.value && state.expanded)
    scroller.value.scrollTop = state.scrollTop
}

watch(() => state.expanded, expanded => expanded && void restoreScroll())
onMounted(() => {
  if (!state.page)
    void loadComments()
  void restoreScroll()
})
</script>

<template>
  <section class="moment-comments" :aria-label="t('moment_card.view_comments')" @click.stop @keydown.stop>
    <div
      ref="scroller"
      class="moment-comments__scroller"
      tabindex="0"
      role="region"
      :aria-label="t('moment_card.comments_preview')"
      :aria-busy="state.loading"
      @scroll.passive="saveScroll"
    >
      <MomentCommentTree
        v-for="group in groups"
        :key="group.root.id"
        class="moment-comments__thread"
        :rows="group.rows"
        :enabled="treeEnabled && treeMode !== 'indentOnly'"
        @toggle="comment => comment.collapsed = !comment.collapsed"
      >
        <article
          v-for="row in group.rows"
          :key="row.comment.id"
          class="moment-comments__comment"
          :class="{ 'is-collapsed-body': row.hideBody }"
          :data-comment-id="row.comment.id"
          :style="{ '--comment-depth': Math.min(row.depth, 10) }"
        >
          <header class="moment-comments__author">
            <a
              v-if="row.comment.mid"
              :href="getAuthorSpaceUrl(row.comment.mid)"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="moment-comments__avatar" data-comment-avatar>
                <img v-if="row.comment.avatar" :src="row.comment.avatar" alt="" loading="lazy" decoding="async">
                <span v-else i-tabler-user aria-hidden="true" />
              </span>
              <span>{{ row.comment.author || t('moments.bilibili_user') }}</span>
            </a>
            <template v-else>
              <span class="moment-comments__avatar" data-comment-avatar><span i-tabler-user aria-hidden="true" /></span>
              <span>{{ row.comment.author || t('moments.bilibili_user') }}</span>
            </template>
            <svg
              v-if="settings.showSex && getCommentSexIcon(row.comment.sex) && !row.hideBody"
              class="moment-comments__sex"
              viewBox="0 0 24 24"
              :fill="getCommentSexIcon(row.comment.sex)?.color"
              role="img"
              :aria-label="t(`moment_card.comment_sex_${getCommentSexIcon(row.comment.sex)?.key}`)"
            >
              <path :d="getCommentSexIcon(row.comment.sex)?.path" />
            </svg>
            <span
              v-if="settings.showCommentHostTag && row.comment !== group.root && row.comment.mid && row.comment.mid === group.root.mid && !row.hideBody"
              class="moment-comments__host"
            >{{ t('moment_card.comment_host') }}</span>
            <span
              v-if="settings.showIPLocation && row.comment.location && !row.hideBody"
              class="moment-comments__location"
            >{{ row.comment.location }}</span>
          </header>
          <template v-if="!row.hideBody">
            <p class="moment-comments__content">
              <template v-for="(part, index) in row.comment.content" :key="index">
                <img
                  v-if="part.image" :src="part.image" :alt="part.text" :title="part.text" class="moment-comments__emoji"
                  loading="lazy"
                >
                <template v-else>
                  {{ part.text }}
                </template>
              </template>
            </p>
            <div v-if="row.comment.pictures.length" class="moment-comments__pictures">
              <button
                v-for="(picture, index) in row.comment.pictures"
                :key="picture"
                type="button"
                :aria-label="t('moment_card.comment_image', { index: index + 1 })"
                @click="openPicture($event, row.comment.pictures, index)"
              >
                <img :src="picture" alt="" loading="lazy" decoding="async">
              </button>
            </div>
            <footer class="moment-comments__meta">
              <time v-if="row.comment.time" :datetime="new Date(row.comment.time * 1000).toISOString()">
                {{ new Date(row.comment.time * 1000).toLocaleString() }}
              </time>
              <button
                type="button"
                class="moment-comments__like"
                :class="{ 'is-liked': row.comment.liked }"
                :aria-label="t(row.comment.liked ? 'moment_card.unlike' : 'moment_card.like')"
                :aria-pressed="row.comment.liked"
                :aria-busy="row.comment.liking"
                :aria-disabled="row.comment.liking"
                @click="toggleLike(row.comment)"
              >
                <span v-if="row.comment.liking" i-svg-spinners:ring-resize aria-hidden="true" />
                <span v-else :class="row.comment.liked ? 'i-tabler-thumb-up-filled' : 'i-tabler-thumb-up'" aria-hidden="true" />
                {{ formatCount(row.comment.likeCount) }}
              </button>
            </footer>
          </template>
        </article>
        <div v-if="group.root.replyCount > 0 || group.root.repliesExpanded" class="moment-comments__more-replies">
          <button
            type="button"
            :aria-expanded="group.root.repliesExpanded"
            @click="toggleReplies(group.root)"
          >
            {{ group.root.repliesExpanded ? t('moment_card.collapse_comment_replies') : t('moment_card.expand_comment_replies', { count: group.root.replyCount }) }}
          </button>
          <span v-if="group.root.repliesExpanded && group.root.repliesError" role="alert">{{ group.root.repliesError }}</span>
          <button
            v-if="group.root.repliesExpanded && !group.root.repliesDone"
            type="button"
            :aria-disabled="group.root.repliesLoading"
            :aria-busy="group.root.repliesLoading"
            @click="loadReplies(group.root)"
          >
            {{ group.root.repliesLoading ? t('common.loading') : group.root.repliesError ? t('moment_card.comments_retry') : t('moment_card.load_comment_replies') }}
          </button>
        </div>
      </MomentCommentTree>
      <div class="moment-comments__status" aria-live="polite">
        <span v-if="state.error" role="alert">{{ state.error }}</span>
        <span v-else-if="state.loading">{{ t('common.loading') }}</span>
        <span v-else-if="!state.comments.length && state.done">{{ t('moment_card.comments_empty') }}</span>
        <span v-else-if="state.done">{{ t('common.no_more_content') }}</span>
        <button v-if="!state.loading && !state.done" type="button" @click="loadComments">
          {{ state.error ? t('moment_card.comments_retry') : t('common.load_more') }}
        </button>
      </div>
    </div>
    <footer class="moment-comments__footer">
      <button type="button" @click="emit('collapse')">
        <span i-tabler-chevron-up text="size-$bew-icon-size-sm" aria-hidden="true" />
        {{ t('moment_card.collapse_comments') }}
      </button>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.moment-comments {
  display: flex;
  flex-direction: column;
  max-height: min(440px, 60dvh);
  box-sizing: border-box;
  border-top: 1px solid var(--bew-border-color);
  color: var(--bew-text-1);
  cursor: default;
  text-align: start;
}

.moment-comments__scroller {
  min-height: 0;
  box-sizing: border-box;
  padding: var(--bew-space-4);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.moment-comments__footer {
  flex: none;
  padding: var(--bew-space-1) var(--bew-space-3);
  border-top: 1px solid var(--bew-border-color);
}

.moment-comments .moment-comments__footer > button {
  width: 100%;
  min-height: var(--bew-control-height);
}

.moment-comments__thread + .moment-comments__thread {
  padding-top: var(--bew-space-3);
  border-top: 1px solid var(--bew-border-color);
}

.moment-comments__comment {
  min-width: 0;
  padding-bottom: var(--bew-space-3);
  margin-inline-start: calc(var(--comment-depth) * var(--bew-comment-reply-indent-step, var(--bew-space-6)));
  padding-inline-start: calc(var(--bew-space-6) + var(--bew-space-3));
}

.moment-comments__comment.is-collapsed-body .moment-comments__avatar {
  visibility: hidden;
}

.moment-comments__author,
.moment-comments__author a,
.moment-comments__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-2);
}

.moment-comments__author {
  position: relative;
  flex-wrap: wrap;
  column-gap: var(--bew-space-1);
  min-height: 28px;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.moment-comments__author a {
  min-height: 28px;
  color: var(--bew-text-2);
  text-decoration: none;
}

.moment-comments__author a span {
  overflow-wrap: anywhere;
}

.moment-comments__author a:hover {
  color: var(--bew-theme-color);
}

.moment-comments__avatar {
  position: absolute;
  inset-inline-start: calc(-1 * (var(--bew-space-6) + var(--bew-space-3)));
  top: var(--bew-space-0-5);
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  background: var(--bew-fill-1);
}

.moment-comments__avatar img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.moment-comments__sex {
  flex: none;
  width: var(--bew-icon-size-sm);
  height: var(--bew-icon-size-sm);
}

.moment-comments__location {
  padding: var(--bew-space-1);
  border-radius: var(--bew-radius-sm);
  color: var(--bew-ip-tag-text);
  background: var(--bew-ip-tag-bg);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-caption);
}

.moment-comments__host {
  flex: none;
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.moment-comments__content {
  margin: var(--bew-space-1) 0;
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.moment-comments__emoji {
  display: inline-block;
  width: 24px;
  height: 24px;
  object-fit: contain;
  vertical-align: middle;
}

.moment-comments__pictures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  padding-block: var(--bew-space-2);
}

.moment-comments button {
  display: inline-flex;
  min-width: 28px;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
}

.moment-comments button:hover,
.moment-comments button:active {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
}

.moment-comments button[aria-disabled="true"] {
  cursor: wait;
  opacity: 0.6;
}

.moment-comments button:focus-visible,
.moment-comments a:focus-visible,
.moment-comments__scroller:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: -2px;
}

.moment-comments .moment-comments__pictures button {
  width: 80px;
  max-width: 100%;
  height: 80px;
  padding: 0;
  overflow: hidden;
}

.moment-comments__pictures img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-comments__meta {
  justify-content: space-between;
  flex-wrap: wrap;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.moment-comments .is-liked {
  color: var(--bew-theme-color);
}

.moment-comments__more-replies,
.moment-comments__status {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  padding-block: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  overflow-wrap: anywhere;
}
</style>
