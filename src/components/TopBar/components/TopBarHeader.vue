<script setup lang="ts">
import { useMediaQuery, useMutationObserver } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

import { settings } from '~/logic'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import TopBarLogo from './TopBarLogo.vue'
import TopBarRight from './TopBarRight.vue'
import TopBarSearch from './TopBarSearch.vue'

const props = defineProps<{
  reachTop: boolean
  isDark: boolean
}>()

const { forceWhiteIcon, handleNotificationsItemClick, showSearchBar } = useTopBarInteraction()
const isNarrowLayout = useMediaQuery('(max-width: 767px)')

const OVERLAY_HEIGHT = 'calc(var(--bew-top-bar-height) * 1.35)'

// 雾色沿高度从 peak 衰减到几乎透明。
//
// 曲线必须处处平滑：alpha 的斜率只要在中途跳一次，人眼就会在那个一阶导数断点
// 上看到一条并不存在的亮带（马赫带）。手挑 stop 数值保证不了这件事 —— 曾经
// 用「peak → mid@45% → 0」三段，末端斜率突变成 0 长出一条亮带；改成手调的
// S 形后，为了迁就 mid 又在 45% 处压出 2 倍斜率跳变，亮带只是搬到了中间。
//
// 所以改为采样余弦衰减 cos 曲线：它两端斜率天然为 0、中间单调，不存在断点。
// FOG_GAMMA < 1 让曲线上凸，中段留住足够浓度（0.7 时 45% 处约为 peak 的 69%）。
const FOG_GAMMA = 0.7
const FOG_STOP_COUNT = 10

function fogStops(peak: number): [number, number][] {
  return Array.from({ length: FOG_STOP_COUNT }, (_, index) => {
    const t = index / (FOG_STOP_COUNT - 1)
    const decay = ((1 + Math.cos(Math.PI * t)) / 2) ** FOG_GAMMA
    return [+(t * 100).toFixed(1), peak * decay]
  })
}

// 保留两位小数，末端那点残量不能被取整抹平
const fogAlpha = (alpha: number) => +alpha.toFixed(2)

function fogGradient(color: string, peak: number) {
  const stops = fogStops(peak).map(([pos, alpha]) => `rgb(${color} / ${fogAlpha(alpha)}%) ${pos}%`)
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

// 仿 iOS 的 scroll edge effect：让模糊半径本身自顶向下衰减，内容像穿过一层雾
// 那样逐渐变清晰。单层 backdrop-filter 配 mask 做不到这件事 —— 那只是把清晰
// 图像和固定强度的模糊图像按比例混合，两份内容同时可见，会留下重影和边界感。
//
// 真正的渐进模糊要靠堆叠：每层 blur 半径翻倍，mask 窗口逐层向顶部收缩，
// 后一层的 backdrop 是前一层绘制后的结果，于是模糊沿高度累积衰减。
// 顶部五层叠满约等于 blur(18px)，到底部只剩不足 1px，自然归零。
const BLUR_LAYER_COUNT = 5

const blurLayers = Array.from({ length: BLUR_LAYER_COUNT }, (_, index) => {
  const solid = ((BLUR_LAYER_COUNT - 1 - index) / BLUR_LAYER_COUNT) * 100
  const fade = ((BLUR_LAYER_COUNT - index) / BLUR_LAYER_COUNT) * 100
  const mask = `linear-gradient(to bottom, rgb(0 0 0 / 100%) 0, rgb(0 0 0 / 100%) ${solid}%, rgb(0 0 0 / 0%) ${fade}%)`
  // 饱和度只加在覆盖最广的最底层，避免逐层累积把颜色推过头
  const filter = index === 0 ? `blur(${2 ** index}px) saturate(180%)` : `blur(${2 ** index}px)`
  return {
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
    maskImage: mask,
    WebkitMaskImage: mask,
  }
})

// 雾化层只改清晰度，还需要一层雾色叠上去才有"雾"的质感。
const tintBackground = computed(() => {
  // 壁纸模式下方是图片，压黑雾才压得住
  if (forceWhiteIcon.value)
    return fogGradient('0 0 0', 42)

  // 亮色白雾、暗色黑雾。这里不能图省事用 --bew-bg：
  // 它在暗色下是深灰，跟深色页面几乎同色，压上去看不出任何变化。
  return props.isDark
    ? fogGradient('0 0 0', 75)
    : fogGradient('255 255 255', 80)
})

const leftSection = ref<HTMLElement | null>(null)
const rightSection = ref<HTMLElement | null>(null)
const searchSection = ref<HTMLElement | null>(null)
const searchContent = ref<HTMLElement | null>(null)

const leftWidth = ref(0)
const rightWidth = ref(0)
const centerWidth = ref(0)
const searchContentWidth = ref(0)
const isSearchTransitionEnabled = ref(false)

// 使用单个 ResizeObserver 监听多个元素，减少开销
let resizeObserver: ResizeObserver | null = null
let searchTransitionFrame: number | null = null

function setupResizeObserver() {
  if (resizeObserver)
    resizeObserver.disconnect()

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width
      if (entry.target === leftSection.value) {
        leftWidth.value = width
      }
      else if (entry.target === rightSection.value) {
        rightWidth.value = width
      }
      else if (entry.target === searchSection.value) {
        centerWidth.value = width
        refreshSearchContent()
      }
      else if (entry.target === searchContent.value) {
        searchContentWidth.value = width
      }
    }
  })

  if (leftSection.value)
    resizeObserver.observe(leftSection.value)
  if (rightSection.value)
    resizeObserver.observe(rightSection.value)
  if (searchSection.value)
    resizeObserver.observe(searchSection.value)
}

