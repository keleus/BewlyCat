<script setup lang="ts">
import { useMediaQuery, useMutationObserver } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import ProgressiveBlurSurface from '~/components/ProgressiveBlurSurface.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import TopBarItemEditor from './TopBarItemEditor.vue'
import TopBarLogo from './TopBarLogo.vue'
import TopBarRight from './TopBarRight.vue'
import TopBarSearch from './TopBarSearch.vue'

const props = defineProps<{
  reachTop: boolean
  isDark: boolean
}>()

const { forceWhiteIcon, hasTopBarBackdrop, handleNotificationsItemClick } = useTopBarInteraction()
const { isLayoutEditing } = useLayoutEditMode()
const { activatedPage } = useBewlyApp()
const isNarrowLayout = useMediaQuery('(max-width: 767px)')
// 搜索控件常驻挂载，显隐交给 TopBarSearch 内部的 Transition 播放动画；
// 若在此处跟随 showSearchBar 卸载整棵子树，内部的 slide-out 过渡会被同步卸载吞掉。
// 仅布局编辑模式需要整体隐藏（搜索页本身有搜索框，不展示编辑目标）。
const showTopBarSearchEditor = computed(() =>
  !isLayoutEditing.value || activatedPage.value !== AppPage.Search)
const usesProgressiveFog = computed(() => settings.value.topBarStyle === 'progressiveFog')

const OVERLAY_HEIGHT = 'calc(var(--bew-top-bar-height) * 1.35)'
const FOG_GAMMA = 0.7
const FOG_STOP_COUNT = 10

// 遮罩收尾改用纯余弦并加密取样：gamma < 1 会把曲线末端拉尖，
// stop 之间的线性插值追不上，交界处仍会留下可见的 Mach band。
const FADE_GAMMA = 1
const FADE_STOP_COUNT = 16

function fogStops(peak: number, gamma = FOG_GAMMA, count = FOG_STOP_COUNT): [number, number][] {
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1)
    const decay = ((1 + Math.cos(Math.PI * t)) / 2) ** gamma
    return [+(t * 100).toFixed(1), peak * decay]
  })
}

function fadeStops(peak: number): [number, number][] {
  return fogStops(peak, FADE_GAMMA, FADE_STOP_COUNT)
}

