<script setup lang="ts">
import { useDark } from '~/composables/useDark'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { isLocalWallpaperUrl, resolveWallpaperUrl } from '~/utils/localWallpaper'
import { generateBlurredWallpaper, hexToHSL } from '~/utils/main'
import { cleanupExpiredCache, getOrCacheWallpaper } from '~/utils/wallpaperCache'

const props = defineProps<{ activatedPage: AppPage }>()

const { isDark } = useDark()

// 组件挂载时清理过期缓存
onMounted(() => {
  cleanupExpiredCache()
  setAppWallpaperMaskingOpacity()
})

// 计算解析后的壁纸URL(支持本地壁纸和缓存控制)
const resolvedWallpaper = ref('')
const resolvedSearchPageWallpaper = ref('')

// 模糊版本的壁纸URL
const blurredWallpaper = ref('')
const blurredSearchPageWallpaper = ref('')

// 模糊图生成状态（用于本地图片的 loading 显示）
const isGeneratingBlur = ref(false)
const isGeneratingSearchPageBlur = ref(false)

// 解析全局壁纸
async function resolveGlobalWallpaper() {
  const originalUrl = settings.value.wallpaper

  // 如果是本地壁纸,直接解析,不使用URL缓存
  if (isLocalWallpaperUrl(originalUrl)) {
    resolvedWallpaper.value = resolveWallpaperUrl(originalUrl) || ''
    return
  }

  // 如果是普通URL,使用缓存控制
  if (originalUrl) {
    resolvedWallpaper.value = await getOrCacheWallpaper(originalUrl, settings.value.wallpaperCacheTime)
  }
  else {
    resolvedWallpaper.value = ''
  }
}

// 解析搜索页壁纸
async function resolveSearchWallpaper() {
  const originalUrl = settings.value.searchPageWallpaper

  // 如果是本地壁纸,直接解析,不使用URL缓存
  if (isLocalWallpaperUrl(originalUrl)) {
    resolvedSearchPageWallpaper.value = resolveWallpaperUrl(originalUrl) || ''
    return
  }

  // 如果是普通URL,使用缓存控制
  if (originalUrl) {
    resolvedSearchPageWallpaper.value = await getOrCacheWallpaper(originalUrl, settings.value.searchPageWallpaperCacheTime)
  }
  else {
    resolvedSearchPageWallpaper.value = ''
  }
}

// 监听设置变化,重新解析壁纸
watch(() => [settings.value.wallpaper, settings.value.wallpaperCacheTime], ([, newCacheTime], oldValue) => {
  // 如果缓存时间改变,用新的缓存时间清理可能已过期的缓存
  if (oldValue && newCacheTime !== oldValue[1]) {
    cleanupExpiredCache(newCacheTime as number)
  }
  resolveGlobalWallpaper()
}, { immediate: true })

watch(() => [settings.value.searchPageWallpaper, settings.value.searchPageWallpaperCacheTime], ([, newCacheTime], oldValue) => {
  // 如果缓存时间改变,用新的缓存时间清理可能已过期的缓存
  if (oldValue && newCacheTime !== oldValue[1]) {
    cleanupExpiredCache(newCacheTime as number)
  }
  resolveSearchWallpaper()
}, { immediate: true })

// 计算当前页面使用的壁纸URL
const currentWallpaperUrl = computed(() => {
  if (props.activatedPage === AppPage.Search && settings.value.individuallySetSearchPageWallpaper) {
    return resolvedSearchPageWallpaper.value
  }
  return resolvedWallpaper.value
})

// 计算当前页面使用的模糊壁纸URL
const currentBlurredWallpaperUrl = computed(() => {
  if (props.activatedPage === AppPage.Search && settings.value.individuallySetSearchPageWallpaper) {
    return blurredSearchPageWallpaper.value
  }
  return blurredWallpaper.value
})

// 生成全局壁纸的模糊版本
async function generateGlobalBlurredWallpaper(isLocalImage: boolean = false) {
  if (!resolvedWallpaper.value || !settings.value.enableWallpaperMasking)
    return

  // 如果模糊强度为 0，清空模糊图，直接使用半透明蒙层
  const blurRadius = settings.value.wallpaperBlurIntensity || 0
  if (blurRadius === 0) {
    blurredWallpaper.value = ''
    return
  }

  try {
    // 本地图片：显示 loading
    if (isLocalImage) {
      isGeneratingBlur.value = true
    }
    // 在线图片：后台静默生成

    blurredWallpaper.value = await generateBlurredWallpaper(resolvedWallpaper.value, blurRadius, 0.4)
  }
  catch (error) {
    console.error('Failed to generate blurred wallpaper:', error)
    blurredWallpaper.value = '' // Fallback to semi-transparent mask
  }
  finally {
    if (isLocalImage) {
      isGeneratingBlur.value = false
    }
  }
}

