<script setup lang="ts">
import { useBewlyApp } from '~/composables/useAppProvider'

const props = defineProps<{
  options: readonly OptionType[]
  modelValue: any
}>()

const emit = defineEmits(['update:modelValue', 'change'])

interface OptionType {
  value: any
  label: string
}

const { mainAppRef } = useBewlyApp()

const DROPDOWN_MARGIN = 8
// UX 上限：菜单不应无限高，实际高度始终与可用空间取小
const DROPDOWN_MAX_HEIGHT = 300

const label = ref<string>('')
const showOptions = ref<boolean>(false)
const dropdownPosition = ref({ top: 0, left: 0, width: 0, openUp: false, maxHeight: DROPDOWN_MAX_HEIGHT })
const containerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)

onUpdated(() => {
  // fix the issue when the dropdown menu text doesn't update in real-time based on the updated page language
  if (props.options)
    label.value = `${props.options.find((item: OptionType) => item.value === props.modelValue)?.label}`
})

onMounted(() => {
  if (props.options)
    label.value = `${props.options.find((item: OptionType) => item.value === props.modelValue)?.label}`

  // 窗口大小变化时按真实高度重算位置
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
})

function handleWindowResize() {
  calculatePosition(dropdownRef.value?.scrollHeight ?? 0)
}

/** 计算下拉菜单绝对位置，空间不足时自动向上弹出并限制最大高度 */
function calculatePosition(desiredHeight: number) {
  if (!containerRef.value)
    return

  const rect = containerRef.value.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_MARGIN
  const spaceAbove = rect.top - DROPDOWN_MARGIN

  // 下方放不下且上方更宽敞时向上弹出；最大高度限制在所选方向的可用空间内
  const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow
  const availableSpace = openUp ? spaceAbove : spaceBelow

  dropdownPosition.value = {
    top: (openUp ? rect.top : rect.bottom) + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    openUp,
    // 极端矮视口下也不能超过实际可用空间，否则仍会溢出贴边
    maxHeight: Math.max(Math.min(DROPDOWN_MAX_HEIGHT, availableSpace), 0),
  }
}

// 显示选项时定位：先按当前状态渲染，再用真实高度校正方向
watch(showOptions, async (visible) => {
  if (!visible)
    return

  calculatePosition(dropdownRef.value?.scrollHeight ?? 0)
  await nextTick()

  // 用 scrollHeight（未被 max-height 夹取的完整内容高度）重新决策，
  // 避免第一遍的 maxHeight 污染测量导致该翻转而没翻；
  // 翻转后 maxHeight 收缩到另一侧可用空间内，菜单必然完整可见，无需二次校正
  if (dropdownRef.value)
    calculatePosition(dropdownRef.value.scrollHeight)
}, { flush: 'post' })

function onClickOption(val: OptionType) {
  window.removeEventListener('click', () => {})
  label.value = val.label
  emit('update:modelValue', val.value)
  emit('change', val.value)
  showOptions.value = false
}

function closeOptions() {
  showOptions.value = false
}

/** when you click on it outside, the selection option will be turned off  */
function onMouseLeave() {
  window.addEventListener('click', closeOptions)
}

function onMouseEnter() {
  window.removeEventListener('click', closeOptions)
}
</script>

<template>
  <div
    ref="containerRef"
    pos="relative"
    @mouseleave="onMouseLeave"
    @mouseenter="onMouseEnter"
  >
    <div
      p="x-4 y-2"
      bg="$bew-fill-1"
      rounded="$bew-radius"
      text="center $bew-text-1"
      cursor="pointer"
      flex="~"
      justify="between"
      items="center" w="full"
      :ring="showOptions ? '2px $bew-theme-color' : ''" duration-300
      @click="showOptions = !showOptions"
    >
      <div
        truncate
        overflow="hidden"
        m="r-2"
        v-text="label === 'undefined' ? '' : label"
      />

      <!-- arrow -->
      <div
        border="~ solid t-0 l-0 r-2 b-2"
        :border-color="showOptions ? '$bew-theme-color' : '$bew-fill-4'"
        p="3px"
        m="l-2"
        display="inline-block"
        :transform="`~ ${!showOptions ? 'rotate-45 -translate-y-1/4' : 'rotate-225 translate-y-1/4'} `"
        transition="all duration-300"
      />
    </div>

    <Teleport :to="mainAppRef">
      <Transition :name="dropdownPosition.openUp ? 'dropdown-up' : 'dropdown'">
        <div
          v-if="showOptions"
          ref="dropdownRef"
          :style="{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: `${dropdownPosition.maxHeight}px`,
            // 向上弹出时锚点移到触发器顶部，用 transform 上移自身高度，无需先测量实际高度
            transform: dropdownPosition.openUp ? `translateY(calc(-100% - ${DROPDOWN_MARGIN}px))` : undefined,
            marginTop: dropdownPosition.openUp ? undefined : `${DROPDOWN_MARGIN}px`,
            backdropFilter: 'var(--bew-filter-glass-1)',
          }"
          pos="absolute" bg="$bew-elevated" shadow="$bew-shadow-2" p="2"
          rounded="$bew-radius" z="10004" flex="~ col gap-1"
          w="full" overflow-y-overlay will-change-transform
        >
          <div
            v-for="option in options"
            :key="option.value"
            p="x-2 y-2"
            rounded="$bew-radius"
            w="full"
            bg="hover:$bew-fill-2"
            transition="all duration-300"
            cursor="pointer"
            @click="onClickOption(option)"
          >
            <span v-text="option.label" />
          </div>
        </div>
      </Transition>

      <!-- 遮罩 外部滚动时关闭下拉菜单 -->
      <div
        v-if="showOptions"
        pos="fixed top-0 left-0" w-full h-full
        z="10003"
        @wheel="closeOptions"
      />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
// 向上弹出时的过渡：方向与全局 .dropdown（向下开）相反
// 使用独立的 translate 属性而非 transform，避免覆盖定位用的 inline transform
.dropdown-up-enter-active,
.dropdown-up-leave-active {
  transition: all 300ms ease;
}

.dropdown-up-enter-from,
.dropdown-up-leave-to {
  opacity: 0;
  translate: 0 12px;
  filter: blur(4px);
}
</style>
