<script lang="ts" setup>
import Input from '~/components/Input.vue'

interface Props {
  min?: number
  max?: number
  step?: number
  /** 只读模式下滑块右侧的数值文字 */
  label?: string
  /**
   * 输入模式：数值区改为可输入的数字框，与滑块双向同步。
   * 适合范围大、步长细、拖动难以精确定位的设置，按需开启。
   */
  editable?: boolean
  /** 输入模式下数字框后的单位 */
  unit?: string
  /** 滑块与数字框的无障碍名称 */
  ariaLabel?: string
}
const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
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

function countDecimals(value: number) {
  const text = String(value)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

// 对齐到 min 起算的步长并钳制到范围内；toFixed 消除 0.1 + 0.2 一类的浮点误差。
function normalizeValue(value: number) {
  const precision = Math.max(countDecimals(props.step), countDecimals(props.min))
  const stepped = props.min + Math.round((value - props.min) / props.step) * props.step
  return Number(Math.min(props.max, Math.max(props.min, stepped)).toFixed(precision))
}

// Input 的 number 类型 v-model 可能写入数字，也可能在无法解析时写入空串。
const draft = ref<string | number>(String(modelValue.value))

function parseDraft() {
  return typeof draft.value === 'number' ? draft.value : Number.parseFloat(draft.value)
}

// 输入途中只同步范围内且对齐步长的值：越界中间值若写入设置，会被存储层钳制后
// 改写输入框，导致无法继续键入（例如从 480 输入 560 时先输入的 5）。
watch(draft, () => {
  const value = parseDraft()
  if (Number.isFinite(value) && value >= props.min && value <= props.max && normalizeValue(value) === value && value !== modelValue.value)
    modelValue.value = value
})

// 拖动滑块等外部变化同步回数字框；数值相同时保留用户正在键入的文字（如 "0.5" 前的 "0."）。
watch(modelValue, (value) => {
  if (parseDraft() !== value)
    draft.value = String(value)
})

// 回车/失焦时最终提交：对齐步长、钳制范围；非法输入恢复当前值。
// 回写字符串而非数字，确保前导零、越界值等临时输入在显示上被清掉。
function commitDraft() {
  const value = parseDraft()
  const next = Number.isFinite(value) ? normalizeValue(value) : modelValue.value
  modelValue.value = next
  draft.value = String(next)
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
      type="range" :value="modelValue" :min="min" :max="max" :step="step"
      class="slider"
      appearance-none outline-none w="$b-slider-width" h="$b-slider-height"
      :aria-label="ariaLabel"
      @input="handleInput"
    >
    <Input
      v-if="editable"
      v-model="draft"
      class="slider-input"
      size="small"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="ariaLabel"
      @enter="commitDraft"
      @blur="commitDraft"
    >
      <template v-if="unit" #suffix>
        <span class="slider-unit">{{ unit }}</span>
      </template>
    </Input>
    <span v-else class="slider-label">{{ label }}</span>
  </component>
</template>

<style lang="scss" scoped>
.b-slider {
  --b-border-width: 2px;
  --b-slider-height: 10px;
  --b-slider-width: 100%;
  --b-slider-label-width: 3em;
  // 同组混用只读与输入模式时，可把 label 宽度设为此值让轨道两端对齐。
  --b-slider-input-width: 6em;
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

// 输入模式复用共享 Input（small），只补宽度与数字排版。
.slider-input {
  flex: none;
  width: var(--b-slider-input-width);

  // 隐藏原生步进按钮，给数值留出宽度；键盘 ↑/↓ 仍按 step 调整。
  :deep(input) {
    min-width: 0;
    font-variant-numeric: tabular-nums;
    text-align: right;
    appearance: textfield;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }
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