// 生成搜索页壁纸的模糊版本
async function generateSearchPageBlurredWallpaper(isLocalImage: boolean = false) {
  if (!resolvedSearchPageWallpaper.value || !settings.value.searchPageEnableWallpaperMasking)
    return

  // 如果模糊强度为 0，清空模糊图，直接使用半透明蒙层
  const blurRadius = settings.value.searchPageWallpaperBlurIntensity || 0
  if (blurRadius === 0) {
    blurredSearchPageWallpaper.value = ''
    return
  }

  try {
    // 本地图片：显示 loading
    if (isLocalImage) {
      isGeneratingSearchPageBlur.value = true
    }
    // 在线图片：后台静默生成

    blurredSearchPageWallpaper.value = await generateBlurredWallpaper(resolvedSearchPageWallpaper.value, blurRadius, 0.4)
  }
  catch (error) {
    console.error('Failed to generate blurred search page wallpaper:', error)
    blurredSearchPageWallpaper.value = ''
  }
  finally {
    if (isLocalImage) {
      isGeneratingSearchPageBlur.value = false
    }
  }
}

// 监听全局壁纸变化，生成模糊版本
watch(() => resolvedWallpaper.value, (newUrl) => {
  if (newUrl) {
    // 判断是否为本地图片
    const isLocal = isLocalWallpaperUrl(settings.value.wallpaper)
    generateGlobalBlurredWallpaper(isLocal)
  }
  else {
    blurredWallpaper.value = ''
  }
})

// 监听搜索页壁纸变化，生成模糊版本
watch(() => resolvedSearchPageWallpaper.value, (newUrl) => {
  if (newUrl) {
    // 判断是否为本地图片
    const isLocal = isLocalWallpaperUrl(settings.value.searchPageWallpaper)
    generateSearchPageBlurredWallpaper(isLocal)
  }
  else {
    blurredSearchPageWallpaper.value = ''
  }
})

// 监听蒙层开关变化
watch(() => settings.value.enableWallpaperMasking, (enabled) => {
  if (enabled && resolvedWallpaper.value && !blurredWallpaper.value) {
    const isLocal = isLocalWallpaperUrl(settings.value.wallpaper)
    generateGlobalBlurredWallpaper(isLocal)
  }
})

watch(() => settings.value.searchPageEnableWallpaperMasking, (enabled) => {
  if (enabled && resolvedSearchPageWallpaper.value && !blurredSearchPageWallpaper.value) {
    const isLocal = isLocalWallpaperUrl(settings.value.searchPageWallpaper)
    generateSearchPageBlurredWallpaper(isLocal)
  }
})

// 监听模糊强度变化，重新生成模糊图
watch(() => settings.value.wallpaperBlurIntensity, () => {
  if (resolvedWallpaper.value && settings.value.enableWallpaperMasking) {
    const isLocal = isLocalWallpaperUrl(settings.value.wallpaper)
    generateGlobalBlurredWallpaper(isLocal)
  }
})

watch(() => settings.value.searchPageWallpaperBlurIntensity, () => {
  if (resolvedSearchPageWallpaper.value && settings.value.searchPageEnableWallpaperMasking) {
    const isLocal = isLocalWallpaperUrl(settings.value.searchPageWallpaper)
    generateSearchPageBlurredWallpaper(isLocal)
  }
})

const themeColorHsl = computed(() => {
  return hexToHSL(settings.value.themeColor).replace('hsl(', '').replace(')', '')
})
const themeColorHue = computed((): number => {
  return Number(themeColorHsl.value.split(',')[0]) || 0
})
const themeColorSaturation = computed((): number => {
  return Number(themeColorHsl.value.split(',')[1].replace('%', '')) || 0
})
const themeColorLightness = computed((): number => {
  return Number(themeColorHsl.value.split(',')[2].replace('%', '')) || 0
})
const themeColorLinearGradientBackground = computed((): string => {
  return `linear-gradient(180deg, 
    transparent 0% 44%,
    hsla(${themeColorHue.value}, ${themeColorSaturation.value + 20}%, ${themeColorLightness.value}%, 0.4) 62%, 
    hsl(${themeColorHue.value}, ${themeColorSaturation.value}%, ${themeColorLightness.value}%) 80%,
    hsl(${themeColorHue.value}, ${themeColorSaturation.value}%, 100%) 100%)`
})

