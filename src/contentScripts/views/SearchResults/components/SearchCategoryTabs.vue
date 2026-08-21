<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'

import type { SearchCategory, SearchCategoryOption } from '../types'

const props = defineProps<{
  categories: ReadonlyArray<SearchCategoryOption>
  currentCategory: SearchCategory
  categoryCounts: Record<SearchCategory, number>
}>()

const emit = defineEmits<{
  (event: 'select', category: SearchCategory): void
}>()

const { locale } = useI18n()

function handleSelect(category: SearchCategory) {
  emit('select', category)
}

function formatCount(count: number): string {
  if (!count)
    return ''
  if (count > 99)
    return '99+'
  if (count >= 10000)
    return new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }).format(count)
  return `${count}`
}
</script>

<template>
  <div class="search-categories" mb-4>
    <div
      class="search-category-control bew-segment-control bew-segment-control--surface bew-segment-control--static"
      :class="{ 'bew-segment-control--solid': !settings.enableFrostedGlass }"
      data-layout-edit-target="search-category-tabs"
      data-layout-settings-menu="BewlyPages"
      data-layout-settings-page="search"
      data-layout-settings-title-key="settings.group_search_results"
    >
      <button
        v-for="category in props.categories"
        :key="category.value"
        class="category-tab bew-segment-control__item bew-segment-control__item--wide"
        :class="{ active: props.currentCategory === category.value }"
        :data-active="props.currentCategory === category.value ? 'true' : undefined"
        type="button"
        @click="handleSelect(category.value)"
      >
        <div :class="category.icon" class="bew-segment-control__icon" />
        <span>{{ category.label }}</span>
        <span
          v-if="category.value !== 'all' && props.categoryCounts[category.value] > 0"
          class="category-tab__count"
        >
          ({{ formatCount(props.categoryCounts[category.value]) }})
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.search-category-control {
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.search-category-control::-webkit-scrollbar {
  display: none;
}

.category-tab__count {
  margin-left: var(--bew-space-1);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
