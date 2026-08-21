<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export type LiveSubCategory = 'all' | 'live_room' | 'live_user'

interface LiveSubCategoryOption {
  value: LiveSubCategory
  label: string
}

const props = defineProps<{
  subCategory: LiveSubCategory
}>()

const emit = defineEmits<{
  'update:subCategory': [value: LiveSubCategory]
}>()

const { t } = useI18n()
const subCategories = computed<LiveSubCategoryOption[]>(() => [
  { value: 'all', label: t('search.all') },
  { value: 'live_room', label: t('search.live_rooms') },
  { value: 'live_user', label: t('search.streamers') },
])

function handleSubCategoryChange(value: LiveSubCategory) {
  emit('update:subCategory', value)
}
</script>

<template>
  <div class="search-live-filters" mb-4>
    <!-- 子分类切换 -->
    <div flex items-center gap-2 flex-wrap>
      <button
        v-for="category in subCategories"
        :key="category.value"
        class="sub-category-tab"
        :class="{ active: props.subCategory === category.value }"
        px-4 py-2 rounded="$bew-radius-half"
        transition-colors duration-200
        hover:bg="$bew-fill-1"
        type="button"
        @click="handleSubCategoryChange(category.value)"
      >
        <span text-sm font-medium>{{ category.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sub-category-tab {
  &.active {
    --uno: "bg-$bew-theme-color-20 text-$bew-theme-color";
  }
}
</style>
