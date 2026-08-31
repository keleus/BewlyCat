<script setup lang="ts">
import type { CSSProperties } from 'vue'

import { useDark } from '~/composables/useDark'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { isLocalWallpaperUrl, resolveWallpaperUrl } from '~/utils/localWallpaper'
import { hexToHSL } from '~/utils/main'
import { cleanupExpiredCache, getOrCacheWallpaper } from '~/utils/wallpaperCache'

const props = defineProps<{ activatedPage: AppPage }>()

const { isDark } = useDark()

// 组件挂载时清理过期缓存
onMounted(() => {
  cleanupExpiredCache()
})

// 计算解析后的壁纸URL(支持本地壁纸和缓存控制)
const resolvedWallpaper = ref('')
const resolvedSearchPageWallpaper = ref('')
let globalWallpaperRequestId = 0
let searchWallpaperRequestId = 0

function waitForWallpaperDecode(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    let settled = false

    const cleanup = () => {
      image.onload = null
      image.onerror = null
    }
    const handleLoad = async () => {
      if (settled)
        return

      settled = true
      cleanup()
      try {
        await image.decode()
      }
      catch {
        // load 已成功时仍允许展示；部分浏览器会对已解码图片拒绝重复 decode。
      }
      resolve()
    }
    const handleError = () => {
      if (settled)
        return

      settled = true
      cleanup()
      reject(new Error('Failed to load wallpaper'))
    }

    image.decoding = 'async'
    image.onload = () => void handleLoad()
    image.onerror = handleError
    image.src = url

    // data URL 或内存缓存可能在监听器注册后已经完成加载。
    if (image.complete) {
      if (image.naturalWidth > 0)
        void handleLoad()
      else
        handleError()
    }
  })
}

async function resolveWallpaperSource(originalUrl: string, cacheTime: number): Promise<string> {
  if (isLocalWallpaperUrl(originalUrl))
    return resolveWallpaperUrl(originalUrl) || ''

  return originalUrl ? await getOrCacheWallpaper(originalUrl, cacheTime) : ''
}

// 解析全局壁纸
async function resolveGlobalWallpaper() {
  const requestId = ++globalWallpaperRequestId
  const originalUrl = settings.value.wallpaper
  const resolvedUrl = await resolveWallpaperSource(originalUrl, settings.value.wallpaperCacheTime)
  if (requestId !== globalWallpaperRequestId)
    return

  if (!resolvedUrl) {
    resolvedWallpaper.value = ''
    return
  }

  try {
    await waitForWallpaperDecode(resolvedUrl)
    if (requestId === globalWallpaperRequestId)
      resolvedWallpaper.value = resolvedUrl
  }
  catch {
    if (requestId === globalWallpaperRequestId)
      resolvedWallpaper.value = ''
  }
}

// 解析搜索页壁纸
async function resolveSearchWallpaper() {
  const requestId = ++searchWallpaperRequestId
  const originalUrl = settings.value.searchPageWallpaper
  const resolvedUrl = await resolveWallpaperSource(originalUrl, settings.value.searchPageWallpaperCacheTime)
  if (requestId !== searchWallpaperRequestId)
    return

  if (!resolvedUrl) {
    resolvedSearchPageWallpaper.value = ''
    return
  }

  try {
    await waitForWallpaperDecode(resolvedUrl)
    if (requestId === searchWallpaperRequestId)
      resolvedSearchPageWallpaper.value = resolvedUrl
  }
  catch {
    if (requestId === searchWallpaperRequestId)
      resolvedSearchPageWallpaper.value = ''
  }
}

// 监听设置变化,重新解析壁纸
watch(() => [settings.value.wallpaper, settings.value.wallpaperCacheTime], ([, newCacheTime], oldValue) => {
  // 如果缓存时间改变,用新的缓存时间清理可能已过期的缓存
  if (oldValue && newCacheTime !== oldValue[1]) {
    cleanupExpiredCache(newCacheTime as number)
  }
  void resolveGlobalWallpaper()
}, { immediate: true })

watch(() => [settings.value.searchPageWallpaper, settings.value.searchPageWallpaperCacheTime], ([, newCacheTime], oldValue) => {
  // 如果缓存时间改变,用新的缓存时间清理可能已过期的缓存
  if (oldValue && newCacheTime !== oldValue[1]) {
    cleanupExpiredCache(newCacheTime as number)
  }
  void resolveSearchWallpaper()
}, { immediate: true })

// 计算当前页面使用的壁纸URL
const currentWallpaperUrl = computed(() => {
  if (props.activatedPage === AppPage.Search && settings.value.individuallySetSearchPageWallpaper) {
    return resolvedSearchPageWallpaper.value
  }
  return resolvedWallpaper.value
})

const currentWallpaperBlurIntensity = computed(() => {
  if (props.activatedPage === AppPage.Search && settings.value.individuallySetSearchPageWallpaper)
    return settings.value.searchPageWallpaperBlurIntensity

  return settings.value.wallpaperBlurIntensity
})

const wallpaperMaskStyle = computed((): CSSProperties => {
  const wallpaperReady = Boolean(currentWallpaperUrl.value)
  const blurIntensity = currentWallpaperBlurIntensity.value
  const backdropFilter = wallpaperReady && blurIntensity > 0 ? `blur(${blurIntensity}px)` : 'none'

  return {
    visibility: wallpaperReady ? 'visible' : 'hidden',
    backdropFilter,
    WebkitBackdropFilter: backdropFilter,
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
  const bewlyElement = document.querySelector<HTMLElement>('#bewly')
  if (!bewlyElement)
    return

  const isSearchPage = props.activatedPage === AppPage.Search
  if (settings.value.individuallySetSearchPageWallpaper && isSearchPage)
    bewlyElement.style.setProperty('--bew-homepage-bg-mask-opacity', `${settings.value.searchPageWallpaperMaskOpacity}%`)
  else
    bewlyElement.style.setProperty('--bew-homepage-bg-mask-opacity', `${settings.value.wallpaperMaskOpacity}%`)
}

// setup 阶段即写入遮罩透明度，避免首帧沿用 token 的 0 默认值。
setAppWallpaperMaskingOpacity()
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
          z--1
          :style="{ backgroundImage: `url('${currentWallpaperUrl}')` }"
        />
        <!-- background mask -->
        <Transition name="fade">
          <div
            v-if="(!settings.individuallySetSearchPageWallpaper && settings.enableWallpaperMasking) || (settings.searchPageEnableWallpaperMasking)"
            pos="absolute top-0 left-0" w-full h-full pointer-events-none bg="$bew-homepage-bg-mask"
            z--1
            :style="wallpaperMaskStyle"
          />
        </Transition>
      </div>
      <div v-else>
        <!-- background -->
        <div
          :style="{ backgroundImage: `url('${currentWallpaperUrl}')` }"
          pos="absolute top-0 left-0" w-full h-full duration-300 bg="cover center $bew-homepage-bg"
          z--1
        />

        <!-- background mask -->
        <Transition name="fade">
          <div
            v-if="settings.enableWallpaperMasking"
            pos="absolute top-0 left-0" w-full h-full pointer-events-none bg="$bew-homepage-bg-mask"
            z--1
            :style="wallpaperMaskStyle"
          />
        </Transition>
      </div>
    </Transition>
  </div>
</template>
