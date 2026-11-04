<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import HeaderFilterPopover from '~/components/HeaderFilterPopover.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'

type NumericFilterEnabledKey = 'enableFilterByViewCount' | 'enableFilterByLikeCount' | 'enableFilterByDuration' | 'enableFilterByPublishTime'
type NumericFilterValueKey = 'filterByViewCount' | 'filterByLikeCount' | 'filterByDuration' | 'filterByPublishTime'

interface NumericFilter {
  enabledKey: NumericFilterEnabledKey
  valueKey: NumericFilterValueKey
  titleKey: string
  unitKey: string
  min: number
  max: number
  webOnly?: boolean
}

// 与设置页「推荐过滤」保持同一组设置；标题、用户关键词表仍在设置页维护。
const NUMERIC_FILTERS: NumericFilter[] = [
  { enabledKey: 'enableFilterByViewCount', valueKey: 'filterByViewCount', titleKey: 'settings.filter_by_view_count', unitKey: 'settings.filter_by_view_count_unit', min: 1, max: 1000000 },
  { enabledKey: 'enableFilterByLikeCount', valueKey: 'filterByLikeCount', titleKey: 'settings.filter_by_like_count', unitKey: 'settings.filter_by_like_count_unit', min: 1, max: 1000000, webOnly: true },
  { enabledKey: 'enableFilterByDuration', valueKey: 'filterByDuration', titleKey: 'settings.filter_by_duration', unitKey: 'settings.filter_by_duration_unit', min: 1, max: 1000000 },
  { enabledKey: 'enableFilterByPublishTime', valueKey: 'filterByPublishTime', titleKey: 'settings.filter_by_publish_time', unitKey: 'settings.filter_by_publish_time_unit', min: 7, max: 365, webOnly: true },
]

const { t } = useI18n()
const { openSettings, refreshCurrentPage } = useBewlyApp()

let signatureOnOpen = ''

// 竖屏过滤只对 App 推荐有效，点赞数与发布时间只对 Web 推荐有效；面板只列出当前模式可用的条件。
const isAppMode = computed(() => settings.value.recommendationMode === 'app')
const numericFilters = computed(() => NUMERIC_FILTERS.filter(filter => !filter.webOnly || !isAppMode.value))

const activeCount = computed(() => [
  isAppMode.value && settings.value.filterOutVerticalVideos,
  ...numericFilters.value.map(filter => settings.value[filter.enabledKey]),
  settings.value.enableFilterByTitle,
  settings.value.enableFilterByUser,
].filter(Boolean).length)

const triggerLabel = computed(() => activeCount.value
  ? t('home.recommendation_filter.entry_active', { count: activeCount.value })
  : t('home.recommendation_filter.entry'))

function getFilterSignature() {
  return JSON.stringify([
    settings.value.disableFilterForFollowedUser,
    settings.value.filterOutVerticalVideos,
    ...NUMERIC_FILTERS.flatMap(filter => [settings.value[filter.enabledKey], Number(settings.value[filter.valueKey])]),
    settings.value.enableFilterByTitle,
    settings.value.enableFilterByUser,
  ])
}

function handleOpen() {
  signatureOnOpen = getFilterSignature()
}

// 过滤只作用于新请求的推荐，条件变化后按新条件重新加载。
function handleClose() {
  if (getFilterSignature() !== signatureOnOpen)
    refreshCurrentPage()
}

function openFilterSettings(close: () => void, targetTitleKey: string) {
  close()
  openSettings({
    menu: 'BewlyPages',
    secondaryPage: 'home',
    targetTitleKey,
  })
}
</script>

<template>
  <HeaderFilterPopover
    :label="triggerLabel"
    :title="t('home.recommendation_filter.title')"
    :active="activeCount > 0"
    @open="handleOpen"
    @close="handleClose"
  >
    <template #actions="{ close }">
      <button type="button" class="header-filter-link" @click="openFilterSettings(close, 'settings.group_recommendation_filters')">
        {{ t('home.recommendation_filter.more_settings') }}
      </button>
    </template>

    <template #default="{ close }">
      <div class="header-filter-section">
        <Radio
          v-if="isAppMode"
          v-model="settings.filterOutVerticalVideos"
          class="header-filter-switch"
          :label="t('home.recommendation_filter.vertical_videos')"
        />
        <div v-for="filter in numericFilters" :key="filter.enabledKey" class="header-filter-item">
          <Radio v-model="settings[filter.enabledKey]" class="header-filter-switch" :label="t(filter.titleKey)" />
          <Input
            v-if="settings[filter.enabledKey]"
            v-model="settings[filter.valueKey]"
            type="number"
            size="small"
            :min="filter.min"
            :max="filter.max"
            :aria-label="t(filter.titleKey)"
          >
            <template #suffix>
              {{ t(filter.unitKey) }}
            </template>
          </Input>
        </div>
      </div>

      <div class="header-filter-section">
        <div class="header-filter-item">
          <Radio v-model="settings.enableFilterByTitle" class="header-filter-switch" :label="t('settings.filter_by_title')" />
          <div class="header-filter-caption">
            <span>{{ t('home.recommendation_filter.rule_count', { count: settings.filterByTitle.length }) }}</span>
            <button type="button" class="header-filter-link" @click="openFilterSettings(close, 'settings.filter_by_title')">
              {{ t('home.recommendation_filter.manage') }}
            </button>
          </div>
        </div>
        <div class="header-filter-item">
          <Radio v-model="settings.enableFilterByUser" class="header-filter-switch" :label="t('settings.filter_by_user')" />
          <div class="header-filter-caption">
            <span>{{ t('home.recommendation_filter.rule_count', { count: settings.filterByUser.length }) }}</span>
            <button type="button" class="header-filter-link" @click="openFilterSettings(close, 'settings.filter_by_user')">
              {{ t('home.recommendation_filter.manage') }}
            </button>
          </div>
        </div>
      </div>

      <div class="header-filter-section">
        <Radio
          v-model="settings.disableFilterForFollowedUser"
          class="header-filter-switch"
          :label="t('settings.disable_filters_for_followed_users')"
        />
        <p class="header-filter-caption">
          {{ t('home.recommendation_filter.apply_hint') }}
        </p>
      </div>
    </template>
  </HeaderFilterPopover>
</template>
