<script lang="ts" setup>
interface Props {
  min?: number
  max?: number
  label: string
}
const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
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
  <label cursor-pointer flex items-center gap-3 w="$b-slider-width">
    <input
      ref="rangeRef"
      type="range" :value="modelValue" :min="min" :max="max" class="slider"
      appearance-none outline-none w="$b-slider-width" h="$b-slider-height"
      @input="handleInput"
    >
    <span class="slider-label">{{ label }}</span>
  </label>
</template>

<style lang="scss" scoped>
label {
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
