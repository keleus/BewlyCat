<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'
import MomentFilterSettings from '../../PluginComponentsAndPages/Moments/MomentFilterSettings.vue'

const { t } = useI18n()

const componentOptions = computed(() => [
  { setting: 'originalMomentsShowUserCard' as const, label: t('settings.original_moments_show_user_card'), labelKey: 'settings.original_moments_show_user_card', icon: 'i-tabler-user-square-rounded' },
  { setting: 'originalMomentsShowLiveList' as const, label: t('settings.original_moments_show_live_list'), labelKey: undefined, icon: 'i-tabler-live-photo' },
  { setting: 'originalMomentsShowCommunityCenter' as const, label: t('settings.original_moments_show_community_center'), labelKey: undefined, icon: 'i-tabler-layout-dashboard' },
  { setting: 'originalMomentsShowHotSearch' as const, label: t('settings.original_moments_show_hot_search'), labelKey: 'settings.original_moments_show_hot_search', icon: 'i-tabler-flame' },
  { setting: 'originalMomentsShowUpList' as const, label: t('settings.original_moments_show_up_list'), labelKey: undefined, icon: 'i-tabler-users' },
])
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_original_moments_page')">
      <SettingsItem
        :title="$t('settings.moments_visible_components')"
        :desc="$t('settings.moments_visible_components_original_desc')"
      >
        <template #bottom>
          <div class="moment-setting-tags" role="group" :aria-label="$t('settings.moments_visible_components')">
            <SettingsToggleTag
              v-for="option in componentOptions"
              :key="option.setting"
              v-model="settings[option.setting]"
              :label="option.label"
              :icon="option.icon"
              :data-settings-key="option.labelKey"
            />
          </div>
        </template>
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.original_moments_show_fold_comments_button')"
        :desc="$t('settings.original_moments_show_fold_comments_button_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.originalMomentsShowFoldCommentsButton" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.original_moments_click_blank_to_fold_comments')"
        :desc="$t('settings.original_moments_click_blank_to_fold_comments_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.originalMomentsClickBlankToFoldComments" />
      </SettingsItem>
    </SettingsItemGroup>

    <MomentFilterSettings>
      <SettingsItem
        :title="$t('settings.original_moments_use_bewly_filters')"
        :desc="$t('settings.original_moments_use_bewly_filters_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.originalMomentsUseBewlyFilters" />
      </SettingsItem>
    </MomentFilterSettings>
  </div>
</template>

<style scoped lang="scss">
.moment-setting-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
}
</style>
