<script lang="ts" setup>
import Select from '~/components/Select.vue'

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
  <div
    class="filter-bar" mb-4 flex items-center gap-4
    flex-wrap
  >
    <!-- 排序 -->
    <div flex items-center gap-2>
      <span text="sm $bew-text-2">排序</span>
      <div min-w-120px>
        <Select
          v-model="userOrder"
          :options="props.orderOptions"
          @change="handleOrderChange"
        />
      </div>
    </div>

    <!-- 用户类型 -->
    <div flex items-center gap-2>
      <span text="sm $bew-text-2">用户类型</span>
      <div flex items-center gap-2>
        <button
          v-for="option in props.userTypeOptions"
          :key="option.value"
          class="user-type-btn"
          :class="{ active: userType === option.value }"
          @click="handleUserTypeSelect(option.value as number)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.user-type-btn {
  padding: 0.35rem 0.75rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font-size: 0.875rem;
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
</style>
