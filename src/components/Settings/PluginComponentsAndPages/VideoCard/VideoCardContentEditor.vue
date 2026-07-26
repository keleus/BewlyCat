<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'

const { t } = useI18n()

type ContentSettingKey
  = | 'showVideoCardAuthorAvatar'
    | 'showVideoCardAuthorName'
    | 'showVideoCardVideoTag'
    | 'showVideoCardRecommendTag'
    | 'showVideoCardPublishTime'
    | 'showVideoCardViewCount'
    | 'showVideoCardDanmakuCount'
    | 'showVideoCardLikeCount'
    | 'showVideoCardDuration'
    | 'showVideoCardWatchLater'

interface ContentElement {
  setting: ContentSettingKey
  label: string
  icon: string
}

interface ContentGroup {
  id: string
  label: string
  elements: ContentElement[]
}

const groups = computed<ContentGroup[]>(() => [
  {
    id: 'stats',
    label: t('settings.video_card_content_region_stats'),
    elements: [
      { setting: 'showVideoCardViewCount', label: t('settings.show_video_card_view_count'), icon: 'i-mingcute:play-circle-line' },
      { setting: 'showVideoCardDanmakuCount', label: t('settings.show_video_card_danmaku_count'), icon: 'i-mingcute:danmaku-line' },
      { setting: 'showVideoCardLikeCount', label: t('settings.show_video_card_like_count'), icon: 'i-mingcute:thumb-up-2-line' },
      { setting: 'showVideoCardDuration', label: t('settings.show_video_card_duration'), icon: 'i-mingcute:time-line' },
    ],
  },
  {
    id: 'tags',
    label: t('settings.video_card_content_region_tags'),
    elements: [
      { setting: 'showVideoCardPublishTime', label: t('settings.show_video_card_publish_time'), icon: 'i-mingcute:calendar-time-add-line' },
      { setting: 'showVideoCardVideoTag', label: t('settings.show_video_card_video_tag'), icon: 'i-mingcute:tag-line' },
      { setting: 'showVideoCardRecommendTag', label: t('settings.show_video_card_recommend_tag'), icon: 'i-mingcute:sparkles-line' },
    ],
  },
  {
    id: 'other',
    label: t('settings.video_card_content_region_other'),
    elements: [
      { setting: 'showVideoCardAuthorAvatar', label: t('settings.show_video_card_author_avatar'), icon: 'i-mingcute:user-4-line' },
      { setting: 'showVideoCardAuthorName', label: t('settings.show_video_card_author_name'), icon: 'i-mingcute:edit-3-line' },
      { setting: 'showVideoCardWatchLater', label: t('settings.show_video_card_watch_later'), icon: 'i-mingcute:carplay-line' },
    ],
  },
])

function toggleElement(element: ContentElement) {
  settings.value[element.setting] = !settings.value[element.setting]
}
</script>

<template>
  <div class="video-card-content-editor">
    <div v-for="group in groups" :key="group.id" class="content-row">
      <span class="content-row__label">{{ group.label }}</span>

      <div class="content-row__elements">
        <button
          v-for="element in group.elements"
          :key="element.setting"
          type="button"
          class="content-element"
          :class="{ 'content-element--visible': settings[element.setting] }"
          :aria-pressed="settings[element.setting]"
          @click="toggleElement(element)"
        >
          <span class="content-element__icon" :class="element.icon" />
          <span>{{ element.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.video-card-content-editor {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--bew-border-color);
}

.content-row {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  min-height: 3rem;
}

.content-row + .content-row {
  border-top: 1px solid var(--bew-border-color);
}

.content-row__label {
  color: var(--bew-text-1);
  font-size: 1rem;
  font-weight: 400;
}

.content-row__elements {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.5rem 0;
}

.content-element {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2rem;
  padding: 0.375rem 0.625rem;
  color: var(--bew-text-3);
  font-size: 0.75rem;
  line-height: 1;
  background: var(--bew-fill-1);
  border: 1px solid transparent;
  border-radius: 0.625rem;
  opacity: 0.65;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.content-element:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
  opacity: 1;
}

.content-element:active {
  transform: scale(0.96);
}

.content-element--visible {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-20);
  border-color: color-mix(in srgb, var(--bew-theme-color) 35%, transparent);
  opacity: 1;
}

.content-element__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 auto;
  font-size: 0.875rem;
}

@media (max-width: 520px) {
  .content-row {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 0.5rem 0;
  }

  .content-row__elements {
    padding-bottom: 0;
  }
}
</style>