function fogGradient(color: string, peak: number) {
  const stops = fogStops(peak).map(([position, alpha]) =>
    `rgb(${color} / ${+alpha.toFixed(2)}%) ${position}%`)
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

const progressiveFogTint = computed(() => {
  return props.isDark
    ? fogGradient('0 0 0', 75)
    : fogGradient('255 255 255', 80)
})

// 分段线性的渐变在拐点处斜率突变，人眼会在交界处脑补出一条亮暗带（Mach band），
// 底图越平越明显。这里复用雾化那套余弦衰减，让收尾的斜率渐近于 0，把那道"杠"磨掉。
function smoothFade(color: (alphaPercent: number) => string, peak: number) {
  const stops = fadeStops(peak).map(([position, alpha]) => `${color(+alpha.toFixed(2))} ${position}%`)
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

// 遮罩前 24px 保持满强度托住图标，其余部分同样用余弦收尾。24 / 64 = 37.5%。
const OVERLAY_MASK_PLATEAU = 37.5
const OVERLAY_MASK = `linear-gradient(to bottom, rgb(0 0 0 / 100%) 0%, ${
  fadeStops(100)
    .map(([position, alpha]) =>
      `rgb(0 0 0 / ${+alpha.toFixed(2)}%) ${+(OVERLAY_MASK_PLATEAU + position * (100 - OVERLAY_MASK_PLATEAU) / 100).toFixed(2)}%`)
    .join(', ')
})`

// 顶栏底下压着底图时滚动后的压深量，两种毛玻璃开关共用同一档。
// 底图能透出来本身就是想要的效果，遮罩再叠上下方渐变层就已接近不透明，
// 只需补这一档保证顶栏可读，拉满会把整条顶栏压成纯黑或纯白。
const SCROLLED_SHADE_ALPHA = 0.5

// 没有底图时遮罩色与页面底色一致，深浅变化不可见，保留实心遮挡压住滚过的内容。
const SCROLLED_SOLID_OPACITY = 0.9

// 顶栏下缘的渐隐层。黑雾沿用 issue 里认可的 60% 起点，白雾与无底图时同档 80%。
const fadeGradient = computed(() => forceWhiteIcon.value
  ? smoothFade(alpha => `rgb(0 0 0 / ${alpha}%)`, 60)
  : smoothFade(alpha => `color-mix(in oklab, var(--bew-bg), transparent ${+(100 - alpha).toFixed(2)}%)`, 80))

// 玻璃本身带的一层薄色。顶栏内的控件不再各自开玻璃后，前景与背景的分离全靠这一层，
// 纯透明玻璃压在花底图上会不够看。
const GLASS_TINT_ALPHA = 0.1

// 暗色用黑玻璃、亮色用白玻璃；页面自带底图时 forceWhiteIcon 恒为真，
// 因此不管亮暗都落在黑玻璃上，与作者要求的"带顶部图片的页面用阴影"一致。
const useDarkGlass = computed(() => forceWhiteIcon.value || props.isDark)

function glassColor(alpha: number) {
  return useDarkGlass.value ? `rgb(0 0 0 / ${alpha})` : `rgb(255 255 255 / ${alpha})`
}

const scrolledShadeColor = computed(() => glassColor(SCROLLED_SHADE_ALPHA))
const glassTintColor = computed(() => glassColor(GLASS_TINT_ALPHA))

// 毛玻璃开启时顶栏遮罩始终使用玻璃滤镜；关闭时本就无滤镜，仍走 opacity 过渡。
const glassOverlayStyle = computed(() => {
  if (settings.value.enableFrostedGlass) {
    return {
      backgroundColor: hasTopBarBackdrop.value && !props.reachTop
        ? scrolledShadeColor.value
        : glassTintColor.value,
      backdropFilter: 'var(--bew-filter-glass-1)',
      maskImage: OVERLAY_MASK,
      WebkitMaskImage: OVERLAY_MASK,
    }
  }
  return {
    backgroundColor: forceWhiteIcon.value ? 'rgb(0 0 0)' : 'var(--bew-bg)',
    opacity: props.reachTop
      ? 0
      : (hasTopBarBackdrop.value ? SCROLLED_SHADE_ALPHA : SCROLLED_SOLID_OPACITY),
    backdropFilter: 'none',
    maskImage: OVERLAY_MASK,
    WebkitMaskImage: OVERLAY_MASK,
  }
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
    :class="{ 'top-bar-header--editing': isLayoutEditing }"
    max-w="$bew-page-max-width"
    grid="~ cols-[auto_1fr_auto] items-center gap-4"
    p="x-12" m-auto
    h="$bew-top-bar-height"
  >
    <!-- 1.7.4 的五层渐进雾化仅在用户明确选择时挂载，避免默认产生额外合成开销。 -->
    <div
      v-if="usesProgressiveFog"
      class="top-bar-header__progressive-fog"
      :style="{ height: OVERLAY_HEIGHT }"
    >
      <!-- 渐变样式保持固定雾化，不随滚动再叠一层遮罩 -->
      <ProgressiveBlurSurface />
      <div
        class="top-bar-header__progressive-fog-tint"
        :style="{ background: progressiveFogTint }"
      />
    </div>

    <template v-else>
      <!-- 默认的低开销顶栏遮罩：常驻挂载，玻璃与恒等滤镜间插值（见 glassOverlayStyle） -->
      <div class="top-bar-header__glass-overlay" :style="glassOverlayStyle" />

      <div
        pos="absolute top-0 left-0" w-full
        pointer-events-none opacity-100 duration-300
        :style="{
          background: fadeGradient,
          opacity: reachTop ? 0.8 : 1,
          height: 'var(--bew-top-bar-height)',
        }"
      />
    </template>

    <!-- Top bar theme color gradient -->
    <Transition name="fade">
      <div
        v-if="!usesProgressiveFog && settings.showTopBarThemeColorGradient && !forceWhiteIcon && reachTop && isDark"
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
          v-if="showTopBarSearchEditor"
          class="top-bar-header__search-control"
        >
          <TopBarItemEditor
            component-key="search"
            :title="$t('settings.show_hot_search_in_top_bar')"
          >
            <TopBarSearch
              :force-visible="isLayoutEditing && activatedPage !== AppPage.Search"
              :edit-mode="isLayoutEditing"
            />
          </TopBarItemEditor>
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

.top-bar-header--editing {
  background: transparent;
}

.top-bar-header__progressive-fog {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
}

.top-bar-header__progressive-fog-tint {
  position: absolute;
  inset: 0;
  transition: opacity var(--bew-duration-moderate) var(--bew-ease-standard);
}

.top-bar-header__glass-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: var(--bew-top-bar-height);
  pointer-events: none;
  transition:
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    backdrop-filter var(--bew-duration-moderate) var(--bew-ease-standard);
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
  position: relative;
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
}

.top-bar-header--editing .top-bar-header__search-control :deep(.search-bar) {
  pointer-events: none;
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
