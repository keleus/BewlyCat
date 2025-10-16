<script setup lang="ts">
import type { SearchCategory, SearchCategoryOption } from '../types'

const props = defineProps<{
  categories: ReadonlyArray<SearchCategoryOption>
  currentCategory: SearchCategory
  categoryCounts: Record<SearchCategory, number>
}>()

const emit = defineEmits<{
  (event: 'select', category: SearchCategory): void
}>()

function handleSelect(category: SearchCategory) {
  emit('select', category)
}

function formatCount(count: number): string {
  if (!count)
    return ''
  if (count > 99)
    return '99+'
  if (count >= 10000)
    return `${(count / 10000).toFixed(1)}万`
  return `${count}`
}
</script>

<template>
  <div class="search-categories" mb-4>
    <div flex items-center gap-2 flex-wrap>
      <button
        v-for="category in props.categories"
        :key="category.value"
        class="category-tab"
        :class="{ active: props.currentCategory === category.value }"
        flex
        items-center gap-1 px-3 py-1.5 rounded="$bew-radius-half"
        transition-all
        duration-200 hover:bg="$bew-fill-1"
        type="button"
        @click="handleSelect(category.value)"
      >
        <div :class="category.icon" text-sm />
        <span text-sm>{{ category.label }}</span>
        <span
          v-if="category.value !== 'all' && props.categoryCounts[category.value] > 0"
          text="xs $bew-text-3"
          ml-1
        >
          ({{ formatCount(props.categoryCounts[category.value]) }})
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.category-tab {
  &.active {
    --uno: "bg-$bew-theme-color-20 text-$bew-theme-color";
  }
}
</style>
