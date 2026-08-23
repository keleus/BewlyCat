<script setup lang="ts">
import { useMediaQuery, useMutationObserver } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { experimentalTopBarStyles, FROSTED_GLASS_BLUR_MAX_PX, FROSTED_GLASS_BLUR_MIN_PX } from '~/logic/storage'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import TopBarItemEditor from './TopBarItemEditor.vue'
import TopBarLogo from './TopBarLogo.vue'
import TopBarRight from './TopBarRight.vue'
import TopBarSearch from './TopBarSearch.vue'

const props = defineProps<{
  reachTop: boolean
  isDark: boolean
}>()

const { forceWhiteIcon, hasPageBackdrop, handleNotificationsItemClick } = useTopBarInteraction()
const { isLayoutEditing } = useLayoutEditMode()
const { activatedPage } = useBewlyApp()
const isNarrowLayout = useMediaQuery('(max-width: 767px)')
// 搜索控件常驻挂载，显隐交给 TopBarSearch 内部的 Transition 播放动画；
// 若在此处跟随 showSearchBar 卸载整棵子树，内部的 slide-out 过渡会被同步卸载吞掉。
// 仅布局编辑模式需要整体隐藏（搜索页本身有搜索框，不展示编辑目标）。
const showTopBarSearchEditor = computed(() =>
  !isLayoutEditing.value || activatedPage.value !== AppPage.Search)

const FADE_STOP_COUNT = 16

function fadeStops(peak: number): [number, number][] {
  return Array.from({ length: FADE_STOP_COUNT }, (_, index) => {
    const t = index / (FADE_STOP_COUNT - 1)
    const decay = (1 + Math.cos(Math.PI * t)) / 2
    return [+(t * 100).toFixed(1), peak * decay]
  })
}

