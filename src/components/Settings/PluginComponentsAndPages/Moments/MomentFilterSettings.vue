<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import { MOMENT_TYPE_FILTER_OPTIONS } from '~/constants/momentFilters'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

const { t } = useI18n()

const filterOptions = computed(() => MOMENT_TYPE_FILTER_OPTIONS.map(option => ({
  setting: option.setting,
  label: t(option.labelKey),
  icon: option.icon,
})))
</script>

<template>
  <!-- 插件动态页与原版动态页共用同一组过滤规则；默认插槽放各自的开关。 -->
  <SettingsItemGroup :title="$t('settings.group_moments_filters')">
    <slot />
    <SettingsItem
      :title="$t('settings.moments_filtered_types')"
      :desc="$t('settings.moments_filtered_types_desc')"
    >
      <template #bottom>
        <div class="moment-filter-tags" role="group" :aria-label="$t('settings.moments_filtered_types')">
          <SettingsToggleTag
            v-for="option in filterOptions"
            :key="option.setting"
            v-model="settings[option.setting]"
            :label="option.label"
            :icon="option.icon"
            inverted
            :show-state-icon="false"
          />
        </div>
      </template>
    </SettingsItem>
    <SettingsItem
      :title="$t('settings.moments_keyword_filter')"
      :desc="$t('settings.moments_keyword_filter_desc')"
      right-width="auto"
    >
      <div
        class="moment-keyword-filter"
        :class="{ 'moment-keyword-filter--enabled': settings.momentsEnableKeywordFilter }"
      >
        <Input
          v-if="settings.momentsEnableKeywordFilter"
          v-model="settings.momentsBlockedKeywords"
          :placeholder="$t('settings.moments_keyword_filter_placeholder')"
          class="moment-keyword-filter__input"
        />
        <Radio v-model="settings.momentsEnableKeywordFilter" />
      </div>
    </SettingsItem>
  </SettingsItemGroup>
</template>

<style scoped lang="scss">
.moment-filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
}

.moment-keyword-filter {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: flex-end;

  &--enabled {
    width: min(360px, 40vw);
  }

  &__input {
    flex: 1;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .moment-keyword-filter--enabled {
    width: min(280px, 48vw);
  }
}
</style>
