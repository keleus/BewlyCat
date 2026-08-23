<script setup lang="ts">
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsSectionHeading from './SettingsSectionHeading.vue'

export interface CategoryPage {
  value: string
  titleKey: string
  descriptionKey?: string
  icon: string
  iconActivated: string
  component: Component
  groupKey?: string
  warning?: boolean
  badgeKey?: string
}

const props = defineProps<{
  pages: CategoryPage[]
  storageKey: string
}>()

const { t } = useI18n()
const setBreadcrumb = inject<(detail?: string) => void>('setSettingsBreadcrumb')
const scrollSettingsContentToTop = inject<() => void>('scrollSettingsContentToTop')
const savedPage = sessionStorage.getItem(props.storageKey)
const activePage = ref(
  props.pages.some(page => page.value === savedPage)
    ? savedPage!
    : props.pages[0]?.value ?? '',
)

const currentPage = computed(() =>
  props.pages.find(page => page.value === activePage.value) ?? props.pages[0],
)

const pageGroups = computed(() => {
  const groups: Array<{ key: string | null, pages: CategoryPage[] }> = []

  for (const page of props.pages) {
    const groupKey = page.groupKey ?? null
    const lastGroup = groups[groups.length - 1]
    if (!lastGroup || lastGroup.key !== groupKey) {
      groups.push({ key: groupKey, pages: [page] })
      continue
    }
    lastGroup.pages.push(page)
  }

  return groups
})

watch(activePage, page => sessionStorage.setItem(props.storageKey, page))
watchEffect(() => setBreadcrumb?.(currentPage.value ? t(currentPage.value.titleKey) : undefined))

function selectPage(page: string) {
  if (page === activePage.value)
    return

  scrollSettingsContentToTop?.()
  activePage.value = page
}

function handlePageMouseDown(event: MouseEvent) {
  // Keep keyboard focus, but prevent the browser from scrolling the focused
  // secondary-nav item into view (can nudge the settings panel upward).
  if (event.button !== 0)
    return

  event.preventDefault()
  if (event.currentTarget instanceof HTMLElement)
    event.currentTarget.focus({ preventScroll: true })
}
</script>

<template>
  <div class="settings-category-layout">
    <nav class="settings-category-nav" :aria-label="$t('settings.category_navigation')">
      <div
        v-for="(group, groupIndex) in pageGroups"
        :key="group.key ?? `ungrouped-${groupIndex}`"
        class="settings-category-group"
        :class="{ 'has-label': !!group.key }"
      >
        <div v-if="group.key" class="settings-category-group-label">
          {{ $t(group.key) }}
        </div>
        <button
          v-for="page in group.pages"
          :key="page.value"
          type="button"
          class="settings-category-button"
          :class="{ active: activePage === page.value }"
          @mousedown="handlePageMouseDown"
          @click="selectPage(page.value)"
        >
          <span
            class="settings-category-icon"
            :class="activePage === page.value ? page.iconActivated : page.icon"
          />
          <span>{{ $t(page.titleKey) }}</span>
        </button>
      </div>
    </nav>

    <section v-if="currentPage" class="settings-category-content">
      <SettingsSectionHeading
        :title="$t(currentPage.titleKey)"
        :desc="currentPage.descriptionKey ? $t(currentPage.descriptionKey) : undefined"
        :icon="currentPage.iconActivated"
        :warning="currentPage.warning"
        :badge="currentPage.badgeKey ? $t(currentPage.badgeKey) : undefined"
      />
      <Component :is="currentPage.component" :key="currentPage.value" />
    </section>
  </div>
</template>

<style lang="scss" scoped>
.settings-category-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: var(--bew-space-6);
  margin-left: calc(var(--bew-space-8) * -1);
  overflow-anchor: none;
}

.settings-category-nav {
  position: sticky;
  // The scroll viewport already reserves the 80px header with padding. A zero
  // inset keeps the sticky position aligned with the nav's natural position.
  top: 0;
  display: flex;
  flex-direction: column;
  align-self: start;
  gap: var(--bew-space-2);
  overflow-anchor: none;
}

.settings-category-group {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.settings-category-group-label {
  padding: 0 var(--bew-space-3) var(--bew-space-0-5);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  letter-spacing: 0.02em;
  line-height: 1.4;
}

.settings-category-button {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-text-1);
  text-align: left;
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-body);
  overflow-anchor: none;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover:not(.active) {
    background: var(--bew-fill-2);
  }

  &.active {
    color: var(--bew-text-auto);
    background: var(--bew-theme-color-auto);
  }

  > span:last-child {
    min-width: 0;
    line-height: 1.3;
  }
}

.settings-category-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  font-size: var(--bew-icon-size-md);
}

.settings-category-content {
  min-width: 0;
}

@media (max-width: 760px) {
  .settings-category-layout {
    display: block;
    margin-left: 0;
  }

  .settings-category-nav {
    position: static;
    display: grid;
    grid-template-columns: 1fr;
    margin-bottom: 20px;
  }

  .settings-category-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  .settings-category-group-label {
    grid-column: 1 / -1;
    padding: 4px 6px 2px;
  }
}
</style>