// 分段线性拐点会被读成一条亮暗带（Mach band）；余弦让收尾斜率渐近于 0。
function smoothFade(color: (alphaPercent: number) => string, peak: number) {
  const stops = fadeStops(peak).map(([position, alpha]) => `${color(+alpha.toFixed(2))} ${position}%`)
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

function overlayMask(plateauVar: string) {
  return `linear-gradient(to bottom, rgb(0 0 0 / 100%) 0%, ${
    fadeStops(100)
      .map(([position, alpha]) => {
        const t = +(position / 100).toFixed(4)
        return `rgb(0 0 0 / ${+alpha.toFixed(2)}%) calc(var(${plateauVar}) + ${t} * (100% - var(${plateauVar})))`
      })
      .join(', ')
  })`
}

// 毛玻璃：满强度到主控件下沿（约 55px），收尾落在 64px 顶栏内。
const FROSTED_OVERLAY_MASK = overlayMask('--overlay-mask-plateau-frosted')
// 非毛玻璃：平台 48px、收尾 32px；超出顶栏 16px，收尾从下沿往里 16px 起。
const SOLID_OVERLAY_MASK = overlayMask('--overlay-mask-plateau-solid')

const SCROLLED_SHADE_ALPHA = 0.5
const GLASS_TINT_ALPHA = 0.1

// 雾配方只认「页面自带横幅」：那种底图的亮暗不受主题控制，只能恒用黑雾托住白图标。
// 不能改认 forceWhiteIcon —— 它在「暗色 + 壁纸」也为真，会让暗色下有无壁纸变成两种配方（#1095）。
const fadeGradient = computed(() => hasPageBackdrop.value
  ? smoothFade(alpha => `rgb(0 0 0 / ${alpha}%)`, 60)
  : smoothFade(alpha => `color-mix(in oklab, var(--bew-bg), transparent ${+(100 - alpha).toFixed(2)}%)`, 80))

// 页面横幅不受主题控制，恒用暗玻璃；其余跟随亮暗。
const useDarkGlass = computed(() => forceWhiteIcon.value || props.isDark)

function glassColor(alpha: number) {
  return useDarkGlass.value ? `rgb(0 0 0 / ${alpha})` : `rgb(255 255 255 / ${alpha})`
}

const glassTintColor = computed(() => glassColor(GLASS_TINT_ALPHA))

// 毛玻璃档恒用薄色，不按有无底图分档：分离前景靠的是模糊本身，
// 再按底图加深会让「有壁纸」和「无壁纸」变成两个浓度（#1095）。
const frostedOverlayStyle = computed(() => ({
  backgroundColor: glassTintColor.value,
  backdropFilter: 'var(--bew-filter-glass-1)',
  WebkitBackdropFilter: 'var(--bew-filter-glass-1)',
  maskImage: FROSTED_OVERLAY_MASK,
  WebkitMaskImage: FROSTED_OVERLAY_MASK,
}))

const solidOverlayStyle = computed(() => ({
  backgroundColor: hasPageBackdrop.value ? 'rgb(0 0 0)' : 'var(--bew-bg)',
  opacity: props.reachTop ? 0 : SCROLLED_SHADE_ALPHA,
  maskImage: SOLID_OVERLAY_MASK,
  WebkitMaskImage: SOLID_OVERLAY_MASK,
}))

const fadeGradientStyle = computed(() => ({
  background: fadeGradient.value,
  opacity: props.reachTop ? 0.8 : 1,
  height: settings.value.enableFrostedGlass
    ? 'var(--bew-top-bar-height)'
    : 'calc(var(--bew-top-bar-height) + var(--bew-space-4))',
}))

// 实验三档走余弦渐变管线；其余档位沿用 v1.5.x 的遮罩表现。
const useLegacyRendering = computed(() => !experimentalTopBarStyles.includes(settings.value.topBarStyle))

// v1.5.x 的三停轻雾：顶部八成、中部六成（黑雾六/四成），随滚动由 0.8 收紧到 1。
const legacyFadeGradientStyle = computed(() => ({
  background: `linear-gradient(to bottom, ${
    forceWhiteIcon.value
      ? 'rgb(0 0 0 / 60%), rgb(0 0 0 / 40%) calc(var(--bew-top-bar-height) / 2)'
      : 'color-mix(in oklab, var(--bew-bg), transparent 20%), color-mix(in oklab, var(--bew-bg), transparent 40%) calc(var(--bew-top-bar-height) / 2)'
  }, transparent)`,
  opacity: props.reachTop ? 0.8 : 1,
  height: 'var(--bew-top-bar-height)',
}))

// 旧版白雾保持 v1.5.x 的纯 blur 配方，半径跟随全局毛玻璃浓度滑块。
const legacyGlassFilter = computed(() => {
  const intensity = Math.min(FROSTED_GLASS_BLUR_MAX_PX, Math.max(FROSTED_GLASS_BLUR_MIN_PX, settings.value.frostedGlassBlurIntensity))
  return `blur(${intensity}px)`
})

const legacyMaskStyle = computed(() =>
  settings.value.enableFrostedGlass
    ? { backdropFilter: legacyGlassFilter.value }
    : undefined)

const themeGradientColor = computed(() =>
  // 实验档在毛玻璃下用加深的主题色；旧版三档保持 v1.5.x 的强度。
  !useLegacyRendering.value && settings.value.enableFrostedGlass
    ? 'var(--bew-theme-color-20)'
    : 'var(--bew-theme-color-10)')

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
    <!-- 旧版三档：v1.5.x 结构，滚动后必挂遮罩——毛玻璃出白雾，非毛玻璃压实色阴影 -->
    <template v-if="useLegacyRendering">
      <Transition name="fade">
        <div
          v-if="!reachTop"
          class="top-bar-header__legacy-mask"
          :class="{ 'top-bar-header__legacy-mask--glass': settings.enableFrostedGlass }"
          :style="legacyMaskStyle"
        />
      </Transition>

      <div
        pos="absolute top-0 left-0" w-full
        pointer-events-none opacity-100 duration-300
        :style="legacyFadeGradientStyle"
      />
    </template>

    <!-- 渐变：余弦渐变遮罩管线 -->
    <template v-else>
      <div
        class="top-bar-header__glass-overlay"
        :class="{ 'top-bar-header__glass-overlay--frosted': settings.enableFrostedGlass }"
        :style="settings.enableFrostedGlass ? frostedOverlayStyle : solidOverlayStyle"
      />

      <div
        pos="absolute top-0 left-0" w-full
        pointer-events-none opacity-100 duration-300
        :style="fadeGradientStyle"
      />
    </template>

    <!-- Top bar theme color gradient -->
    <Transition name="fade">
      <div
        v-if="settings.showTopBarThemeColorGradient && !forceWhiteIcon && reachTop && isDark"
        pos="absolute top-0 left-0" w-full h="$bew-top-bar-height" pointer-events-none
        :style="{ background: `linear-gradient(to bottom, ${themeGradientColor}, transparent)` }"
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

.top-bar-header__glass-overlay {
  --overlay-mask-plateau-frosted: calc((var(--bew-top-bar-height) + var(--bew-top-bar-primary-control-height)) / 2);
  --overlay-mask-plateau-solid: calc(var(--bew-top-bar-height) - var(--bew-space-4));
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(var(--bew-top-bar-height) + var(--bew-space-4));
  pointer-events: none;
  transition:
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    backdrop-filter var(--bew-duration-moderate) var(--bew-ease-standard);
}

.top-bar-header__glass-overlay--frosted {
  height: var(--bew-top-bar-height);
}

// 复刻 v1.5.x 的滚动遮罩：非毛玻璃压九成底色当阴影，毛玻璃换成白雾
// （模糊半径由 legacyMaskStyle 按全局浓度滑块注入，不用现在的 --bew-filter-glass-1）。
.top-bar-header__legacy-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: var(--bew-top-bar-height);
  pointer-events: none;
  background-color: var(--bew-bg);
  opacity: 0.9;
  mask-image: linear-gradient(to bottom, rgb(0 0 0 / 100%), rgb(0 0 0 / 100%) 24px, rgb(0 0 0 / 90%) 44px, transparent);
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgb(0 0 0 / 100%),
    rgb(0 0 0 / 100%) 24px,
    rgb(0 0 0 / 90%) 44px,
    transparent
  );
}

.top-bar-header__legacy-mask--glass {
  background-color: transparent;
  opacity: 1;
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
