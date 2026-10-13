<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import MomentImageSet from './MomentImageSet.vue'
import MomentRichText from './MomentRichText.vue'
import type { DisplayMoment } from './types'
import { getAuthorSpaceUrl } from './utils'

// 转发引用卡：原作者、原文摘要与原动态配图。点击整块或“查看原动态”由调用方决定打开方式。
const {
  forward,
  fallbackHref = '',
  imageRatio,
  containerWidth = 0,
} = defineProps<{
  forward: NonNullable<DisplayMoment['forward']>
  /** 原动态缺少地址时的兜底落点（通常为转发动态本身） */
  fallbackHref?: string
  /** 原动态首图实测宽高比 */
  imageRatio?: number
  /** 配图画廊可用宽度 */
  containerWidth?: number
}>()

const emit = defineEmits<{
  /** 点击引用卡留白区域 */
  cardClick: [event: MouseEvent]
  /** 键盘激活引用卡 */
  activate: []
  /** 点击原文文字 */
  textClick: [event: MouseEvent]
  /** 点击“查看原动态” */
  viewOriginalClick: [event: MouseEvent]
  authorClick: [event: MouseEvent]
  linkClick: [event: MouseEvent, url: string]
  coverLoad: [event: Event]
  preview: [urls: string[], index: number, trigger: HTMLElement | null]
}>()

const { t } = useI18n()
const href = computed(() => forward.url || fallbackHref)
const authorSpaceUrl = computed(() => getAuthorSpaceUrl(forward.authorMid))
</script>

<template>
  <div
    class="moment-card__forward"
    :class="{
      'moment-card__forward--draw': Boolean(forward.images?.length),
    }"
    role="button"
    tabindex="0"
    :aria-label="t('moment_card.open_origin_moment', { name: forward.author })"
    @click="emit('cardClick', $event)"
    @keydown.enter.self.stop="emit('activate')"
    @keydown.space.self.stop.prevent="emit('activate')"
  >
    <a
      :href="href"
      class="moment-card__permalink"
      draggable="false"
      tabindex="-1"
      aria-hidden="true"
      @click="emit('textClick', $event)"
    />
    <div class="moment-card__forward-copy">
      <a
        v-if="authorSpaceUrl"
        draggable="false"
        :href="authorSpaceUrl"
        class="moment-card__forward-author"
        rel="noopener noreferrer"
        @click="emit('authorClick', $event)"
      >@{{ forward.author }}</a>
      <strong v-else>
        <a
          :href="href"
          class="moment-card__text-link"
          draggable="false"
          tabindex="-1"
          @click="emit('textClick', $event)"
        >@{{ forward.author }}</a>
      </strong>
      <p>
        <MomentRichText
          v-if="!forward.title && forward.richText?.length"
          :segments="forward.richText"
          :href="href"
          @link-click="(event, url) => emit('linkClick', event, url)"
          @text-click="event => emit('textClick', event)"
        />
        <a
          v-else
          :href="href"
          class="moment-card__text-link"
          draggable="false"
          tabindex="-1"
          @click="emit('textClick', $event)"
        >
          {{ forward.title || forward.text || forward.fallback }}
        </a>
      </p>
      <a
        :href="href"
        draggable="false"
        class="moment-card__desc-toggle"
        :aria-label="t('moment_card.open_origin_moment', { name: forward.author })"
        @click="emit('viewOriginalClick', $event)"
      >
        {{ t('moment_card.view_original_post') }}
        <span i-tabler-chevron-right aria-hidden="true" />
      </a>
    </div>
    <MomentImageSet
      v-if="forward.images?.length"
      forward
      :images="forward.images"
      :image-ratios="forward.imageRatios"
      :is-nine-grid="forward.isNineGrid"
      :image-ratio="imageRatio"
      :container-width="containerWidth"
      :author-name="forward.author"
      @cover-load="emit('coverLoad', $event)"
      @preview="(urls, index, trigger) => emit('preview', urls, index, trigger)"
    />
  </div>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__forward {
  @include mixins.interactive-layer;

  display: flex;
  flex-direction: column;
  margin-top: var(--bew-space-4);
  overflow: hidden;
  /* 引用原文可拖选复制，也可点击查看原动态。 */
  border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 58%);
  border-radius: var(--bew-card-radius);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  transition: background-color 0.16s ease;
}

.moment-card__forward:hover,
.moment-card__forward:focus-visible {
  background: var(--bew-fill-2);
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

.moment-card__forward-copy {
  padding: var(--bew-space-3);
}

.moment-card__forward strong {
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-card__forward p {
  display: -webkit-box;
  margin: var(--bew-space-1) 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.moment-card__forward-author,
.moment-card__text-link,
.moment-card__desc-toggle {
  @include mixins.interactive-layer;
}

.moment-card__forward-author {
  @include mixins.forward-author;

  display: inline-block;
  max-width: 100%;
}

.moment-card__text-link {
  @include mixins.text-link;
}

.moment-card__desc-toggle {
  @include mixins.desc-toggle;
}
</style>
