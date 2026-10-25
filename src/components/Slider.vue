<script lang="ts" setup>
interface Props {
  min?: number
  max?: number
  label: string
  /** 开启后数值部分变为可输入的数字框，label 作为数值单位显示 */
  editable?: boolean
  /** 滑块与数字框的无障碍名称 */
  ariaLabel?: string
}
const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  editable: false,
})

const modelValue = defineModel<number>({ required: true })
const rangeRef = ref<HTMLInputElement | null>(null)

// 原生 input 的 v-model 写入的是字符串，存储层的 Number.isFinite 校验
// 会把它当非法值重置回默认（毛玻璃强度即因此失效）。这里统一转成数字。
function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(value))
    modelValue.value = value
}

// 手动输入只在回车/失焦时提交：逐键写入会被存储层的归一化钳制打断
// （例如输入途中被拉回最小值），无法正常键入。
function commitEditedValue(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.valueAsNumber
  const next = Number.isFinite(value)
    ? Math.min(props.max, Math.max(props.min, Math.round(value)))
    : modelValue.value

  if (Number.isFinite(value))
    modelValue.value = next
  // 即使数值未变化也要同步显示，清掉前导零、越界值等临时输入。
  input.value = String(next)
}

function updateBackground() {
  const range = rangeRef.value
  if (!range)
    return

  const span = props.max - props.min
  const progress = span === 0 ? 0 : ((modelValue.value - props.min) / span) * 100
  range.style.setProperty('--b-slider-progress', `${progress}%`)
}

watch([modelValue, () => props.min, () => props.max], updateBackground, { flush: 'post' })
onMounted(updateBackground)
</script>

<template>
  <component
    :is="editable ? 'div' : 'label'"
    class="b-slider"
    :class="{ 'cursor-pointer': !editable }"
    flex items-center gap-3 w="$b-slider-width"
  >
    <input
      ref="rangeRef"
      type="range" :value="modelValue" :min="min" :max="max" class="slider"
      appearance-none outline-none w="$b-slider-width" h="$b-slider-height"
      :aria-label="ariaLabel"
      @input="handleInput"
    >
    <span v-if="editable" class="slider-editor">
      <input
        type="number"
        class="slider-input"
        :value="modelValue"
        :min="min"
        :max="max"
        :aria-label="ariaLabel"
        @change="commitEditedValue"
        @keydown.enter.prevent="commitEditedValue"
      >
      <span class="slider-unit">{{ label }}</span>
    </span>
    <span v-else class="slider-label">{{ label }}</span>
  </component>
</template>

<style lang="scss" scoped>
.b-slider {
  --b-border-width: 2px;
  --b-slider-height: 10px;
  --b-slider-width: 100%;
  --b-slider-label-width: 3em;
  --b-thumb-width: calc(20px - var(--b-border-width));
  --b-thumb-height: calc(20px - var(--b-border-width));
}

.slider-label {
  flex: none;
  min-width: var(--b-slider-label-width);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.slider-editor {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
}

.slider-input {
  width: 4.5em;
  height: 28px;
  padding: 0 var(--bew-space-2);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  font-variant-numeric: tabular-nums;
  text-align: right;
  background: var(--bew-fill-1);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  outline: none;
  appearance: textfield;
  cursor: text;

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }

  &:focus {
    outline: 2px solid var(--bew-theme-color);
    outline-offset: var(--bew-space-0-5);
  }
}

.slider-unit {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

input[type="range"] {
  background: transparent;
  border: 0;

  &::-webkit-slider-runnable-track {
    height: var(--b-slider-height);
    background: linear-gradient(
        to right,
        var(--bew-theme-color) var(--b-slider-progress, 0%),
        var(--bew-fill-1) var(--b-slider-progress, 0%)
      )
      no-repeat;
    border-radius: var(--b-slider-height);
    box-shadow: inset 0 0 0 var(--b-border-width) var(--bew-border-color);
  }

  &::-webkit-slider-thumb {
    --uno: "appearance-none w-$b-thumb-height h-$b-thumb-height bg-white rounded-$b-thumb-height";
    --uno: "ring-$bew-border-color ring-2 cursor-pointer duration-300";
    margin-top: calc((var(--b-slider-height) - var(--b-thumb-height)) / 2);
  }

  &::-webkit-slider-thumb:hover {
    --uno: "ring-$bew-theme-color";
  }

  &::-moz-range-track {
    height: var(--b-slider-height);
    background: linear-gradient(
        to right,
        var(--bew-theme-color) var(--b-slider-progress, 0%),
        var(--bew-fill-1) var(--b-slider-progress, 0%)
      )
      no-repeat;
    border-radius: var(--b-slider-height);
    box-shadow: inset 0 0 0 var(--b-border-width) var(--bew-border-color);
  }

  &::-moz-range-progress {
    height: var(--b-slider-height);
    background: var(--bew-theme-color);
    border-radius: var(--b-slider-height);
  }

  &::-moz-range-thumb {
    --uno: "appearance-none w-$b-thumb-height h-$b-thumb-height bg-white rounded-$b-thumb-height";
    --uno: "ring-$bew-border-color ring-2 cursor-pointer duration-300";
  }

  &::-moz-range-thumb:hover {
    --uno: "ring-$bew-theme-color";
  }
}
</style>
