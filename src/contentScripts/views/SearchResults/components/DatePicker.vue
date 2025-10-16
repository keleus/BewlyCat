<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { computed, ref } from 'vue'

const props = defineProps<{
  modelValue?: string
  max?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showPicker = ref(false)
const pickerRef = ref<HTMLElement>()

// 当前显示的年月
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())

// 解析 max 日期
const maxDate = computed(() => {
  if (!props.max)
    return null
  const date = new Date(props.max)
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  }
})

// 格式化显示的日期
const displayValue = computed(() => {
  if (!props.modelValue)
    return props.placeholder || '开始日期'
  return props.modelValue.replace(/-/g, ' / ')
})

// 生成日历数据
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value

  // 当月第一天
  const firstDay = new Date(year, month, 1)
  const firstDayWeek = firstDay.getDay()

  // 当月天数
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // 上个月的天数
  const prevMonthDays = new Date(year, month, 0).getDate()

  const days: Array<{
    day: number
    month: 'prev' | 'current' | 'next'
    date: Date
    disabled: boolean
    isToday: boolean
    isSelected: boolean
  }> = []

  // 填充上个月的日期
  for (let i = firstDayWeek - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    const date = new Date(year, month - 1, day)
    days.push({
      day,
      month: 'prev',
      date,
      disabled: isDateDisabled(date),
      isToday: false,
      isSelected: false,
    })
  }

  // 填充当月的日期
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    const isToday = isSameDay(date, new Date())
    const isSelected = props.modelValue ? isSameDay(date, new Date(props.modelValue)) : false

    days.push({
      day,
      month: 'current',
      date,
      disabled: isDateDisabled(date),
      isToday,
      isSelected,
    })
  }

  // 填充下个月的日期，补齐到 42 个（6 行 x 7 列）
  const remainingDays = 42 - days.length
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(year, month + 1, day)
    days.push({
      day,
      month: 'next',
      date,
      disabled: isDateDisabled(date),
      isToday: false,
      isSelected: false,
    })
  }

  return days
})

// 检查日期是否被禁用
function isDateDisabled(date: Date): boolean {
  if (!maxDate.value)
    return false

  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const max = new Date(maxDate.value.year, maxDate.value.month, maxDate.value.day)

  return checkDate > max
}

// 检查是否是同一天
function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear()
    && date1.getMonth() === date2.getMonth()
    && date1.getDate() === date2.getDate()
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 选择日期
function selectDate(day: typeof calendarDays.value[0]) {
  if (day.disabled)
    return

  const date = day.date
  emit('update:modelValue', formatDate(date))
  showPicker.value = false
}

// 上个月
function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  }
  else {
    currentMonth.value--
  }
}

// 下个月
function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  }
  else {
    currentMonth.value++
  }
}

// 今天
function selectToday() {
  const today = new Date()
  if (!isDateDisabled(today)) {
    emit('update:modelValue', formatDate(today))
    showPicker.value = false
  }
}

// 清除
function clearDate() {
  emit('update:modelValue', '')
  showPicker.value = false
}

// 打开选择器时，初始化到当前选中的日期或今天
function openPicker() {
  if (props.modelValue) {
    const date = new Date(props.modelValue)
    currentYear.value = date.getFullYear()
    currentMonth.value = date.getMonth()
  }
  else {
    const today = new Date()
    currentYear.value = today.getFullYear()
    currentMonth.value = today.getMonth()
  }
  showPicker.value = true
}

// 点击外部关闭
onClickOutside(pickerRef, () => {
  showPicker.value = false
})

// 月份名称
const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const weekDays = ['日', '一', '二', '三', '四', '五', '六']
</script>

