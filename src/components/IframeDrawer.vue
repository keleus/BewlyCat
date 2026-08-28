<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

import { DrawerType, useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { isHomePage, isInIframe } from '~/utils/main'
import { lockPageScroll, unlockPageScroll } from '~/utils/pageScrollLock'

// TODO: support shortcuts like `Ctrl+Alt+T` to open in new tab, `Esc` to close

const props = defineProps<{
  url: string
  title?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { isDark } = useDark()
const { activeDrawer, setActiveDrawer } = useBewlyApp()

const show = ref(false)
const headerShow = ref(true)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref<string>(props.url)
const showIframe = ref<boolean>(false)
const renderIframe = ref<boolean>(true)
const iframeKey = ref(0)
const delayCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const removeTopBarClassInjected = ref<boolean>(false)
const originUrl = ref<string>()
const isPageFullscreen = ref<boolean>(false)
const isPageScrollLocked = ref(false)
const isEscPressed = ref<boolean>(false)
const escPressedTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const disableEscPress = ref<boolean>(false)
const isClosing = ref(false)
let stopIframePushStateListener: (() => void) | null = null
let stopIframePopStateListener: (() => void) | null = null
let stopIframeDOMContentLoadedListener: (() => void) | null = null
let focusRetryTimer: ReturnType<typeof setTimeout> | null = null
let initialDarkModeTimer: ReturnType<typeof setTimeout> | null = null

// 计算iframe容器的样式
const iframeContainerClasses = computed(() => {
  if (isPageFullscreen.value) {
    return 'pos-fixed top-0 left-0 w-full h-full z-999999'
  }
  else {
    const topPosition = headerShow.value ? 'top-$bew-top-bar-height' : 'top-0'
    // 修正高度：使用 calc(100% - top位置) 确保容器不会超出可视区域
    const height = headerShow.value ? 'h-[calc(100%-var(--bew-top-bar-height))]' : 'h-full'
    return `pos-absolute ${topPosition} left-0 of-hidden bg-$bew-bg rounded-t-$bew-radius w-full ${height}`
  }
})

const iframeStyles = computed(() => {
  if (isPageFullscreen.value) {
    return {}
  }
  else {
    // 不再需要负偏移，因为容器高度已经正确设置
    return {
      top: '0',
    }
  }
})

useEventListener(window, 'popstate', updateIframeUrl)

// 监听黑暗模式变化
watch(() => isDark.value, (newValue) => {
  if (iframeRef.value?.contentWindow) {
    try {
      iframeRef.value.contentWindow.postMessage({
        type: IFRAME_DARK_MODE_CHANGE,
        isDark: newValue,
      }, '*')
    }
    catch (error) {
      console.warn('Failed to send dark mode change message to iframe:', error)
    }
  }
})

// 监听深色模式基准颜色变化
watch(() => settings.value.darkModeBaseColor, (newColor) => {
  if (iframeRef.value?.contentWindow && isDark.value) {
    try {
      iframeRef.value.contentWindow.postMessage({
        type: IFRAME_DARK_MODE_CHANGE,
        isDark: isDark.value,
        darkModeBaseColor: newColor,
      }, '*')
    }
    catch (error) {
      console.warn('Failed to send dark mode base color change message to iframe:', error)
    }
  }
})

// 监听iframe加载状态，加载完成后发送初始的黑暗模式状态
watch(() => showIframe.value, (newValue) => {
  if (initialDarkModeTimer) {
    clearTimeout(initialDarkModeTimer)
    initialDarkModeTimer = null
  }

  if (newValue && iframeRef.value?.contentWindow) {
    initialDarkModeTimer = setTimeout(() => {
      initialDarkModeTimer = null
      try {
        iframeRef.value?.contentWindow?.postMessage({
          type: IFRAME_DARK_MODE_CHANGE,
          isDark: isDark.value,
          darkModeBaseColor: settings.value.darkModeBaseColor,
        }, '*')
      }
      catch (error) {
        console.warn('Failed to send initial dark mode state to iframe:', error)
      }
    }, 500) // 稍长的延迟确保iframe完全加载
  }
})

watch(() => props.url, async (newUrl, oldUrl) => {
  if (!show.value || newUrl === oldUrl)
    return

  history.replaceState(null, '', newUrl.replace(/\/$/, ''))
  await remountIframe(newUrl)
})

function cleanupIframeWindowListeners() {
  stopIframePushStateListener?.()
  stopIframePopStateListener?.()
  stopIframeDOMContentLoadedListener?.()
  stopIframePushStateListener = null
  stopIframePopStateListener = null
  stopIframeDOMContentLoadedListener = null
}

function clearFocusRetryTimer() {
  if (focusRetryTimer) {
    clearTimeout(focusRetryTimer)
    focusRetryTimer = null
  }
}

function clearDrawerTimers() {
  clearFocusRetryTimer()
  if (initialDarkModeTimer) {
    clearTimeout(initialDarkModeTimer)
    initialDarkModeTimer = null
  }
  if (escPressedTimer.value) {
    clearTimeout(escPressedTimer.value)
    escPressedTimer.value = null
  }
}

function focusIframe(retryCount = 3) {
  clearFocusRetryTimer()

  nextTick(() => {
    requestAnimationFrame(() => {
      const iframe = iframeRef.value
      if (!iframe || !show.value || activeDrawer.value !== DrawerType.IframeDrawer)
        return

      iframe.focus({ preventScroll: true })
      try {
        iframe.contentWindow?.focus()
      }
      catch {
        // Cross-origin frames may block direct window focus.
      }

      if (retryCount > 0) {
        focusRetryTimer = setTimeout(() => {
          focusIframe(retryCount - 1)
        }, 120)
      }
    })
  })
}

function injectStyleClass() {
  if (headerShow.value && iframeRef.value?.contentWindow?.document) {
    try {
      iframeRef.value.contentWindow.document.documentElement.classList.add('remove-top-bar-without-placeholder')
      removeTopBarClassInjected.value = true
    }
    catch (error) {
      console.warn('Failed to inject style class:', error)
    }
  }
}

function handleIframeLoad() {
  if (isClosing.value || !renderIframe.value)
    return

  const iframeWindow = iframeRef.value?.contentWindow
  if (!iframeWindow) {
    console.error('Iframe or contentWindow is not available')
    return
  }

  cleanupIframeWindowListeners()
  injectStyleClass()
  stopIframePushStateListener = useEventListener(iframeWindow, 'pushstate', updateCurrentUrl)
  stopIframePopStateListener = useEventListener(iframeWindow, 'popstate', updateCurrentUrl)
  stopIframeDOMContentLoadedListener = useEventListener(iframeWindow, 'DOMContentLoaded', injectStyleClass)
  showIframe.value = true
  focusIframe()
}

async function remountIframe(url: string) {
  await releaseIframeResources()
  currentUrl.value = url
  iframeKey.value += 1
  renderIframe.value = true
  await nextTick()
}

onMounted(() => {
  originUrl.value = window.location.href
  history.pushState(null, '', props.url)
  show.value = true
  headerShow.value = true
  currentUrl.value = props.url
  renderIframe.value = true
  setActiveDrawer(DrawerType.IframeDrawer) // 设置为当前活跃抽屉
  if (!isPageScrollLocked.value) {
    lockPageScroll()
    isPageScrollLocked.value = true
  }
})

onBeforeUnmount(() => {
  isClosing.value = true
  cleanupIframeWindowListeners()
  if (activeDrawer.value === DrawerType.IframeDrawer)
    setActiveDrawer(DrawerType.None)
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
    delayCloseTimer.value = null
  }
  clearDrawerTimers()
  void releaseIframeResources()
})

onUnmounted(() => {
  history.replaceState(null, '', originUrl.value)
})

function updateCurrentUrl(e: any) {
  if (!iframeRef.value?.contentWindow) {
    console.error('iframe contentWindow not available')
    return
  }
  let newUrl = iframeRef.value.contentWindow.location.href
  if (e.type === 'pushstate' && Array.isArray(e.detail) && e.detail.length === 3 && e.detail[2]) {
    newUrl = String(e.detail[2])
  }
  newUrl = newUrl.replace(/\/$/, '')
  if (newUrl && newUrl !== 'about:blank') {
    history.replaceState(null, '', newUrl)
  }
}

async function updateIframeUrl() {
  if (isHomePage()) {
    await handleClose()
    return
  }
  await nextTick()

  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.location.replace(location.href.replace(/\/$/, ''))
  }
}

