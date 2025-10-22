<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

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
const inputValue = ref('')
const isInputMode = ref(false)

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
  return props.modelValue.replace(/-/g, '/')
})

// 同步 modelValue 到 inputValue
watch(() => props.modelValue, (newVal) => {
  if (!isInputMode.value) {
    inputValue.value = newVal ? displayValue.value : ''
  }
}, { immediate: true })

// 解析用户输入的日期
function parseInputDate(input: string): Date | null {
  if (!input)
    return null

  // 移除空格
  const cleaned = input.trim()

  // 尝试匹配 yyyy-MM-DD 格式
  const dashMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (dashMatch) {
    const [, year, month, day] = dashMatch
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  // 尝试匹配 yyyy/MM/DD 格式
  const slashMatch = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (slashMatch) {
    const [, year, month, day] = slashMatch
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  // 尝试匹配 yyyy年MM月DD日 格式
  const chineseMatch = cleaned.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (chineseMatch) {
    const [, year, month, day] = chineseMatch
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  return null
}

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

// 上一年
function prevYear() {
  currentYear.value--
}

// 下一年
function nextYear() {
  currentYear.value++
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
  inputValue.value = ''
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

// 处理输入框点击
function handleInputClick() {
  if (!isInputMode.value) {
    openPicker()
  }
}

// 处理输入框获得焦点
function handleInputFocus() {
  isInputMode.value = true
  showPicker.value = false
}

// 处理输入框失去焦点
function handleInputBlur() {
  isInputMode.value = false
  const date = parseInputDate(inputValue.value)

  if (date && !Number.isNaN(date.getTime())) {
    // 检查日期是否有效且不超过最大日期
    if (!isDateDisabled(date)) {
      emit('update:modelValue', formatDate(date))
    }
    else {
      // 如果日期无效，恢复到原值
      inputValue.value = displayValue.value
    }
  }
  else if (inputValue.value.trim() === '') {
    // 如果输入为空，清除日期
    emit('update:modelValue', '')
  }
  else {
    // 如果输入格式不正确，恢复到原值
    inputValue.value = displayValue.value
  }
}

// 处理输入框的键盘事件
function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    ;(event.target as HTMLInputElement).blur()
  }
  else if (event.key === 'Escape') {
    inputValue.value = displayValue.value
    ;(event.target as HTMLInputElement).blur()
  }
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
    <div class="date-picker-input-wrapper">
      <input
        v-model="inputValue"
        type="text"
        class="date-picker-input"
        :class="{ 'has-value': modelValue }"
        :placeholder="placeholder || '开始日期'"
        @click="handleInputClick"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
        @keydown="handleInputKeydown"
      >
      <button
        type="button"
        class="calendar-icon"
        @click="openPicker"
      >
        <div class="i-tabler:calendar" w-4 h-4 />
      </button>
    </div>

    <!-- 日历弹出框 -->
    <Transition name="picker-fade">
      <div v-if="showPicker" class="date-picker-panel">
        <!-- 头部：年月选择 -->
        <div class="picker-header">
          <div class="year-controls">
            <button type="button" class="header-btn" @click="prevYear">
              <div class="i-tabler:chevron-left" w-4 h-4 />
            </button>
            <span class="year-text">{{ currentYear }}年</span>
            <button type="button" class="header-btn" @click="nextYear">
              <div class="i-tabler:chevron-right" w-4 h-4 />
            </button>
          </div>
          <div class="month-controls">
            <button type="button" class="header-btn" @click="prevMonth">
              <div class="i-tabler:chevron-up" w-5 h-5 />
            </button>
            <div class="month-text">
              {{ monthNames[currentMonth] }}
            </div>
            <button type="button" class="header-btn" @click="nextMonth">
              <div class="i-tabler:chevron-down" w-5 h-5 />
            </button>
          </div>
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

.date-picker-input-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 115px;
}

.date-picker-input {
  flex: 1;
  width: 100%;
  padding: 0.35rem 1.5rem 0.35rem 0.5rem;
  background: var(--bew-fill-1);
  border: 1px solid transparent;
  border-radius: var(--bew-radius-half);
  color: var(--bew-text-3);
  font-size: 0.8125rem;
  letter-spacing: -0.01em;
  transition: all 0.2s ease;
  outline: none;

  &::placeholder {
    color: var(--bew-text-3);
  }

  &.has-value {
    color: var(--bew-text-1);
  }

  &:hover {
    background: var(--bew-fill-2);
  }

  &:focus {
    background: var(--bew-fill-2);
    border-color: var(--bew-theme-color);
  }
}

.calendar-icon {
  position: absolute;
  right: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem;
  background: transparent;
  border: none;
  color: var(--bew-text-3);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: var(--bew-theme-color);
  }

  &:active {
    transform: scale(0.95);
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
  gap: 12px;
  margin-bottom: 12px;
  padding: 0 4px;
}

.year-controls,
.month-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.year-text,
.month-text {
  min-width: 60px;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--bew-text-1);
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
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