<template>
  <div ref="pickerRef" class="date-picker" pos="relative">
    <!-- 输入框显示 -->
    <button
      type="button"
      class="date-picker-input"
      :class="{ 'has-value': modelValue }"
      @click="openPicker"
    >
      <span>{{ displayValue }}</span>
      <div class="i-tabler:calendar" w-4 h-4 />
    </button>

    <!-- 日历弹出框 -->
    <Transition name="picker-fade">
      <div v-if="showPicker" class="date-picker-panel">
        <!-- 头部：年月选择 -->
        <div class="picker-header">
          <button type="button" class="header-btn" @click="prevMonth">
            <div class="i-tabler:chevron-up" w-5 h-5 />
          </button>
          <div class="header-title">
            {{ currentYear }}年{{ monthNames[currentMonth] }}
          </div>
          <button type="button" class="header-btn" @click="nextMonth">
            <div class="i-tabler:chevron-down" w-5 h-5 />
          </button>
        </div>

        <!-- 星期标题 -->
        <div class="picker-weekdays">
          <div v-for="day in weekDays" :key="day" class="weekday">
            {{ day }}
          </div>
        </div>

        <!-- 日期网格 -->
        <div class="picker-days">
          <button
            v-for="(day, index) in calendarDays"
            :key="index"
            type="button"
            class="day-cell"
            :class="{
              'other-month': day.month !== 'current',
              'disabled': day.disabled,
              'today': day.isToday,
              'selected': day.isSelected,
            }"
            @click="selectDate(day)"
          >
            {{ day.day }}
          </button>
        </div>

        <!-- 底部按钮 -->
        <div class="picker-footer">
          <button type="button" class="footer-btn clear" @click="clearDate">
            清除
          </button>
          <button type="button" class="footer-btn today" @click="selectToday">
            今天
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.date-picker {
  display: inline-block;
}

.date-picker-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 140px;
  padding: 0.35rem 0.5rem 0.35rem 0.75rem;
  background: var(--bew-fill-1);
  border: 1px solid transparent;
  border-radius: var(--bew-radius-half);
  color: var(--bew-text-3);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  user-select: none;

  &.has-value {
    color: var(--bew-text-1);
  }

  &:hover {
    background: var(--bew-fill-2);
  }

  &:active {
    transform: scale(0.98);
  }

  span {
    flex: 1;
    text-align: left;
  }
}

.date-picker-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 1000;
  width: 280px;
  padding: 12px;
  background: var(--bew-elevated);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-3);
  backdrop-filter: var(--bew-filter-glass-1);
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 4px;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: var(--bew-radius-half);
  color: var(--bew-text-2);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--bew-fill-1);
    color: var(--bew-text-1);
  }

  &:active {
    transform: scale(0.95);
  }
}

.header-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--bew-text-1);
}

.picker-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 4px;
}

.weekday {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  font-size: 0.75rem;
  color: var(--bew-text-3);
  font-weight: 500;
}

.picker-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}

.day-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--bew-radius-half);
  color: var(--bew-text-1);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(.disabled) {
    background: var(--bew-fill-1);
  }

  &.other-month {
    color: var(--bew-text-4);
  }

  &.disabled {
    color: var(--bew-text-4);
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.today {
    color: var(--bew-theme-color);
    font-weight: 600;
  }

  &.selected {
    background: var(--bew-theme-color);
    color: white;
    font-weight: 600;

    &:hover {
      background: var(--bew-theme-color);
    }
  }

  &:active:not(.disabled) {
    transform: scale(0.95);
  }
}

.picker-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid var(--bew-border-color);
}

.footer-btn {
  padding: 4px 12px;
  background: transparent;
  border: none;
  border-radius: var(--bew-radius-half);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &.clear {
    color: var(--bew-text-2);

    &:hover {
      background: var(--bew-fill-1);
      color: var(--bew-text-1);
    }
  }

  &.today {
    color: var(--bew-theme-color);

    &:hover {
      background: var(--bew-theme-color-10);
    }
  }

  &:active {
    transform: scale(0.95);
  }
}

// 过渡动画
.picker-fade-enter-active,
.picker-fade-leave-active {
  transition: all 0.2s ease;
}

.picker-fade-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.picker-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
