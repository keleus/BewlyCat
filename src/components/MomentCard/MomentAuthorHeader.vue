<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DisplayMoment } from './types'
import { getAuthorSpaceUrl, getAvatarThumbnailUrl } from './utils'

// 动态卡片头部：发布者头像、昵称与发布时间。右侧操作经 actions 插槽注入。
const { author, href = '', time = '', meta = '' } = defineProps<{
  author: DisplayMoment['author']
  /** 头部留白与时间的落点（通常为动态详情） */
  href?: string
  time?: string
  /** 时间后的补充说明，如“视频动态” */
  meta?: string
}>()

const emit = defineEmits<{
  authorClick: [event: MouseEvent]
  detailClick: [event: MouseEvent]
}>()

const { t } = useI18n()
const authorSpaceUrl = computed(() => getAuthorSpaceUrl(author.mid))
</script>

<template>
  <header class="moment-card__header">
    <a
      :href="href"
      class="moment-card__permalink"
      draggable="false"
      tabindex="-1"
      aria-hidden="true"
      @click="emit('detailClick', $event)"
    />
    <a
      v-if="authorSpaceUrl"
      draggable="false"
      :href="authorSpaceUrl"
      class="moment-card__author-link"
      :aria-label="t('moment_card.open_space', { name: author.name })"
      rel="noopener noreferrer"
      @click="emit('authorClick', $event)"
    >
      <img :src="getAvatarThumbnailUrl(author.face)" :alt="author.name" class="moment-card__avatar" loading="lazy" decoding="async">
    </a>
    <img
      v-else
      :src="getAvatarThumbnailUrl(author.face)"
      :alt="author.name"
      class="moment-card__avatar"
      loading="lazy"
      decoding="async"
    >
    <span class="moment-card__identity">
      <a
        v-if="authorSpaceUrl"
        draggable="false"
        :href="authorSpaceUrl"
        class="moment-card__author-name"
        :aria-label="t('moment_card.open_space', { name: author.name })"
        rel="noopener noreferrer"
        @click="emit('authorClick', $event)"
      >{{ author.name }}</a>
      <strong v-else>
        <a :href="href" class="moment-card__text-link" draggable="false" tabindex="-1" @click="emit('detailClick', $event)">{{ author.name }}</a>
      </strong>
      <small>
        <a :href="href" class="moment-card__text-link" draggable="false" tabindex="-1" @click="emit('detailClick', $event)">
          {{ time || t('moment_card.just_now') }}<template v-if="meta"> · {{ meta }}</template>
        </a>
      </small>
    </span>
    <slot name="actions" />
  </header>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__header {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-4);
}

.moment-card__permalink {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.moment-card__author-link,
.moment-card__author-name,
.moment-card__text-link {
  @include mixins.interactive-layer;
}

.moment-card__text-link {
  @include mixins.text-link;
}

.moment-card__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bew-fill-1);
}

.moment-card__identity {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.moment-card__identity strong,
.moment-card__identity small,
.moment-card__identity .moment-card__author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__author-link {
  display: block;
  flex: 0 0 auto;
  border-radius: 50%;
  line-height: 0;
  text-decoration: none;
}

.moment-card__author-link:focus-visible,
.moment-card__author-name:focus-visible {
  @include mixins.focus-ring;
}

.moment-card__author-name {
  display: block;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
  line-height: inherit;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.16s ease;
}

.moment-card__author-name:hover {
  color: var(--bew-theme-color);
}

.moment-card__identity strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-card__identity small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}
</style>
