<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

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

const PANEL_WIDTH = 320
const VIEWPORT_MARGIN = 8
const PANEL_GAP = 8

const { t } = useI18n()
const { openSettings, refreshCurrentPage } = useBewlyApp()

const rootRef = ref<HTMLElement>()
const triggerRef = ref<HTMLButtonElement>()
const open = ref(false)
const panelStyle = ref<Record<string, string>>({})
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

function placePanel() {
  const root = rootRef.value
  const trigger = triggerRef.value
  if (!root || !trigger)
    return

  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const rootRect = root.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2)
  // 默认与按钮右对齐；窄屏换行后按钮靠左时，向右推回视口内。
  const left = Math.max(VIEWPORT_MARGIN, Math.min(triggerRect.right - width, viewportWidth - VIEWPORT_MARGIN - width))
  const top = rootRect.bottom + PANEL_GAP

  panelStyle.value = {
    width: `${width}px`,
    left: `${left - rootRect.left}px`,
    maxHeight: `${Math.max(160, viewportHeight - top - VIEWPORT_MARGIN)}px`,
  }
}

function show() {
  signatureOnOpen = getFilterSignature()
  placePanel()
  open.value = true
}

function close(options: { restoreFocus?: boolean } = {}) {
  if (!open.value)
    return
  open.value = false
  if (options.restoreFocus)
    triggerRef.value?.focus({ preventScroll: true })
  // 过滤只作用于新请求的推荐，条件变化后按新条件重新加载。
  if (getFilterSignature() !== signatureOnOpen)
    refreshCurrentPage()
}

function toggle() {
  if (open.value)
    close()
  else
    show()
}

function openFilterSettings(targetTitleKey: string) {
  close()
  openSettings({
    menu: 'BewlyPages',
    secondaryPage: 'home',
    targetTitleKey,
  })
}

onClickOutside(rootRef, () => close())
useEventListener(window, 'resize', () => {
  if (open.value)
    placePanel()
})
</script>

<template>
  <div ref="rootRef" class="recommendation-filter-entry" @keydown.esc.stop="close({ restoreFocus: true })">
    <div
      class="glass-panel bew-segment-control bew-segment-control--surface bew-segment-control--static"
      :class="{ 'bew-segment-control--solid': !settings.enableFrostedGlass }"
      flex="~ shrink-0 items-center"
      box-border
    >
      <button
        ref="triggerRef"
        type="button"
        class="bew-segment-control__item bew-segment-control__item--icon"
        :data-active="open ? 'true' : undefined"
        :title="triggerLabel"
        :aria-label="triggerLabel"
        :aria-expanded="open"
        aria-haspopup="dialog"
        @click="toggle"
      >
        <span
          class="bew-segment-control__icon"
          :class="activeCount ? 'i-mingcute:filter-2-fill' : 'i-mingcute:filter-2-line'"
          aria-hidden="true"
        />
      </button>
    </div>

    <Transition name="bew-pop">
      <div
        v-if="open"
        class="filter-panel bew-popover-surface"
        style="backdrop-filter: var(--bew-pop-glass, var(--bew-filter-glass-1));"
        :style="panelStyle"
        role="dialog"
        :aria-label="t('home.recommendation_filter.title')"
      >
        <header class="filter-panel__header">
          <span class="filter-panel__title">{{ t('home.recommendation_filter.title') }}</span>
          <button type="button" class="text-button" @click="openFilterSettings('settings.group_recommendation_filters')">
            {{ t('home.recommendation_filter.more_settings') }}
          </button>
        </header>

        <div class="filter-section">
          <Radio
            v-if="isAppMode"
            v-model="settings.filterOutVerticalVideos"
            class="filter-switch"
            :label="t('home.recommendation_filter.vertical_videos')"
          />
          <div v-for="filter in numericFilters" :key="filter.enabledKey" class="filter-item">
            <Radio v-model="settings[filter.enabledKey]" class="filter-switch" :label="t(filter.titleKey)" />
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

        <div class="filter-section">
          <div class="filter-item">
            <Radio v-model="settings.enableFilterByTitle" class="filter-switch" :label="t('settings.filter_by_title')" />
            <div class="filter-caption">
              <span>{{ t('home.recommendation_filter.rule_count', { count: settings.filterByTitle.length }) }}</span>
              <button type="button" class="text-button" @click="openFilterSettings('settings.filter_by_title')">
                {{ t('home.recommendation_filter.manage') }}
              </button>
            </div>
          </div>
          <div class="filter-item">
            <Radio v-model="settings.enableFilterByUser" class="filter-switch" :label="t('settings.filter_by_user')" />
            <div class="filter-caption">
              <span>{{ t('home.recommendation_filter.rule_count', { count: settings.filterByUser.length }) }}</span>
              <button type="button" class="text-button" @click="openFilterSettings('settings.filter_by_user')">
                {{ t('home.recommendation_filter.manage') }}
              </button>
            </div>
          </div>
        </div>

        <div class="filter-section">
          <Radio
            v-model="settings.disableFilterForFollowedUser"
            class="filter-switch"
            :label="t('settings.disable_filters_for_followed_users')"
          />
          <p class="filter-caption">
            {{ t('home.recommendation_filter.apply_hint') }}
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.recommendation-filter-entry {
  position: relative;
  flex-shrink: 0;
}

.filter-panel {
  position: absolute;
  top: calc(100% + var(--bew-space-2));
  z-index: 10;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--bew-space-4);
  transform-origin: top right;
}

.filter-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-3);
}

.filter-panel__title {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);

  & + & {
    margin-top: var(--bew-space-3);
    padding-top: var(--bew-space-3);
    border-top: 1px solid var(--bew-border-color);
  }
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.filter-switch {
  justify-content: space-between;
  width: 100%;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.filter-caption {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--bew-theme-color);
  font: inherit;
  font-size: var(--bew-font-size-caption);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}
</style>
