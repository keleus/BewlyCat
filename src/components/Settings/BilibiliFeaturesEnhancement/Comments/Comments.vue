<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'
import type { CommentReplyTreeMode } from '~/logic/storage'

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

const commentReplyTreeModeOptions = computed<{ label: string, value: CommentReplyTreeMode }[]>(() => [
  {
    label: t('settings.comment_reply_tree_mode.line_collapse_main'),
    value: 'lineCollapseMain',
  },
  {
    label: t('settings.comment_reply_tree_mode.line_keep_main'),
    value: 'lineKeepMain',
  },
  {
    label: t('settings.comment_reply_tree_mode.indent_only'),
    value: 'indentOnly',
  },
])
</script>

<template>
  <SettingsItemGroup :title="$t('settings.group_comments')">
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
      :title="$t('settings.enable_comment_reply_tree_display')"
      :desc="$t('settings.enable_comment_reply_tree_display_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enableCommentReplyTreeDisplay" />
    </SettingsItem>

    <SettingsItem
      v-if="settings.enableCommentReplyTreeDisplay"
      :title="$t('settings.comment_reply_tree_mode.title')"
      :desc="$t('settings.comment_reply_tree_mode.desc')"
      right-width="auto"
    >
      <Select
        v-model="settings.commentReplyTreeMode"
        :options="commentReplyTreeModeOptions"
        w="220px"
      />
    </SettingsItem>

    <SettingsItem
      :title="$t('settings.adjust_comment_image_height')"
      :desc="$t('settings.adjust_comment_image_height_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.adjustCommentImageHeight" />
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