async function handleClose() {
  if (isClosing.value)
    return

  isClosing.value = true
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
  }
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  show.value = false
  headerShow.value = false
  setActiveDrawer(DrawerType.None) // 清除活跃抽屉状态
  await releaseIframeResources()
  delayCloseTimer.value = setTimeout(() => {
    delayCloseTimer.value = null
    emit('close')
  }, 300)
}

async function releaseIframeResources() {
  clearDrawerTimers()
  cleanupIframeWindowListeners()
  showIframe.value = false
  removeTopBarClassInjected.value = false

  const iframe = iframeRef.value
  if (!iframe) {
    renderIframe.value = false
    return
  }

  // 同源抽屉在销毁 browsing context 前主动停掉媒体管线，避免视频解码器、
  // MediaSource 和音频节点继续占用资源直到浏览器下一次 GC。
  try {
    iframe.contentDocument?.querySelectorAll<HTMLMediaElement>('video, audio').forEach((media) => {
      media.pause()
      media.srcObject = null
      media.removeAttribute('src')
      media.querySelectorAll('source').forEach(source => source.removeAttribute('src'))
      media.load()
    })
  }
  catch {
    // sandbox/cross-origin 场景交给 about:blank 导航释放。
  }

  // Navigate to about:blank and close browsing context BEFORE removing from DOM.
  // Previously, renderIframe was set to false first, which removed the iframe via v-if
  // and made iframeRef null — so contentWindow.close() was never actually called.
  // This is especially important for Firefox which doesn't always release media
  // resources (video decoders, buffers) when an iframe is simply removed from DOM.
  currentUrl.value = 'about:blank'
  iframe.src = 'about:blank'

  try {
    iframe.contentWindow?.close()
  }
  catch {
    // Cross-origin may block this
  }

  // Now safe to remove from DOM
  renderIframe.value = false
  await nextTick()
  if (iframeRef.value === iframe)
    iframeRef.value = null
}