watch(() => settings.value.wallpaperMaskOpacity, () => {
  setAppWallpaperMaskingOpacity()
})

watch(() => settings.value.searchPageWallpaperMaskOpacity, () => {
  setAppWallpaperMaskingOpacity()
})

watch(() => props.activatedPage, (newValue, oldValue) => {
  // If u have set the `individuallySetSearchPageWallpaper`, reapply the wallpaper when the new page is search page
  // or when switching from a search page to another page, since search page has its own wallpaper.
  const isSearchPage = (page: AppPage) => page === AppPage.Search
  if (settings.value.individuallySetSearchPageWallpaper && (isSearchPage(newValue) || isSearchPage(oldValue)))
    setAppWallpaperMaskingOpacity()
})

function setAppWallpaperMaskingOpacity() {
  const bewlyElement = document.querySelector('#bewly') as HTMLElement
  const isSearchPage = props.activatedPage === AppPage.Search
  if (settings.value.individuallySetSearchPageWallpaper && isSearchPage)
    bewlyElement.style.setProperty('--bew-homepage-bg-mask-opacity', `${settings.value.searchPageWallpaperMaskOpacity}%`)
  else
    bewlyElement.style.setProperty('--bew-homepage-bg-mask-opacity', `${settings.value.wallpaperMaskOpacity}%`)
}
</script>

<template>
  <div>
    <!-- linear gradient background -->
    <Transition name="fade">
      <div
        v-if="settings.useLinearGradientThemeColorBackground && isDark"
        :style="{
          opacity: activatedPage === AppPage.Search ? 1 : 0.4,
          background: themeColorLinearGradientBackground,
        }"
        pos="absolute top-0 left-0" w-full h-full z-0 pointer-events-none
      />
    </Transition>

    <Transition name="fade">
      <div v-if="activatedPage === AppPage.Search">
        <!-- background -->
        <div
          pos="absolute top-0 left-0" w-full h-full duration-300 bg="cover center $bew-homepage-bg"
          z--1 transform-gpu
          :style="{ backgroundImage: `url('${currentWallpaperUrl}')` }"
        />
        <!-- background mask -->
        <Transition name="fade">
          <div
            v-if="(!settings.individuallySetSearchPageWallpaper && settings.enableWallpaperMasking) || (settings.searchPageEnableWallpaperMasking)"
            pos="absolute top-0 left-0" w-full h-full pointer-events-none
            duration-300 z--1 transform-gpu
          >
            <!-- 模糊图层 -->
            <div
              v-if="currentBlurredWallpaperUrl"
              pos="absolute top-0 left-0" w-full h-full
              :style="{
                backgroundImage: `url('${currentBlurredWallpaperUrl}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }"
            />
            <!-- 半透明蒙层叠加 -->
            <div
              pos="absolute top-0 left-0" w-full h-full
              :style="{
                backgroundColor: `var(--bew-homepage-bg-mask)`,
              }"
            />
          </div>
        </Transition>

        <!-- Loading indicator for local images -->
        <Transition name="fade">
          <div
            v-if="(isGeneratingBlur || isGeneratingSearchPageBlur) && (!currentBlurredWallpaperUrl)"
            pos="fixed top-20 left-1/2" transform="translate-x--1/2"
            bg="$bew-elevated" backdrop-blur-8px
            px-6 py-3 rounded-full shadow="$bew-shadow-2"
            z-999 flex="~ items-center gap-3"
            text="sm $bew-text-1"
          >
            <div w-4 h-4 border="2 $bew-theme-color-auto t-transparent" rounded-full animate-spin />
            <span>{{ $t('common.loading') }}...</span>
          </div>
        </Transition>
      </div>
      <div v-else>
        <!-- background -->
        <div
          :style="{ backgroundImage: `url('${currentWallpaperUrl}')` }"
          pos="absolute top-0 left-0" w-full h-full duration-300 bg="cover center $bew-homepage-bg"
          z--1 transform-gpu
        />

        <!-- background mask -->
        <Transition name="fade">
          <div
            v-if="settings.enableWallpaperMasking"
            pos="absolute top-0 left-0" w-full h-full pointer-events-none
            duration-300 z--1 transform-gpu
          >
            <!-- 模糊图层 -->
            <div
              v-if="currentBlurredWallpaperUrl"
              pos="absolute top-0 left-0" w-full h-full
              :style="{
                backgroundImage: `url('${currentBlurredWallpaperUrl}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }"
            />
            <!-- 半透明蒙层叠加 -->
            <div
              pos="absolute top-0 left-0" w-full h-full
              :style="{
                backgroundColor: `var(--bew-homepage-bg-mask)`,
              }"
            />
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>