// 监听 searchContent 变化
watch(searchContent, (newEl, oldEl) => {
  if (resizeObserver) {
    if (oldEl)
      resizeObserver.unobserve(oldEl)
    if (newEl)
      resizeObserver.observe(newEl)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (searchTransitionFrame !== null)
    cancelAnimationFrame(searchTransitionFrame)
})

useMutationObserver(searchSection, () => {
  refreshSearchContent()
}, { childList: true, subtree: true })

onMounted(() => {
  leftWidth.value = leftSection.value?.offsetWidth ?? 0
  rightWidth.value = rightSection.value?.offsetWidth ?? 0
  centerWidth.value = searchSection.value?.offsetWidth ?? 0
  refreshSearchContent()
  setupResizeObserver()

  // 初始宽度从 0 更新为实测值属于布局校正，不应被播放成搜索框入场动画。
  // 等首轮 ResizeObserver 与浏览器绘制完成后，再为后续响应式变化启用过渡。
  searchTransitionFrame = requestAnimationFrame(() => {
    searchTransitionFrame = requestAnimationFrame(() => {
      isSearchTransitionEnabled.value = true
      searchTransitionFrame = null
    })
  })
})

const maxOffset = computed(() => {
  if (!centerWidth.value || !searchContentWidth.value)
    return 0
  return Math.max(0, (centerWidth.value - searchContentWidth.value) / 2)
})

const searchOffset = computed(() => {
  // 窄屏优先把完整的中间栏交给搜索框，避免平移后浪费可用宽度。
  if (isNarrowLayout.value)
    return 0

  // 左右区域宽度不同时，补偿一半宽度差，让有足够空余的搜索框相对页面居中。
  // 实际偏移仍受搜索区域剩余空间限制，空间不足时不会挤压两侧控件。
  const desired = (rightWidth.value - leftWidth.value) / 2
  const limit = maxOffset.value
  if (!limit)
    return 0
  return Math.min(Math.max(desired, -limit), limit)
})

function refreshSearchContent() {
  const el = searchSection.value?.querySelector<HTMLElement>('[data-top-bar-search-content]')
  searchContent.value = el ?? null
  searchContentWidth.value = el?.offsetWidth ?? 0
}
</script>

<template>
  <main
    class="top-bar-header"
    :class="{
      'top-bar-header--solid': !settings.enableTopBarGradient,
      'top-bar-header--solid-force-white': !settings.enableTopBarGradient && forceWhiteIcon,
    }"
    max-w="$bew-page-max-width"
    grid="~ cols-[auto_1fr_auto] items-center gap-4"
    p="x-12" m-auto
    h="$bew-top-bar-height"
  >
    <!-- 顶栏边缘雾化：渐进模糊 + 雾色 -->
    <div v-if="settings.enableTopBarGradient" class="top-bar-header__scroll-edge" :style="{ height: OVERLAY_HEIGHT }">
      <!--
        磨砂层跟随「启用毛玻璃效果」开关，默认不渲染。
        堆叠 backdrop-filter 的合成开销是真实的，默认给所有人开会让低端设备掉帧；
        雾色层本身已经提供了可读性所需的遮挡，模糊只是质感加成，所以让它可选。

        开启后模糊层常驻，不跟随 reachTop 挂载／卸载：reachTop 是 scrollTop === 0，
        滚 1px 就翻转，从前那层 <Transition name="fade"> 会让整叠磨砂在 300ms 里凭空
        淡入，用户看得见"材质生效"的过程；壁纸模式下同时还叠着雾色 0.8 → 1，两个变化
        撞在一起更刺眼。iOS 的做法是导航栏材质常在、滚动只加强，这里对齐。
      -->
      <div v-if="settings.enableFrostedGlass" class="top-bar-header__blur-stack">
        <div
          v-for="(layer, index) in blurLayers"
          :key="index"
          class="top-bar-header__blur-layer"
          :style="layer"
        />
      </div>

      <div
        class="top-bar-header__tint"
        :style="{ background: tintBackground, opacity: reachTop ? 0.8 : 1 }"
      />
    </div>

    <!-- Top bar theme color gradient -->
    <Transition name="fade">
      <div
        v-if="settings.enableTopBarGradient && settings.showTopBarThemeColorGradient && !forceWhiteIcon && reachTop && isDark"
        pos="absolute top-0 left-0" w-full h="$bew-top-bar-height" pointer-events-none
        :style="{ background: 'linear-gradient(to bottom, var(--bew-theme-color-10), transparent)' }"
      />
    </Transition>

    <div ref="leftSection" class="top-bar-header__side top-bar-header__side--left">
      <TopBarLogo :force-white-icon="forceWhiteIcon" />
    </div>

    <!-- search bar -->
    <div
      ref="searchSection"
      class="top-bar-header__search"
      :class="{ 'top-bar-header__search--transition-enabled': isSearchTransitionEnabled }"
      :style="{ transform: `translateX(${searchOffset}px)` }"
    >
      <div
        class="top-bar-header__search-content"
        data-top-bar-search-content
      >
        <div
          v-if="showSearchBar"
          class="top-bar-header__search-control"
        >
          <TopBarSearch />
        </div>
      </div>
    </div>

    <!-- right content -->
    <div ref="rightSection" class="top-bar-header__side top-bar-header__side--right">
      <TopBarRight
        @notifications-click="handleNotificationsItemClick"
      />
    </div>
  </main>
