<script lang="ts" setup>
import { ref } from 'vue'

interface UserFilterOption {
  value: string | number
  label: string
}

const props = defineProps<{
  orderOptions: ReadonlyArray<UserFilterOption>
  userTypeOptions: ReadonlyArray<UserFilterOption>
}>()

const emit = defineEmits<{
  'update:order': [value: string]
  'update:userType': [value: number]
}>()

const userOrder = defineModel<string>('order', { default: '' })
const userType = defineModel<number>('userType', { default: 0 })

// 更多筛选的展开状态
const isMoreFiltersExpanded = ref(false)

function handleOrderChange(value: string) {
  userOrder.value = value
  emit('update:order', value)
}

function handleUserTypeSelect(value: number) {
  userType.value = value
  emit('update:userType', value)
}
</script>

<template>
  <div class="filter-bar" mb-4 flex="~ col" gap-3>
    <!-- 排序 + 更多筛选按钮 -->
    <div flex items-center gap-2>
      <span text="sm $bew-text-2" min-w-12>排序</span>
      <div flex items-center gap-2 flex-wrap flex-1>
        <button
          v-for="option in props.orderOptions"
          :key="option.value"
          class="filter-btn"
          :class="{ active: userOrder === option.value }"
          type="button"
          @click="handleOrderChange(option.value as string)"
        >
          {{ option.label }}
        </button>
      </div>
      <button
        class="more-filters-btn"
        flex items-center gap-1
        type="button"
        @click="isMoreFiltersExpanded = !isMoreFiltersExpanded"
      >
        <span text="sm $bew-text-2">更多筛选</span>
        <div class="toggle-icon" :class="{ expanded: isMoreFiltersExpanded }">
          <div class="i-tabler:chevron-down" text="sm $bew-text-3" />
        </div>
      </button>
    </div>

    <!-- 更多筛选内容 -->
    <div v-show="isMoreFiltersExpanded" flex="~ col" gap-3>
      <!-- 用户类型 -->
      <div flex items-center gap-2>
        <span text="sm $bew-text-2" min-w-12>用户类型</span>
        <div flex items-center gap-2 flex-wrap>
          <button
            v-for="option in props.userTypeOptions"
            :key="option.value"
            class="filter-btn"
            :class="{ active: userType === option.value }"
            type="button"
            @click="handleUserTypeSelect(option.value as number)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.filter-btn {
  padding: 0.35rem 0.75rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font-size: var(--bew-base-font-size);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  user-select: none;

  &:hover {
    background: var(--bew-fill-2);
  }

  &.active {
    background: var(--bew-theme-color);
    color: white;
    border-color: var(--bew-theme-color);
  }

  &:active {
    transform: scale(0.98);
  }
}

.more-filters-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.35rem 0.75rem;
  user-select: none;
  white-space: nowrap;
  transition: all 0.2s ease;

  &:hover {
    span {
      color: var(--bew-text-1);
    }
  }
}

.toggle-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;

  &.expanded {
    transform: rotate(180deg);
  }
}
</style>
