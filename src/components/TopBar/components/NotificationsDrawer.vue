<script setup lang="ts">
import { DrawerType, useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { lockPageScroll, unlockPageScroll } from '~/utils/pageScrollLock'

// TODO: support shortcuts like `Ctrl+Alt+T` to open in new tab, `Esc` to close

const props = defineProps<{
  url: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { mainAppRef, activeDrawer, setActiveDrawer } = useBewlyApp()
const { isDark } = useDark()

const show = ref(false)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const drawerRef = ref<HTMLElement | null>(null)
const currentUrl = ref<string>(props.url || 'https://message.bilibili.com/')
const showIframe = ref(false)
const isIframeLoaded = ref(false)
const isIframeDisplayReady = ref(false)
const delayCloseTimer = ref<NodeJS.Timeout | null>(null)
const revealIframeTimer = ref<NodeJS.Timeout | null>(null)
const isPageScrollLocked = ref(false)
const isEscPressed = ref<boolean>(false)
const escPressedTimer = ref<NodeJS.Timeout | null>(null)
const escHintTimer = ref<NodeJS.Timeout | null>(null)
const openTimer = ref<NodeJS.Timeout | null>(null)
const disableEscPress = ref<boolean>(false)
const showEscHint = ref<boolean>(false)

// 计算属性：只有在显示iframe时才设置src，避免隐藏时提前加载
const src = computed(() => showIframe.value ? currentUrl.value : undefined)

function clearRevealIframeTimer() {
  if (revealIframeTimer.value) {
    clearTimeout(revealIframeTimer.value)
    revealIframeTimer.value = null
  }
}

function scheduleRevealIframe() {
  if (!showIframe.value || !isIframeLoaded.value)
    return

  clearRevealIframeTimer()
  revealIframeTimer.value = setTimeout(() => {
    if (showIframe.value && isIframeLoaded.value)
      isIframeDisplayReady.value = true
    revealIframeTimer.value = null
  }, isDark.value ? 360 : 120)
}

function syncIframeDarkModeState() {
  if (iframeRef.value?.contentWindow) {
    try {
      iframeRef.value.contentWindow.postMessage({
        type: IFRAME_DARK_MODE_CHANGE,
        isDark: isDark.value,
        darkModeBaseColor: settings.value.darkModeBaseColor,
      }, '*')
    }
    catch (error) {
      console.warn('Failed to send dark mode change message to iframe:', error)
    }
  }
}

function handleIframeLoad() {
  // Ignore hidden or empty-src iframe load events (e.g. initial about:blank).
  const iframeSrc = iframeRef.value?.getAttribute('src')
  if (!showIframe.value || !iframeSrc || iframeSrc === 'about:blank')
    return

  isIframeLoaded.value = true
}

function handleDrawerCloseRequestMessage(event: MessageEvent) {
  const iframe = iframeRef.value
  if (!show.value || !iframe?.contentWindow || event.source !== iframe.contentWindow)
    return

  const iframeSrc = iframe.getAttribute('src')
  if (!iframeSrc || iframeSrc === 'about:blank')
    return

  try {
    if (event.origin !== new URL(iframeSrc, window.location.href).origin)
      return
  }
  catch {
    return
  }

  if (event.data?.type !== 'BEWLY_DRAWER_CLOSE_REQUEST' || event.data?.source !== 'iframe')
    return

  // 根据设置决定是立即关闭还是需要二次确认
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
      isEscPressed.value = false
    }, 1300)
  }
}

// 监听黑暗模式变化
watch(() => isDark.value, () => {
  syncIframeDarkModeState()
})

// 监听深色模式基准颜色变化
watch(() => settings.value.darkModeBaseColor, () => {
  syncIframeDarkModeState()
})

// 监听iframe加载状态，加载完成后发送初始的黑暗模式状态
watch(() => isIframeLoaded.value, (newValue) => {
  if (!newValue)
    return

  // 发送多次深色模式同步消息，减少 iframe 页面初始亮色闪烁
  syncIframeDarkModeState()
  setTimeout(syncIframeDarkModeState, 120)
  setTimeout(syncIframeDarkModeState, 320)
  scheduleRevealIframe()
})

watch(() => showIframe.value, (newValue) => {
  if (newValue)
    scheduleRevealIframe()
})

const beforeUrl = ref<string>('')

function handleOpen() {
  show.value = true
  isIframeLoaded.value = false // 重置加载状态
  isIframeDisplayReady.value = false // 重置显示状态
  clearRevealIframeTimer()
  setActiveDrawer(DrawerType.NotificationsDrawer) // 设置为当前活跃抽屉
  if (!isPageScrollLocked.value) {
    lockPageScroll()
    isPageScrollLocked.value = true
  }

  if (beforeUrl.value !== props.url) {
    currentUrl.value = props.url
    beforeUrl.value = props.url
  }
  // 延迟加载iframe，确保抽屉动画完成后再开始加载内容
  if (openTimer.value)
    clearTimeout(openTimer.value)
  openTimer.value = setTimeout(() => {
    openTimer.value = null
    showIframe.value = true
    nextTick(() => {
      // 聚焦到抽屉容器而不是iframe，以便捕获键盘事件
      drawerRef.value?.focus()
    })
  }, 350) // 等待抽屉滑入动画完成(300ms)后再显示iframe，避免动画冲突
}

