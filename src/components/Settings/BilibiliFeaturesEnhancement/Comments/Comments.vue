<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'

import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

const { t } = useI18n()

type CommentToggleSetting
  = | 'showIPLocation'
    | 'showSex'
    | 'showCommentHostTag'
    | 'adjustCommentImageHeight'
    | 'detectCommentShadowBan'

interface CommentToggleOption {
  setting: CommentToggleSetting
  label: string
  description: string
  icon: string
}

const commentToggleOptions = computed<CommentToggleOption[]>(() => [
  { setting: 'showIPLocation', label: t('settings.show_ip_location'), description: t('settings.show_ip_location_desc'), icon: 'i-tabler-map-pin' },
  { setting: 'showSex', label: t('settings.show_sex'), description: t('settings.show_sex_desc'), icon: 'i-tabler-gender-bigender' },
  { setting: 'showCommentHostTag', label: t('settings.show_comment_host_tag'), description: t('settings.show_comment_host_tag_desc'), icon: 'i-tabler-user-star' },
  { setting: 'adjustCommentImageHeight', label: t('settings.adjust_comment_image_height'), description: t('settings.adjust_comment_image_height_desc'), icon: 'i-tabler-photo' },
  { setting: 'detectCommentShadowBan', label: t('settings.detect_comment_shadow_ban'), description: t('settings.detect_comment_shadow_ban_desc'), icon: 'i-tabler-eye-search' },
])
</script>

<template>
  <SettingsItemGroup>
    <div class="comment-setting-tags" role="group" :aria-label="$t('settings.group_comments')">
      <SettingsToggleTag
        v-for="option in commentToggleOptions"
        :key="option.setting"
        v-model="settings[option.setting]"
        :label="option.label"
        :description="option.description"
        :icon="option.icon"
        :show-state-icon="false"
      />
    </div>
  </SettingsItemGroup>
</template>

<style lang="scss" scoped>
.comment-setting-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 1rem 0;
}
</style>
