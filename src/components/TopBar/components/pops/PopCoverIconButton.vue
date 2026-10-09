<script setup lang="ts">
/**
 * 顶栏弹窗媒体卡封面上的圆形小图标钮（稍后再看操作 / 历史删除）。
 * 显隐由父级覆盖层容器的 group-hover 控制，本组件只管统一样式与可访问性。
 */
withDefaults(defineProps<{
  ariaLabel?: string
  tooltip?: string
  tooltipPlacement?: 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'
  hoverColor?: 'theme' | 'error'
}>(), {
  tooltipPlacement: 'top',
  hoverColor: 'theme',
})

defineEmits<{ click: [] }>()
</script>

<template>
  <Tooltip v-if="tooltip" :content="tooltip" :placement="tooltipPlacement" floating>
    <button
      type="button"
      class="pop-cover-icon-btn"
      :class="`pop-cover-icon-btn--${hoverColor}`"
      w-24px h-24px
      bg="black opacity-60"
      grid="~ place-items-center"
      text="white xs"
      border="rounded-full"
      :aria-label="ariaLabel"
      @click.stop.prevent="$emit('click')"
    >
      <slot />
    </button>
  </Tooltip>
  <button
    v-else
    type="button"
    class="pop-cover-icon-btn"
    :class="`pop-cover-icon-btn--${hoverColor}`"
    w-24px h-24px
    bg="black opacity-60"
    grid="~ place-items-center"
    text="white xs"
    border="rounded-full"
    :aria-label="ariaLabel"
    @click.stop.prevent="$emit('click')"
  >
    <slot />
  </button>
</template>

<style lang="scss" scoped>
// hover 变色写在 scoped CSS 而非动态 bg 工具类：UnoCSS watch 增量构建对
// 三元表达式中的变体 token 提取不稳定，静态类保证两种颜色始终生成。
.pop-cover-icon-btn--theme:hover {
  background-color: var(--bew-theme-color);
}

.pop-cover-icon-btn--error:hover {
  background-color: var(--bew-error-color);
}
</style>