function handleOpenInNewTab() {
  if (iframeRef.value) {
    window.open(iframeRef.value.contentWindow?.location.href.replace(/\/$/, ''), '_blank')
    handleClose()
  }
}

function resetEscPressedState() {
  if (escPressedTimer.value) {
    clearTimeout(escPressedTimer.value)
    escPressedTimer.value = null
  }
  isEscPressed.value = false
}

/**
 * Listen to Escape key on the main window using capture phase
 * Only active when this drawer is the active drawer
 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' && e.code !== 'Escape')
    return
  if (e.repeat || e.isComposing)
    return

  // Only handle when this drawer is the active drawer
  if (activeDrawer.value !== DrawerType.IframeDrawer)
    return

  // 捕获阶段不抢占 ESC；Dialog、Pop、全屏等内部功能处理完仍未消费时，才兜底关闭抽屉。
  const hadEscapePriorityState = disableEscPress.value
    || isPageFullscreen.value
    || !!(document.fullscreenElement
      || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement)

  window.setTimeout(() => {
    if (hadEscapePriorityState
      || disableEscPress.value
      || isPageFullscreen.value
      || e.defaultPrevented
      || e.cancelBubble
      || activeDrawer.value !== DrawerType.IframeDrawer) {
      return
    }

    if (settings.value.closeDrawerWithoutPressingEscAgain) {
      if (escPressedTimer.value) {
        clearTimeout(escPressedTimer.value)
        escPressedTimer.value = null
      }
      handleClose()
      return
    }
    if (isEscPressed.value) {
      handleClose()
    }
    else {
      isEscPressed.value = true
      if (escPressedTimer.value)
        clearTimeout(escPressedTimer.value)
      escPressedTimer.value = setTimeout(() => {
        escPressedTimer.value = null
        isEscPressed.value = false
      }, 1300)
    }
  }, 0)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})

function handleWindowMessage({ data, source }: MessageEvent) {
  if (source !== iframeRef.value?.contentWindow)
    return

  const messageType = data && typeof data === 'object' ? data.type : data
  switch (messageType) {
    case DRAWER_VIDEO_ENTER_PAGE_FULL:
      headerShow.value = false
      disableEscPress.value = true
      isPageFullscreen.value = true
      break
    case DRAWER_VIDEO_EXIT_PAGE_FULL:
      headerShow.value = true
      disableEscPress.value = false
      isPageFullscreen.value = false
      break
    case 'BEWLY_DRAWER_ESCAPE_HANDLED':
      resetEscPressedState()
      break
    case 'BEWLY_DRAWER_CLOSE_REQUEST':
      // 来自 iframe 的关闭请求
      if (data.source === 'iframe' && activeDrawer.value === DrawerType.IframeDrawer) {
        if (settings.value.closeDrawerWithoutPressingEscAgain) {
          handleClose()
        }
        else if (isEscPressed.value) {
          handleClose()
        }
        else {
          isEscPressed.value = true
          if (escPressedTimer.value)
            clearTimeout(escPressedTimer.value)
          escPressedTimer.value = setTimeout(() => {
            escPressedTimer.value = null
            isEscPressed.value = false
          }, 1300)
        }
      }
      break
  }
}

if (!isInIframe()) {
  useEventListener(window, 'message', handleWindowMessage)
}
</script>

<template>
  <div
    pos="absolute top-0 left-0" of-hidden w-full h-full
    z-999999
  >
    <!-- Mask (only show in drawer mode, not in fullscreen) -->
    <Transition name="fade">
      <div
        v-if="show && !isPageFullscreen"
        pos="absolute bottom-0 left-0" w-full h-full bg="black opacity-60"
        @click="handleClose"
      />
    </Transition>

    <Transition name="fade">
      <div
        v-if="headerShow"
        pos="relative top-0" flex="~ items-center justify-end gap-2"
        max-w="$bew-page-max-width" w-full h="$bew-top-bar-height"
        m-auto px-4
        pointer-events-none
      >
        <Button
          style="
            --b-button-color: var(--bew-elevated-solid);
            --b-button-color-hover: var(--bew-elevated-solid-hover);
          "
          pointer-events-auto
          @click="handleOpenInNewTab"
        >
          <template #left>
            <i i-mingcute:external-link-line />
          </template>
          {{ $t('iframe_drawer.open_in_new_tab') }}
          <!-- <div flex="~">
            <kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>T</kbd>
          </div> -->
        </Button>
        <Button
          v-if="!isEscPressed"
          style="
            --b-button-color: var(--bew-elevated-solid);
            --b-button-color-hover: var(--bew-elevated-solid-hover);
          "
          pointer-events-auto
          @click="handleClose"
        >
          <template #left>
            <i i-mingcute:close-line />
          </template>
          {{ $t('iframe_drawer.close') }}
          <kbd>Esc</kbd>
        </Button>
        <Button
          v-else
          type="error"
          @click="handleClose"
        >
          <template #left>
            <i i-mingcute:close-line />
          </template>
          {{ $t('iframe_drawer.press_esc_again_to_close') }}
          <kbd>Esc</kbd>
        </Button>
      </div>
    </Transition>

    <!-- Iframe Container -->
    <Transition :name="isPageFullscreen ? 'fade' : 'drawer'">
      <div
        v-if="show"
        :class="iframeContainerClasses"
      >
        <Transition name="fade">
          <iframe
            v-if="renderIframe"
            v-show="showIframe"
            :key="iframeKey"
            ref="iframeRef"
            :src="currentUrl"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
            :style="iframeStyles"
            frameborder="0"
            tabindex="-1"
            pointer-events-auto
            :pos="isPageFullscreen ? undefined : 'relative left-0'"
            allow="fullscreen"
            w-full
            h-full
            @load="handleIframeLoad"
          />
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.3s;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(100%);
}
</style>
