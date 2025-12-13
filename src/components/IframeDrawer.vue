<script setup lang="ts">
import { onKeyStroke, useEventListener } from '@vueuse/core'

import { DrawerType, useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { DRAWER_VIDEO_ENTER_PAGE_FULL, DRAWER_VIDEO_EXIT_PAGE_FULL, IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { isHomePage, isInIframe } from '~/utils/main'

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
const delayCloseTimer = ref<NodeJS.Timeout | null>(null)
const removeTopBarClassInjected = ref<boolean>(false)
const originUrl = ref<string>()
const isPageFullscreen = ref<boolean>(false)

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
  if (newValue && iframeRef.value?.contentWindow) {
    setTimeout(() => {
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

function setupIframeListeners() {
  if (!(iframeRef.value && iframeRef.value.contentWindow)) {
    console.error('Iframe or contentWindow is not available')
    return
  }

  // 尽早注入样式类，避免顶栏闪烁
  const injectStyleClass = () => {
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

  // 在 iframe 加载时立即尝试注入
  useEventListener(iframeRef.value, 'load', () => {
    injectStyleClass()

    useEventListener(iframeRef.value?.contentWindow, 'pushstate', updateCurrentUrl)
    useEventListener(iframeRef.value?.contentWindow, 'popstate', updateCurrentUrl)

    // DOMContentLoaded 时再次确保已注入
    useEventListener(iframeRef.value?.contentWindow, 'DOMContentLoaded', () => {
      injectStyleClass()
    })

    iframeRef.value?.focus()
  })
}
onMounted(() => {
  console.log('[IframeDrawer] onMounted called')
  originUrl.value = window.location.href
  history.pushState(null, '', props.url)
  show.value = true
  headerShow.value = true
  setActiveDrawer(DrawerType.IframeDrawer) // 设置为当前活跃抽屉
  console.log('[IframeDrawer] show.value:', show.value, 'activeDrawer:', activeDrawer.value)
  nextTick(() => {
    if (iframeRef.value) {
      setupIframeListeners()
    }
  })
})

onBeforeUnmount(() => {
  releaseIframeResources()
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
  console.log('[IframeDrawer] handleClose called')
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
  }
  await releaseIframeResources()
  show.value = false
  headerShow.value = false
  setActiveDrawer(DrawerType.None) // 清除活跃抽屉状态
  console.log('[IframeDrawer] show.value:', show.value, 'activeDrawer:', activeDrawer.value)
  delayCloseTimer.value = setTimeout(() => {
    emit('close')
  }, 300)
}

async function releaseIframeResources() {
  // Clear iframe content
  currentUrl.value = 'about:blank'
  /**
   * eg: When use 'iframeRef.value?.contentWindow?.document' of t.bilibili.com iframe on bilibili.com, there may be cross domain issues
   * set the src to 'about:blank' to avoid this issue, it also can release the memory
   */
  if (iframeRef.value) {
    iframeRef.value.src = 'about:blank'
  }
  await nextTick()
  iframeRef.value?.contentWindow?.close()

  // Remove iframe from the DOM
  iframeRef.value?.parentNode?.removeChild(iframeRef.value)
  await nextTick()

  // Nullify the reference
  iframeRef.value = null
}

function handleOpenInNewTab() {
  if (iframeRef.value) {
    window.open(iframeRef.value.contentWindow?.location.href.replace(/\/$/, ''), '_blank')
    handleClose()
  }
}

const isEscPressed = ref<boolean>(false)
const escPressedTimer = ref<NodeJS.Timeout | null>(null)
const disableEscPress = ref<boolean>(false)

/**
 * Listen to Escape key on the main window, not iframe
 * Only active when this drawer is the active drawer
 */
onKeyStroke('Escape', (e: KeyboardEvent) => {
  console.log('[IframeDrawer] ESC key pressed!')
  console.log('[IframeDrawer] show.value:', show.value)
  console.log('[IframeDrawer] activeDrawer.value:', activeDrawer.value)
  console.log('[IframeDrawer] DrawerType.IframeDrawer:', DrawerType.IframeDrawer)
  console.log('[IframeDrawer] Match:', activeDrawer.value === DrawerType.IframeDrawer)

  // Only handle when this drawer is the active drawer
  if (activeDrawer.value !== DrawerType.IframeDrawer) {
    console.log('[IframeDrawer] Not active drawer, ignoring ESC')
    return
  }

  console.log('[IframeDrawer] Processing ESC key')
  e.preventDefault()
  if (settings.value.closeDrawerWithoutPressingEscAgain) {
    console.log('[IframeDrawer] closeDrawerWithoutPressingEscAgain = true, closing immediately')
    clearTimeout(escPressedTimer.value!)
    handleClose()
    return
  }
  console.log('[IframeDrawer] disableEscPress:', disableEscPress.value)
  console.log('[IframeDrawer] isEscPressed:', isEscPressed.value)
  if (disableEscPress.value)
    return
  if (isEscPressed.value) {
    console.log('[IframeDrawer] ESC pressed twice, closing')
    handleClose()
  }
  else {
    console.log('[IframeDrawer] First ESC press, waiting for second press')
    isEscPressed.value = true
    if (escPressedTimer.value) {
      clearTimeout(escPressedTimer.value)
    }
    escPressedTimer.value = setTimeout(() => {
      isEscPressed.value = false
    }, 1300)
  }
})

watchEffect(() => {
  if (isInIframe())
    return null

  useEventListener(window, 'message', ({ data }) => {
    switch (data.type) {
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
    }
    // 兼容旧的消息格式（没有 type 字段）
    if (data === DRAWER_VIDEO_ENTER_PAGE_FULL) {
      headerShow.value = false
      disableEscPress.value = true
      isPageFullscreen.value = true
    }
    else if (data === DRAWER_VIDEO_EXIT_PAGE_FULL) {
      headerShow.value = true
      disableEscPress.value = false
      isPageFullscreen.value = false
    }
  })
})
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
            v-show="showIframe"
            ref="iframeRef"
            :src="props.url"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
            :style="iframeStyles"
            frameborder="0"
            pointer-events-auto
            :pos="isPageFullscreen ? undefined : 'relative left-0'"
            allow="fullscreen"
            w-full
            h-full
            @load="showIframe = true"
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
