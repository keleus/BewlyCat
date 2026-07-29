<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

const { t } = useI18n()

type CommentToggleSetting
  = | 'showIPLocation'
    | 'showSex'
    | 'showCommentHostTag'

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

    <SettingsItem
      :title="$t('settings.show_comment_floor_number')"
      :desc="$t('settings.show_comment_floor_number_desc')"
      :badge="`${$t('settings.experimental')} · ${$t('settings.badge_use_with_caution')}`"
      right-width="auto"
    >
      <Radio v-model="settings.showCommentFloorNumber" />
    </SettingsItem>

    <SettingsItem
      :title="$t('settings.adjust_comment_image_height')"
      :desc="$t('settings.adjust_comment_image_height_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.adjustCommentImageHeight" />
    </SettingsItem>

    <SettingsItem
      :title="$t('settings.detect_comment_shadow_ban')"
      :desc="$t('settings.detect_comment_shadow_ban_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.detectCommentShadowBan" />
    </SettingsItem>
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
