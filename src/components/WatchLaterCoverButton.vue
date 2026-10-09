<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Tooltip from '~/components/Tooltip.vue'
import { settings } from '~/logic'
import { ensureWatchLaterState, isInWatchLater } from '~/logic/watchLaterState'
import {
  getWatchLaterTargetKey,
  isWatchLaterTargetLoading,
  toggleWatchLaterTarget,
} from '~/utils/watchLaterActions'
import type { WatchLaterTarget } from '~/utils/watchLaterSnapshot'

/**
 * 封面右上角「加入稍后再看」统一按钮。
 * 唯一的显隐契约是 target：传入有效目标（aid/bvid/epid 任一）且设置项开启时渲染，
 * 不支持 / 不想显示时调用方直接传 undefined。封面容器需带 bew-cover-action-host 类，
 * 宿主 hover / 键盘 focus 下显示，动态页可保留已加入后常驻。状态与增删逻辑复用 watchLaterActions。
 */
const props = withDefaults(defineProps<{
  target?: WatchLaterTarget
  persistent?: boolean
  size?: 'sm' | 'md'
  tooltipPlacement?: 'left' | 'right' | 'top' | 'bottom' | 'bottom-left' | 'bottom-right'
}>(), {
  size: 'md',
  persistent: false,
  tooltipPlacement: 'bottom-right',
})

// 未渲染的按钮不会执行下方的状态计算，也就不订阅共享列表，避免长列表无效依赖。
const visible = computed(() => Boolean(
  settings.value.showVideoCardWatchLater
  && props.target
  && getWatchLaterTargetKey(props.target),
))

// 仅在按钮渲染后才建立对共享稍后再看状态的依赖。
const added = computed(() => visible.value && isInWatchLater(props.target!))
const loading = computed(() => visible.value && isWatchLaterTargetLoading(props.target!))

const { t } = useI18n()
const label = computed(() =>
  added.value
    ? t('common.added_to_watch_later')
    : t('common.add_to_watch_later'))

function warmState() {
  // 预热共享缓存；缓存有效期内不会发请求，多处调用共享同一次加载。
  void ensureWatchLaterState()
}

function handleWarmOnVisible() {
  if (document.visibilityState === 'visible') {
    document.removeEventListener('visibilitychange', handleWarmOnVisible)
    warmState()
  }
}

function handleClick(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  void toggleWatchLaterTarget(props.target)
}

// 挂载即预热：已添加的视频刷新后无需悬停就能呈现常驻按钮；请求由状态层全局去重。
// 后台标签页延迟到重新可见时再加载，避免挤占后台请求。
onMounted(() => {
  if (!visible.value)
    return
  if (document.visibilityState === 'visible')
    warmState()
  else
    document.addEventListener('visibilitychange', handleWarmOnVisible)
})
// target 可能异步补齐（visible 晚于挂载变 true），届时补一次预热（warmState 自带去重）。
watch(visible, (isVisible) => {
  if (!isVisible)
    return
  if (document.visibilityState === 'visible')
    warmState()
  else
    document.addEventListener('visibilitychange', handleWarmOnVisible)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleWarmOnVisible)
})
</script>

<template>
  <div
    v-if="visible"
    class="bew-watch-later-cover"
  >
    <!-- floating：按钮常驻封面内（封面 overflow:hidden），提示必须传送至顶层才不会被裁切 -->
    <Tooltip :content="label" :placement="tooltipPlacement" type="dark" floating>
      <button
        type="button"
        class="bew-watch-later-cover__btn"
        :class="[
          `bew-watch-later-cover__btn--${size}`,
          { 'is-added': added, 'is-loading': loading },
          { 'is-persistent': persistent && added },
        ]"
        :aria-busy="loading || undefined"
        :aria-pressed="added"
        :aria-label="label"
        :disabled="loading || undefined"
        @click="handleClick"
      >
        <i v-if="loading" i-svg-spinners:ring-resize aria-hidden="true" />
        <i v-else-if="added" i-line-md:confirm aria-hidden="true" />
        <i v-else i-mingcute:carplay-line aria-hidden="true" />
      </button>
    </Tooltip>
  </div>
</template>

<style lang="scss" scoped>
.bew-watch-later-cover {
  position: absolute;
  top: var(--bew-space-1);
  right: var(--bew-space-1);
  z-index: 3;
}

.bew-watch-later-cover__btn {
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  place-items: center;
  color: #fff;
  background: rgb(0 0 0 / 62%);
  cursor: pointer;
  font-size: var(--bew-icon-size-md);
  line-height: 1;
  opacity: 0;
  transform: scale(0.78);
  transition:
    opacity var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.bew-watch-later-cover__btn--sm {
  width: 24px;
  height: 24px;
  font-size: 16px;
}

.bew-watch-later-cover__btn:hover,
.bew-watch-later-cover__btn:focus-visible,
.bew-watch-later-cover__btn.is-persistent {
  opacity: 1;
  transform: scale(1);
}

.bew-watch-later-cover__btn:hover {
  background: rgb(0 0 0 / 78%);
}

.bew-watch-later-cover__btn.is-added {
  background: var(--bew-theme-color);
}

.bew-watch-later-cover__btn.is-added:hover {
  background: color-mix(in oklab, var(--bew-theme-color), #000 16%);
}

.bew-watch-later-cover__btn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.bew-watch-later-cover__btn.is-loading {
  cursor: wait;
  opacity: 0.72;
}

@media (prefers-reduced-motion: reduce) {
  .bew-watch-later-cover__btn {
    transition: none;
    transform: none;
  }
}
</style>

<!--
  宿主联动规则必须放在非 scoped 块：Vue scoped 样式的 :global() 只支持包裹整条选择器，
  「:global(.host:hover) .btn」这种混合写法编译后会丢失后代关系，导致规则误挂到宿主元素。
  封面容器静态携带 bew-cover-action-host 类（不依赖运行时探测父节点），类名带 bew- 前缀
  不会与其他样式冲突；过渡仍由 scoped 块中的按钮规则提供。
-->
<style lang="scss">
.bew-cover-action-host:hover .bew-watch-later-cover__btn,
.bew-cover-action-host:focus-within .bew-watch-later-cover__btn {
  opacity: 1;
  transform: scale(1);
}
</style>
