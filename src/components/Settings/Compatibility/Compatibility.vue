<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'
import { isHomePage } from '~/utils/main'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

watch(() => settings.value.useOriginalBilibiliHomepage, () => {
  if (isHomePage())
    location.reload()
})
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_common')">
      <SettingsItem :title="$t('settings.use_original_bilibili_homepage')" right-width="auto">
        <template #desc>
          <span color="$bew-error-color" v-text="$t('settings.use_original_bilibili_homepage_desc')" />
        </template>
        <Radio v-model="settings.useOriginalBilibiliHomepage" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.prevent_mobile_redirect')"
        :desc="$t('settings.prevent_mobile_redirect_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.preventMobileRedirect" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_ad_blocking')">
      <SettingsItem :title="$t('settings.block_ads')" right-width="auto">
        <Radio v-model="settings.blockAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.block_top_search_page_ads')" :desc="$t('settings.block_top_search_page_ads_desc')" right-width="auto">
        <Radio v-model="settings.blockTopSearchPageAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.clean_url_argument')" :desc="$t('settings.clean_url_argument_desc')" right-width="auto">
        <Radio v-model="settings.cleanUrlArgument" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_clean_share_link')">
      <SettingsItem :title="$t('settings.enable_clean_share_link')" :desc="$t('settings.enable_clean_share_link_desc')" right-width="auto">
        <Radio v-model="settings.enableCleanShareLink" />
      </SettingsItem>
      <template v-if="settings.enableCleanShareLink">
        <SettingsItem :title="$t('settings.clean_share_link_include_title')" :desc="$t('settings.clean_share_link_include_title_desc')" right-width="auto">
          <Radio v-model="settings.cleanShareLinkIncludeTitle" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.clean_share_link_remove_tracking_params')" :desc="$t('settings.clean_share_link_remove_tracking_params_desc')" right-width="auto">
          <Radio v-model="settings.cleanShareLinkRemoveTrackingParams" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>
  </div>
</template>
