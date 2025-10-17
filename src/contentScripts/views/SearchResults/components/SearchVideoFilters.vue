<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import Select from '~/components/Select.vue'

import DatePicker from './DatePicker.vue'

const props = defineProps<{
  orderOptions: ReadonlyArray<{ value: string, label: string }>
  durationOptions: ReadonlyArray<{ value: number, label: string }>
  timeRangeOptions: ReadonlyArray<{ value: string, label: string }>
}>()

const videoOrder = defineModel<string>('videoOrder', { default: '' })
const duration = defineModel<number>('duration', { default: 0 })
const timeRange = defineModel<string>('timeRange', { default: 'all' })
const customStartDate = defineModel<string>('customStartDate', { default: '' })
const customEndDate = defineModel<string>('customEndDate', { default: '' })

const customStartInput = ref('')
const customEndInput = ref('')

// 监听父组件的日期变化，同步到本地输入
watch([customStartDate, customEndDate], ([start, end]) => {
  if (customStartInput.value !== start)
    customStartInput.value = start || ''
  if (customEndInput.value !== end)
    customEndInput.value = end || ''
}, { immediate: true })

// 监听自定义日期输入，只有两个日期都选择后才触发筛选
watch([customStartInput, customEndInput], ([start, end]) => {
  // 两个日期都选择后才触发
  if (start && end) {
    timeRange.value = 'custom'
    customStartDate.value = start
    customEndDate.value = end
  }
  // 如果清空了所有日期
  else if (!start && !end && timeRange.value === 'custom') {
    timeRange.value = 'all'
    customStartDate.value = ''
    customEndDate.value = ''
  }
})

function handleTimeRangeSelect(value: string) {
  // 选择预设选项时，切换模式并清空自定义日期
  timeRange.value = value
  customStartInput.value = ''
  customEndInput.value = ''
  customStartDate.value = ''
  customEndDate.value = ''
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取今天的日期，用于限制日期选择器的最大日期
const maxDate = computed(() => formatDate(new Date()))
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
          v-model="videoOrder"
          :options="props.orderOptions"
        />
      </div>
    </div>

    <!-- 时长 -->
    <div flex items-center gap-2>
      <span text="sm $bew-text-2">时长</span>
      <div min-w-120px>
        <Select
          v-model="duration"
          :options="props.durationOptions"
        />
      </div>
    </div>

    <!-- 日期 -->
    <div flex items-center gap-2>
      <span text="sm $bew-text-2">日期</span>
      <div flex items-center gap-2>
        <button
          v-for="option in props.timeRangeOptions"
          :key="option.value"
          class="time-range-btn"
          :class="{ active: timeRange === option.value }"
          type="button"
          @click="handleTimeRangeSelect(option.value)"
        >
          {{ option.label }}
        </button>
        <DatePicker
          v-model="customStartInput"
          :max="maxDate"
          placeholder="开始日期"
        />
        <span text="sm $bew-text-3">至</span>
        <DatePicker
          v-model="customEndInput"
          :max="maxDate"
          placeholder="结束日期"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.time-range-btn {
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
