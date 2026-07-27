<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'

import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

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
</script>

<template>
  <div class="video-card-content-editor">
    <div v-for="group in groups" :key="group.id" class="content-row">
      <span class="content-row__label">{{ group.label }}</span>

      <div class="content-row__elements">
        <SettingsToggleTag
          v-for="element in group.elements"
          :key="element.setting"
          v-model="settings[element.setting]"
          :label="element.label"
          :icon="element.icon"
        />
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
