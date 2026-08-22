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
function onInput(event: Event) {
  modelValue.value = Number((event.currentTarget as HTMLInputElement).value)
}

function updateBackground() {
  const range = rangeRef.value
  if (!range)
    return

  const span = props.max - props.min
  const progress = span === 0 ? 0 : ((modelValue.value - props.min) / span) * 100
  range.style.background = `linear-gradient(to right, var(--bew-theme-color) ${progress}%, var(--bew-fill-1) ${progress}%) no-repeat`
}

watch([modelValue, () => props.min, () => props.max], updateBackground, { flush: 'post' })
onMounted(updateBackground)
</script>

<template>
  <label cursor-pointer flex items-center gap-3 w="$b-slider-width">
    <input
      ref="rangeRef"
      :value="modelValue" type="range" :min="min" :max="max" class="slider"
      appearance-none outline-none bg="$bew-fill-1" rounded="$b-slider-height"
      border="size-$b-border-width color-$bew-border-color" w="$b-slider-width" h="$b-slider-height"
      @input="onInput"
    >
    <span>{{ label }}</span>
  </label>
</template>

<style lang="scss" scoped>
label {
  --b-border-width: 2px;
  --b-slider-height: 10px;
  --b-slider-width: 100%;
  --b-thumb-width: calc(20px - var(--b-border-width));
  --b-thumb-height: calc(20px - var(--b-border-width));
}

input[type="range"] {
  &::-webkit-slider-thumb {
    --uno: "appearance-none w-$b-thumb-height h-$b-thumb-height bg-white rounded-$b-thumb-height";
    --uno: "ring-$bew-border-color ring-2 cursor-pointer duration-300";
  }

  &::-webkit-slider-thumb:hover {
    --uno: "ring-$bew-theme-color";
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