</template>

<style scoped lang="scss">
.top-bar-header {
  grid-template-columns: auto minmax(0, 1fr) auto;
  box-sizing: border-box;
  min-width: 0;
  min-height: var(--bew-top-bar-height);
}

.top-bar-header--solid {
  background: var(--bew-top-bar-solid-background);
  box-shadow: var(--bew-top-bar-solid-shadow);
  transition:
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);
}

.top-bar-header--solid-force-white {
  background: var(--bew-top-bar-solid-background-force-white);
}

.top-bar-header__scroll-edge {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
}

.top-bar-header__blur-stack,
.top-bar-header__blur-layer,
.top-bar-header__tint {
  position: absolute;
  inset: 0;
}

.top-bar-header__tint {
  transition: opacity 0.3s ease;
}

.top-bar-header__side {
  display: flex;
  align-items: center;
  min-width: 0;
}

.top-bar-header__side--left {
  justify-self: start;
}

.top-bar-header__side--right {
  justify-self: end;
  gap: 8px;
}

.top-bar-header__search {
  display: flex;
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.top-bar-header__search--transition-enabled {
  transition: transform 0.2s ease;
}

.top-bar-header__search-content {
  display: flex;
  width: 100%;
  max-width: 600px;
  min-width: 0;
  align-items: center;
  justify-content: center;
}

.top-bar-header__search-control {
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
}

// 窄屏响应式 padding（避免窄屏下 x-48px 过于挤压）
@media (max-width: 1279px) {
  .top-bar-header {
    gap: 12px;
    padding-inline: 16px;
  }
}

@media (max-width: 767px) {
  .top-bar-header {
    gap: 8px;
    padding-inline: 8px;
  }
}
</style>
