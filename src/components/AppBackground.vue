<script setup lang="ts">
import type { ComputedRef, CSSProperties } from 'vue'

import { useDark } from '~/composables/useDark'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { hexToHSL } from '~/utils/main'
import { resolveWallpaperSource } from '~/utils/wallpaper'
import { cleanupExpiredCache } from '~/utils/wallpaperCache'

const props = defineProps<{ activatedPage: AppPage }>()
const emit = defineEmits<{ wallpaperReady: [ready: boolean] }>()

const { isDark } = useDark()

// 组件挂载时清理过期缓存
onMounted(() => {
  cleanupExpiredCache()
})

function waitForWallpaperDecode(url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      resolve()
      return
    }

    const image = new Image()
    let settled = false
    let decoding = false

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', handleAbort)
      image.removeAttribute('src')
    }
    function handleAbort() {
      if (settled) return

      settled = true
      cleanup()
      resolve()
    }
    const handleLoad = async () => {
      if (settled || decoding) return

      decoding = true
      try {
        await image.decode()
      } catch {
        // load 已成功时仍允许展示；部分浏览器会对已解码图片拒绝重复 decode。
      }
      if (settled) return

      settled = true
      cleanup()
      resolve()
    }
    const handleError = () => {
      if (settled) return

      settled = true
      cleanup()
      reject(new Error('Failed to load wallpaper'))
    }

    image.decoding = 'async'
    image.onload = () => void handleLoad()
    image.onerror = handleError
    signal.addEventListener('abort', handleAbort, { once: true })
    image.src = url

    // data URL 或内存缓存可能在监听器注册后已经完成加载。
    if (image.complete) {
      if (image.naturalWidth > 0) void handleLoad()
      else handleError()
    }
  })
}

function useResolvedWallpaper(sourceUrl: ComputedRef<string>, cacheTime: ComputedRef<number>) {
  const resolved = ref('')

  // 逐项监听壁纸来源和缓存时间，避免无关设置触发大图重复加载、解码。
  watch(
    [sourceUrl, cacheTime],
    ([originalUrl, newCacheTime], oldValue, onCleanup) => {
      const controller = new AbortController()
      onCleanup(() => controller.abort())
      // 如果缓存时间改变,用新的缓存时间清理可能已过期的缓存
      if (oldValue && newCacheTime !== oldValue[1]) {
        cleanupExpiredCache(newCacheTime)
      }

      void (async () => {
        const resolvedUrl = await resolveWallpaperSource(originalUrl, newCacheTime)
        if (controller.signal.aborted) return

        if (!resolvedUrl) {
          resolved.value = ''
          return
        }

        try {
          await waitForWallpaperDecode(resolvedUrl, controller.signal)
          if (!controller.signal.aborted) resolved.value = resolvedUrl
        } catch {
          if (!controller.signal.aborted) resolved.value = ''
        }
      })()
    },
    { immediate: true },
  )

  return resolved
}

const globalCacheTime = computed(() => settings.value.wallpaperCacheTime)
const searchPageCacheTime = computed(() => settings.value.searchPageWallpaperCacheTime)

const globalLightWallpaperSource = computed(() => settings.value.wallpaper)
const globalDarkWallpaperSource = computed(() => {
  if (!settings.value.individuallySetDarkModeWallpaper) return ''
  return settings.value.darkModeWallpaper === settings.value.wallpaper
    ? ''
    : settings.value.darkModeWallpaper
})

const searchLightWallpaperSource = computed(() =>
  settings.value.individuallySetSearchPageWallpaper ? settings.value.searchPageWallpaper : '',
)
const searchDarkWallpaperSource = computed(() => {
  if (
    !settings.value.individuallySetSearchPageWallpaper ||
    !settings.value.searchPageIndividuallySetDarkModeWallpaper
  )
    return ''
  return settings.value.searchPageDarkModeWallpaper === settings.value.searchPageWallpaper
    ? ''
    : settings.value.searchPageDarkModeWallpaper
})

// 开启深浅色独立壁纸时预解码两套壁纸，切换主题时可同步切换，避免过渡闪烁。
const resolvedGlobalLightWallpaper = useResolvedWallpaper(
  globalLightWallpaperSource,
  globalCacheTime,
)
const resolvedGlobalDarkWallpaper = useResolvedWallpaper(globalDarkWallpaperSource, globalCacheTime)
const resolvedSearchLightWallpaper = useResolvedWallpaper(
  searchLightWallpaperSource,
  searchPageCacheTime,
)
const resolvedSearchDarkWallpaper = useResolvedWallpaper(
  searchDarkWallpaperSource,
  searchPageCacheTime,
)

