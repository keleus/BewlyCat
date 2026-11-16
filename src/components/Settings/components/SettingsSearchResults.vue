<script setup lang="ts">
import type { SearchResultSection } from '../composables/useSettingsSearchResults'
import SettingsSectionHeading from './SettingsSectionHeading.vue'

defineProps<{
  sections: SearchResultSection[]
  summary: string
}>()
</script>

<template>
  <SettingsSectionHeading
    :title="$t('settings.search.results_title')"
    :desc="sections.length ? summary : undefined"
    icon="i-mingcute:search-2-fill"
  />
  <div v-if="sections.length" class="settings-search-results">
    <section
      v-for="section in sections"
      :key="section.key"
      class="settings-search-result-section"
    >
      <header class="settings-search-result-source">
        <span class="settings-search-result-source__menu">{{ $t(section.menuTitleKey) }}</span>
        <template v-if="section.page">
          <i i-mingcute:right-line />
          <strong class="settings-search-result-source__page">{{ $t(section.page.titleKey) }}</strong>
        </template>
      </header>
      <Component :is="section.component" />
    </section>
  </div>
  <div v-else class="settings-search-empty">
    <div class="settings-search-empty__icon" i-mingcute:search-2-line />
    <p class="settings-search-empty__title">
      {{ $t('settings.search.no_results') }}
    </p>
  </div>
  <span
    id="settings-search-status"
    class="settings-search-status"
    role="status"
    aria-live="polite"
  >{{ summary }}</span>
</template>

<style lang="scss" scoped>
.settings-search-status {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip: rect(0 0 0 0);
}

.settings-search-results {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-6);
}

// 结果页已经按来源页分组，隐藏各页面组件自带的标题，避免重复。
.settings-search-results :deep(.settings-section-heading) {
  display: none;
}

.settings-search-result-section {
  min-width: 0;
}

// 条件设置可能全部隐藏；没有任何可见命中项的分组不显示来源标题。
.settings-search-result-section:not(:has(.settings-search-match)) {
  display: none;
}

.settings-search-result-section + .settings-search-result-section {
  padding-top: var(--bew-space-6);
  border-top: 1px solid var(--bew-border-color);
}

.settings-search-result-source {
  display: flex;
  gap: var(--bew-space-1);
  align-items: center;
  margin-bottom: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.settings-search-result-source__menu {
  color: var(--bew-text-2);
}

.settings-search-result-source__page {
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-semibold);
}

.settings-search-result-source > i {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.settings-search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-12) var(--bew-space-4);
  color: var(--bew-text-2);
  text-align: center;
}

.settings-search-empty__icon {
  color: var(--bew-text-3);
  font-size: var(--bew-icon-size-xl);
}

.settings-search-empty__title {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-heading);
}

:deep(.settings-search-target) {
  position: relative;
  z-index: 2;
  isolation: isolate;
  border-radius: var(--bew-panel-radius);
}

:deep(.settings-search-target > *) {
  position: relative;
  z-index: 1;
}

:deep(.settings-search-target::before) {
  position: absolute;
  inset: 0 -12px;
  z-index: 0;
  background: var(--bew-theme-color);
  border-radius: var(--bew-panel-radius);
  content: "";
  opacity: 0;
  pointer-events: none;
  animation: settings-search-target-flash 2.4s ease-in-out;
}

:deep(.settings-search-target::after) {
  position: absolute;
  top: -13px;
  right: 12px;
  z-index: 3;
  padding: var(--bew-space-1) var(--bew-space-2);
  color: white;
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  box-shadow: var(--bew-shadow-2);
  content: attr(data-settings-search-highlight);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  pointer-events: none;
  white-space: nowrap;
  animation: settings-search-target-label 2.4s ease-out;
}

@keyframes settings-search-target-flash {
  0%,
  100% {
    opacity: 0;
  }

  18%,
  48%,
  78% {
    opacity: 0.18;
  }

  33%,
  63% {
    opacity: 0;
  }
}

@keyframes settings-search-target-label {
  0% {
    opacity: 0;
    transform: translateY(5px);
  }

  14%,
  72% {
    opacity: 1;
    transform: translateY(0);
  }

  100% {
    opacity: 0;
    transform: translateY(-5px);
  }
}
</style>