async function handleClose() {
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
  }
  clearLifecycleTimers()
  isEscPressed.value = false
  showEscHint.value = false
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  show.value = false
  showIframe.value = false // 重置iframe显示状态
  isIframeLoaded.value = false // 重置加载状态
  isIframeDisplayReady.value = false // 重置显示状态
  setActiveDrawer(DrawerType.None) // 清除活跃抽屉状态
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
    try {
      window.open(iframeRef.value.contentWindow?.location.href.replace(/\/$/, ''), '_blank')
    }
    catch {
      window.open('https://message.bilibili.com/', '_blank')
    }
    handleClose()
  }
}

/**
 * Listen to Escape key using native event listener
 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' && e.code !== 'Escape')
    return
  if (e.repeat || e.isComposing)
    return

  // Only handle when this drawer is the active drawer
  if (activeDrawer.value !== DrawerType.NotificationsDrawer)
    return

  const hadEscapePriorityState = disableEscPress.value
    || !!(document.fullscreenElement
      || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement)

  window.setTimeout(() => {
    if (hadEscapePriorityState
      || disableEscPress.value
      || e.defaultPrevented
      || e.cancelBubble
      || activeDrawer.value !== DrawerType.NotificationsDrawer) {
      return
    }

    if (settings.value.closeDrawerWithoutPressingEscAgain) {
      if (escPressedTimer.value)
        clearTimeout(escPressedTimer.value)
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
        isEscPressed.value = false
      }, 1300)
    }
  }, 0)
}

function showEscHintTemporarily() {
  showEscHint.value = true
  if (escHintTimer.value)
    clearTimeout(escHintTimer.value)
  escHintTimer.value = setTimeout(() => {
    showEscHint.value = false
    escHintTimer.value = null
  }, 3000)
}

function handleIframeFocusin(e: FocusEvent) {
  if (show.value && iframeRef.value && e.target === iframeRef.value)
    showEscHintTemporarily()
}

function handleDocumentClick(e: MouseEvent) {
  if (show.value && iframeRef.value?.contains(e.target as Node))
    showEscHintTemporarily()
}

function handleDrawerMousedown(e: MouseEvent) {
  if (!show.value || !drawerRef.value || !iframeRef.value)
    return

  const isClickInDrawer = drawerRef.value.contains(e.target as Node)
  const isClickInIframe = iframeRef.value.contains(e.target as Node)

  if (isClickInDrawer && !isClickInIframe) {
    e.preventDefault()
    showEscHint.value = false
    nextTick(() => drawerRef.value?.focus())
  }
}

let globalListenersRegistered = false
let drawerActive = false

function registerGlobalListeners() {
  if (globalListenersRegistered)
    return
  globalListenersRegistered = true
  window.addEventListener('keydown', handleKeydown, true) // use capture phase
  window.addEventListener('message', handleDrawerCloseRequestMessage)
  document.addEventListener('focusin', handleIframeFocusin, true)
  document.addEventListener('click', handleDocumentClick, true)
  document.addEventListener('mousedown', handleDrawerMousedown, true)
}

function removeGlobalListeners() {
  if (!globalListenersRegistered)
    return
  globalListenersRegistered = false
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('message', handleDrawerCloseRequestMessage)
  document.removeEventListener('focusin', handleIframeFocusin, true)
  document.removeEventListener('click', handleDocumentClick, true)
  document.removeEventListener('mousedown', handleDrawerMousedown, true)
}

function clearLifecycleTimers() {
  clearRevealIframeTimer()
  if (openTimer.value) {
    clearTimeout(openTimer.value)
    openTimer.value = null
  }
  if (escHintTimer.value) {
    clearTimeout(escHintTimer.value)
    escHintTimer.value = null
  }
  if (escPressedTimer.value) {
    clearTimeout(escPressedTimer.value)
    escPressedTimer.value = null
  }
}

onMounted(() => {
  drawerActive = true
  registerGlobalListeners()
  handleOpen()
})

onActivated(() => {
  if (drawerActive)
    return
  drawerActive = true
  registerGlobalListeners()
  handleOpen()
})

onBeforeUnmount(() => {
  drawerActive = false
  removeGlobalListeners()
  clearLifecycleTimers()
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  void releaseIframeResources()
})

onDeactivated(() => {
  drawerActive = false
  removeGlobalListeners()
  clearLifecycleTimers()
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
})

// 辅助方法：处理点击/鼠标按下，隐藏提示并聚焦抽屉
function handleFocusDrawer(e?: Event) {
  e?.preventDefault()
  showEscHint.value = false
  nextTick(() => drawerRef.value?.focus())
}
</script>

<template>
  <Teleport :to="mainAppRef">
    <div
      :style="{ pointerEvents: show ? 'auto' : 'none' }"
      pos="fixed top-0 left-0" of-hidden w-full h-full
      z-999999
    >
      <!-- Mask -->
      <Transition name="fade">
        <div
          v-if="show"
          pos="absolute bottom-0 left-0" w-full h-full bg="black opacity-60"
          @click="handleClose"
          @mousedown="handleFocusDrawer"
        />
      </Transition>

      <Transition name="drawer">
        <div
          v-show="show"
          ref="drawerRef"
          tabindex="0"
          pos="absolute top-0 right-0" of-hidden bg="$bew-bg"
          w="xl:70vw lg:80vw md:100vw 100vw" max-w-1400px h-full
          outline-none
          @keydown="handleKeydown"
          @mousedown.self="handleFocusDrawer"
        >
          <div
            pos="fixed top-0 right-0" z-10 flex="~ items-center justify-between gap-2"
            w-inherit max-w-inherit h="$bew-top-bar-height"
            m-auto px-4
            pointer-events-none
            bg="$bew-bg"
            @mousedown="handleFocusDrawer"
          >
            <h3 class="notifications-drawer__title">
              {{ $t('topbar.notifications') }}
            </h3>
            <div flex="~ items-center gap-2">
              <!-- ESC Hint -->
              <Transition name="fade">
                <div
                  v-if="showEscHint"
                  pointer-events-auto
                  bg="$bew-theme-color" text="white sm" px-3 py-2 rounded="$bew-interactive-radius"
                  flex="~ items-center gap-2"
                >
                  <i i-mingcute:information-line />
                  <span>{{ $t('iframe_drawer.esc_hint', '点击抽屉外部区域，然后按 ESC 关闭') }}</span>
                </div>
              </Transition>

              <Button
                style="
                  --b-button-color: var(--bew-elevated-solid);
                  --b-button-color-hover: var(--bew-elevated-solid-hover);
                "
                pointer-events-auto
                shadow="!$bew-shadow-1"
                @click="handleOpenInNewTab"
              >
                <template #left>
                  <i i-mingcute:external-link-line />
                </template>
                {{ $t('iframe_drawer.open_in_new_tab') }}
              </Button>
              <Button
                v-if="!isEscPressed"
                style="
                  --b-button-color: var(--bew-elevated-solid);
                  --b-button-color-hover: var(--bew-elevated-solid-hover);
                "
                pointer-events-auto
                shadow="!$bew-shadow-1"
                @click="handleClose"
              >
                <template #left>
                  <i i-mingcute:close-line />
                </template>
                {{ $t('iframe_drawer.close') }}
                <kbd
                  ml-1 px-2 py-0.5 rounded="$bew-radius-sm" text-xs
                  bg="$bew-fill-2" text="$bew-text-2"
                >Esc</kbd>
              </Button>
              <Button
                v-else
                type="error"
                shadow="!$bew-shadow-1"
                @click="handleClose"
              >
                <template #left>
                  <i i-mingcute:close-line />
                </template>
                {{ $t('iframe_drawer.press_esc_again_to_close') }}
                <kbd
                  ml-1 px-2 py-0.5 rounded="$bew-radius-sm" text-xs
                  bg="red-700" text="white"
                >Esc</kbd>
              </Button>
            </div>
          </div>

          <Transition name="fade">
            <div
              v-if="showIframe && !isIframeDisplayReady"
              class="notifications-drawer__loading-layer"
              pos="absolute top-0 right-0"
              z-20
              w-full h-full
              bg="$bew-bg"
            >
              <Loading />
            </div>
          </Transition>

          <Transition name="fade">
            <!-- Iframe -->
            <iframe
              v-show="showIframe"
              ref="iframeRef"
              :src="src"
              frameborder="0"
              pointer-events-auto
              pos="relative right-0"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              w-inherit
              max-w-inherit
              :style="{
                height: 'calc(100%)',
                opacity: isIframeDisplayReady ? 1 : 0,
                visibility: isIframeDisplayReady ? 'visible' : 'hidden',
                pointerEvents: isIframeDisplayReady ? 'auto' : 'none',
                transition: 'opacity 0.2s ease',
                backgroundColor: 'var(--bew-bg)',
              }"
              @load="handleIframeLoad"
            />
          </Transition>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.3s;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}

/* 修改全局样式，避免重复设置 */
:global(.photo-imager-container) {
  /* 不再设置 top 和 height，避免与 iframe 样式冲突 */
  position: fixed !important;
  height: calc(100% - var(--bew-top-bar-height)) !important;
  margin-top: var(--bew-top-bar-height) !important;
}

:global(.photo-imager-container .control-buttons) {
  top: 20px !important; /* 增加顶部距离，避免与抽屉顶部按钮重叠 */
  right: 20px !important;
}

.notifications-drawer__loading-layer {
  display: flex;
  align-items: center;
  justify-content: center;
}

.notifications-drawer__title {
  margin: 0;
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-bold);
  line-height: var(--bew-line-height-heading);
}
</style>