const resolvedWallpaper = computed(() => {
  if (isDark.value && settings.value.individuallySetDarkModeWallpaper) {
    return settings.value.darkModeWallpaper === settings.value.wallpaper
      ? resolvedGlobalLightWallpaper.value
      : resolvedGlobalDarkWallpaper.value
  }
  return resolvedGlobalLightWallpaper.value
})

const resolvedSearchPageWallpaper = computed(() => {
  if (isDark.value && settings.value.searchPageIndividuallySetDarkModeWallpaper) {
    return settings.value.searchPageDarkModeWallpaper === settings.value.searchPageWallpaper
      ? resolvedSearchLightWallpaper.value
      : resolvedSearchDarkWallpaper.value
  }
  return resolvedSearchLightWallpaper.value
})

// 计算当前页面使用的壁纸URL
const currentWallpaperUrl = computed(() => {
  if (props.activatedPage === AppPage.Search && settings.value.individuallySetSearchPageWallpaper) {
    return resolvedSearchPageWallpaper.value
  }
  return resolvedWallpaper.value
})

// 控件只在实际壁纸解码成功后使用融合底色，加载失败时仍保持普通页面的可读性。
watch(currentWallpaperUrl, (url) => emit('wallpaperReady', Boolean(url)), { immediate: true })
onBeforeUnmount(() => emit('wallpaperReady', false))

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

watch(
  () => settings.value.wallpaperMaskOpacity,
  () => {
    setAppWallpaperMaskingOpacity()
  },
)

watch(
  () => settings.value.searchPageWallpaperMaskOpacity,
  () => {
    setAppWallpaperMaskingOpacity()
  },
)

watch(
  () => props.activatedPage,
  (newValue, oldValue) => {
    // If u have set the `individuallySetSearchPageWallpaper`, reapply the wallpaper when the new page is search page
    // or when switching from a search page to another page, since search page has its own wallpaper.
    const isSearchPage = (page: AppPage) => page === AppPage.Search
    if (
      settings.value.individuallySetSearchPageWallpaper &&
      (isSearchPage(newValue) || isSearchPage(oldValue))
    )
      setAppWallpaperMaskingOpacity()
  },
)

function setAppWallpaperMaskingOpacity() {
  const bewlyElement = document.querySelector<HTMLElement>('#bewly')
  if (!bewlyElement) return

  const isSearchPage = props.activatedPage === AppPage.Search
  if (settings.value.individuallySetSearchPageWallpaper && isSearchPage)
    bewlyElement.style.setProperty(
      '--bew-homepage-bg-mask-opacity',
      `${settings.value.searchPageWallpaperMaskOpacity}%`,
    )
  else
    bewlyElement.style.setProperty(
      '--bew-homepage-bg-mask-opacity',
      `${settings.value.wallpaperMaskOpacity}%`,
    )
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
        pos="absolute top-0 left-0"
        w-full
        h-full
        z-0
        pointer-events-none
      />
    </Transition>

    <Transition name="fade">
      <div v-if="activatedPage === AppPage.Search">
        <!-- background -->
        <div
          pos="absolute top-0 left-0"
          w-full
          h-full
          duration-300
          bg="cover center $bew-homepage-bg"
          z--1
          :style="{
            backgroundImage: currentWallpaperUrl ? `url('${currentWallpaperUrl}')` : 'none',
          }"
        />
        <!-- background mask -->
        <Transition name="fade">
          <div
            v-if="
              (!settings.individuallySetSearchPageWallpaper && settings.enableWallpaperMasking) ||
              settings.searchPageEnableWallpaperMasking
            "
            pos="absolute top-0 left-0"
            w-full
            h-full
            pointer-events-none
            bg="$bew-homepage-bg-mask"
            z--1
            :style="wallpaperMaskStyle"
          />
        </Transition>
      </div>
      <div v-else>
        <!-- background -->
        <div
          :style="{
            backgroundImage: currentWallpaperUrl ? `url('${currentWallpaperUrl}')` : 'none',
          }"
          pos="absolute top-0 left-0"
          w-full
          h-full
          duration-300
          bg="cover center $bew-homepage-bg"
          z--1
        />

        <!-- background mask -->
        <Transition name="fade">
          <div
            v-if="settings.enableWallpaperMasking"
            pos="absolute top-0 left-0"
            w-full
            h-full
            pointer-events-none
            bg="$bew-homepage-bg-mask"
            z--1
            :style="wallpaperMaskStyle"
          />
        </Transition>
      </div>
    </Transition>
  </div>
</template>
