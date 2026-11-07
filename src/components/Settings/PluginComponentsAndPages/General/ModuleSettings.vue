<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const bewlyPagesEnabled = computed({
  get: () => !settings.value.useOriginalBilibiliHomepage,
  set: enabled => settings.value.useOriginalBilibiliHomepage = !enabled,
})
</script>

<template>
  <SettingsItemGroup
    :title="$t('settings.group_modules_interface')"
    :desc="$t('settings.group_modules_interface_desc')"
  >
    <SettingsItem
      :title="$t('settings.module_bewly_pages')"
      :desc="$t('settings.module_bewly_pages_desc')"
      right-width="auto"
    >
      <Radio v-model="bewlyPagesEnabled" />
    </SettingsItem>
    <SettingsItem
      :title="$t('settings.module_top_bar')"
      :desc="$t('settings.module_top_bar_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enableTopBarModule" />
    </SettingsItem>
    <SettingsItem
      :title="$t('settings.module_dock')"
      :desc="$t('settings.module_dock_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enableDock" />
    </SettingsItem>
    <SettingsItem
      :title="$t('settings.module_sidebar')"
      :desc="$t('settings.module_sidebar_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enableSideBar" />
    </SettingsItem>
    <SettingsItem
      :title="$t('settings.adapt_to_other_page_styles')"
      :desc="$t('settings.adapt_to_other_page_styles_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.adaptToOtherPageStyles" />
    </SettingsItem>
  </SettingsItemGroup>

  <SettingsItemGroup
    :title="$t('settings.group_modules_enhancements')"
    :desc="$t('settings.group_modules_enhancements_desc')"
  >
    <SettingsItem
      :title="$t('settings.module_comments')"
      :desc="$t('settings.module_comments_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enableCommentEnhancements" />
    </SettingsItem>
    <SettingsItem
      :title="$t('settings.module_player')"
      :desc="$t('settings.module_player_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enablePlayerEnhancements" />
    </SettingsItem>
    <SettingsItem
      :title="$t('settings.module_shortcuts')"
      :desc="$t('settings.module_shortcuts_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.keyboard" />
    </SettingsItem>
  </SettingsItemGroup>
</template>
