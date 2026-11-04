<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import HeaderFilterPopover from '~/components/HeaderFilterPopover.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import SettingsToggleTag from '~/components/Settings/components/SettingsToggleTag.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { MomentTypeFilterSetting } from '~/constants/momentFilters'
import { MOMENT_TYPE_FILTER_OPTIONS } from '~/constants/momentFilters'
import { settings } from '~/logic'

type MomentFilterDraft = Record<MomentTypeFilterSetting, boolean> & {
  momentsEnableKeywordFilter: boolean
  momentsBlockedKeywords: string
}

const { t } = useI18n()
const { openSettings } = useBewlyApp()

function readDraft(): MomentFilterDraft {
  const draft = {
    momentsEnableKeywordFilter: settings.value.momentsEnableKeywordFilter,
    momentsBlockedKeywords: settings.value.momentsBlockedKeywords,
  } as MomentFilterDraft
  for (const option of MOMENT_TYPE_FILTER_OPTIONS)
    draft[option.setting] = settings.value[option.setting]
  return draft
}

// 动态页在任一过滤设置变化时立即重新加载；面板内先改草稿，关闭时一次写回，只触发一次重新加载。
const draft = reactive<MomentFilterDraft>(readDraft())

const activeCount = computed(() => [
  ...MOMENT_TYPE_FILTER_OPTIONS.map(option => settings.value[option.setting]),
  settings.value.momentsEnableKeywordFilter && settings.value.momentsBlockedKeywords.trim() !== '',
].filter(Boolean).length)

const triggerLabel = computed(() => activeCount.value
  ? t('moments.filter_panel.entry_active', { count: activeCount.value })
  : t('moments.filter_panel.entry'))

function handleOpen() {
  Object.assign(draft, readDraft())
}

function handleClose() {
  const changed = (Object.keys(draft) as (keyof MomentFilterDraft)[])
    .some(key => draft[key] !== settings.value[key])
  if (changed)
    settings.value = { ...settings.value, ...draft }
}

function openFilterSettings(close: () => void) {
  close()
  openSettings({
    menu: 'BewlyPages',
    secondaryPage: 'moments',
    targetTitleKey: 'settings.group_moments_filters',
  })
}
</script>

<template>
  <HeaderFilterPopover
    :label="triggerLabel"
    :title="t('settings.group_moments_filters')"
    :active="activeCount > 0"
    @open="handleOpen"
    @close="handleClose"
  >
    <template #actions="{ close }">
      <button type="button" class="header-filter-link" @click="openFilterSettings(close)">
        {{ t('moments.filter_panel.more_settings') }}
      </button>
    </template>

    <div class="header-filter-section">
      <div class="header-filter-item">
        <span class="header-filter-caption">{{ t('moments.filter_panel.shown_types') }}</span>
        <div class="moments-filter-tags" role="group" :aria-label="t('settings.moments_filtered_types')">
          <SettingsToggleTag
            v-for="option in MOMENT_TYPE_FILTER_OPTIONS"
            :key="option.setting"
            v-model="draft[option.setting]"
            :label="t(option.labelKey)"
            :icon="option.icon"
            inverted
            :show-state-icon="false"
          />
        </div>
      </div>
    </div>

    <div class="header-filter-section">
      <div class="header-filter-item">
        <Radio
          v-model="draft.momentsEnableKeywordFilter"
          class="header-filter-switch"
          :label="t('settings.moments_keyword_filter')"
        />
        <Input
          v-if="draft.momentsEnableKeywordFilter"
          v-model="draft.momentsBlockedKeywords"
          size="small"
          :placeholder="t('settings.moments_keyword_filter_placeholder')"
          :aria-label="t('settings.moments_keyword_filter')"
        />
      </div>
      <p class="header-filter-caption">
        {{ t('moments.filter_panel.apply_hint') }}
      </p>
    </div>
  </HeaderFilterPopover>
</template>

<style scoped lang="scss">
.moments-filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
}
</style>
