<script setup lang="ts">
import type { DisplayRichTextSegment } from './types'

const { segments, href = '', linkable = true } = defineProps<{
  segments: DisplayRichTextSegment[]
  /** 普通文字与表情的链接落点（通常为动态详情），保证拖选与中键打开仍落在原动态 */
  href?: string
  /** 关闭后只输出文字与表情，用于外层已是按钮的场景（如热评摘要） */
  linkable?: boolean
}>()

const emit = defineEmits<{
  /** 话题、@、网页、抽奖等可跳转片段 */
  linkClick: [event: MouseEvent, url: string]
  /** 普通文字与表情片段 */
  textClick: [event: MouseEvent]
}>()

function isLink(segment: DisplayRichTextSegment): segment is DisplayRichTextSegment & { url: string } {
  return segment.type === 'link' && Boolean(segment.url)
}

function handleClick(event: MouseEvent, segment: DisplayRichTextSegment) {
  if (isLink(segment))
    emit('linkClick', event, segment.url)
  else
    emit('textClick', event)
}
</script>

<template>
  <template v-if="linkable">
    <a
      v-for="(segment, segmentIndex) in segments"
      :key="segmentIndex"
      draggable="false"
      :href="isLink(segment) ? segment.url : href"
      :target="isLink(segment) ? '_blank' : undefined"
      :tabindex="isLink(segment) ? undefined : -1"
      rel="noopener noreferrer"
      :class="isLink(segment) ? 'moment-card__rich-link' : 'moment-card__text-link'"
      @click="handleClick($event, segment)"
    >
      <img
        v-if="segment.type === 'emoji' && segment.imageUrl"
        :src="segment.imageUrl"
        :alt="segment.text"
        :title="segment.text"
        class="moment-card__emoji"
        :class="{ 'moment-card__emoji--large': segment.size === 2 }"
        loading="lazy"
        decoding="async"
      >
      <template v-else>
        <span v-if="segment.isLottery" i-tabler-gift class="moment-card__lottery-icon" aria-hidden="true" />{{ segment.text }}
      </template>
    </a>
  </template>
  <template v-else>
    <template v-for="(segment, segmentIndex) in segments" :key="segmentIndex">
      <img
        v-if="segment.type === 'emoji' && segment.imageUrl"
        :src="segment.imageUrl"
        :alt="segment.text"
        :title="segment.text"
        class="moment-card__emoji"
        :class="{ 'moment-card__emoji--large': segment.size === 2 }"
        loading="lazy"
        decoding="async"
      >
      <template v-else>
        {{ segment.text }}
      </template>
    </template>
  </template>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__text-link,
.moment-card__rich-link {
  @include mixins.interactive-layer;
}

.moment-card__text-link {
  @include mixins.text-link;
}

.moment-card__rich-link {
  color: var(--bew-theme-color);
  text-decoration: none;
  text-underline-offset: 0.15em;
}

.moment-card__rich-link:hover {
  text-decoration: underline;
}

.moment-card__emoji {
  display: inline-block;
  width: 1.35em;
  height: 1.35em;
  margin: 0 0.08em;
  vertical-align: -0.28em;
  object-fit: contain;
}

.moment-card__emoji--large {
  width: 1.6em;
  height: 1.6em;
  vertical-align: -0.4em;
}

.moment-card__lottery-icon {
  display: inline-block;
  vertical-align: -0.125em;
  margin-right: var(--bew-space-1);
  font-size: var(--bew-icon-size-sm);
}
</style>
