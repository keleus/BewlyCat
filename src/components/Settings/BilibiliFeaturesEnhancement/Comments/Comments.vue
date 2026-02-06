<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_comments')">
      <SettingsItem :title="$t('settings.show_ip_location')" :desc="$t('settings.show_ip_location_desc')">
        <Radio v-model="settings.showIPLocation" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.show_sex')" :desc="$t('settings.show_sex_desc')">
        <Radio v-model="settings.showSex" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.show_comment_host_tag')" :desc="$t('settings.show_comment_host_tag_desc')">
        <Radio v-model="settings.showCommentHostTag" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.adjust_comment_image_height')" :desc="$t('settings.adjust_comment_image_height_desc')">
        <Radio v-model="settings.adjustCommentImageHeight" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
