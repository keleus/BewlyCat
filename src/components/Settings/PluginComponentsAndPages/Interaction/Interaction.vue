<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import LinkOpening from '../../Navigation/LinkOpening.vue'
</script>

<template>
  <div>
    <LinkOpening />

    <SettingsItemGroup :title="$t('settings.group_drawer_behavior')">
      <SettingsItem :title="$t('settings.close_drawer_without_pressing_esc_again')" right-width="auto">
        <template #title>
          <div v-html="$t('settings.close_drawer_without_pressing_esc_again')" />
        </template>
        <Radio v-model="settings.closeDrawerWithoutPressingEscAgain" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.hide_drawer_esc_hint')" :desc="$t('settings.hide_drawer_esc_hint_desc')" right-width="auto">
        <Radio v-model="settings.hideDrawerEscHint" />
      </SettingsItem>
    </SettingsItemGroup>

    <!-- 横向滚动列表只出现在 Bewly 番剧页。 -->
    <SettingsItemGroup v-if="!settings.useOriginalBilibiliHomepage" :title="$t('settings.group_list_scrolling')">
      <SettingsItem :title="$t('settings.enable_horizontal_scrolling')" :desc="$t('settings.enable_horizontal_scrolling_desc')" right-width="auto">
        <Radio v-model="settings.enableHorizontalScrolling" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
