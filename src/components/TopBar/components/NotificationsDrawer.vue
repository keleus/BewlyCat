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

onMounted(() => {
  handleOpen()
})

onActivated(() => {
  handleOpen()
})

const beforeUrl = ref<string>('')

function handleOpen() {
  console.log('[NotificationsDrawer] handleOpen called')
  show.value = true
  isIframeLoaded.value = false // 重置加载状态
  isIframeDisplayReady.value = false // 重置显示状态
  clearRevealIframeTimer()
  setActiveDrawer(DrawerType.NotificationsDrawer) // 设置为当前活跃抽屉
  console.log('[NotificationsDrawer] show.value:', show.value, 'activeDrawer:', activeDrawer.value)
  if (!isPageScrollLocked.value) {
    lockPageScroll()
    isPageScrollLocked.value = true
  }

  if (beforeUrl.value !== props.url) {
    currentUrl.value = props.url
    beforeUrl.value = props.url
  }
  // 延迟加载iframe，确保抽屉动画完成后再开始加载内容
  setTimeout(() => {
    showIframe.value = true
    nextTick(() => {
      // 聚焦到抽屉容器而不是iframe，以便捕获键盘事件
      console.log('[NotificationsDrawer] Focusing drawer container')
      drawerRef.value?.focus()
    })
  }, 350) // 等待抽屉滑入动画完成(300ms)后再显示iframe，避免动画冲突
}

onBeforeUnmount(() => {
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  releaseIframeResources()
})

async function handleClose() {
  console.log('[NotificationsDrawer] handleClose called')
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
  }
  clearRevealIframeTimer()
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  show.value = false
  showIframe.value = false // 重置iframe显示状态
  isIframeLoaded.value = false // 重置加载状态
  isIframeDisplayReady.value = false // 重置显示状态
  setActiveDrawer(DrawerType.None) // 清除活跃抽屉状态
  console.log('[NotificationsDrawer] show.value:', show.value, 'activeDrawer:', activeDrawer.value)
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

const isEscPressed = ref<boolean>(false)
const escPressedTimer = ref<NodeJS.Timeout | null>(null)
const disableEscPress = ref<boolean>(false)
const showEscHint = ref<boolean>(false)

/**
 * Listen to Escape key using native event listener
 */
function handleKeydown(e: KeyboardEvent) {
  console.log('[NotificationsDrawer] keydown event:', e.key, e.code, 'activeDrawer:', activeDrawer.value)

  if (e.key !== 'Escape' && e.code !== 'Escape')
    return

  console.log('[NotificationsDrawer] ESC key pressed!')
  console.log('[NotificationsDrawer] show.value:', show.value)
  console.log('[NotificationsDrawer] activeDrawer.value:', activeDrawer.value)
  console.log('[NotificationsDrawer] DrawerType.NotificationsDrawer:', DrawerType.NotificationsDrawer)
  console.log('[NotificationsDrawer] Match:', activeDrawer.value === DrawerType.NotificationsDrawer)

  // Only handle when this drawer is the active drawer
  if (activeDrawer.value !== DrawerType.NotificationsDrawer) {
    console.log('[NotificationsDrawer] Not active drawer, ignoring ESC')
    return
  }

  console.log('[NotificationsDrawer] Processing ESC key')
  e.preventDefault()
  e.stopPropagation()

  if (settings.value.closeDrawerWithoutPressingEscAgain) {
    console.log('[NotificationsDrawer] closeDrawerWithoutPressingEscAgain = true, closing immediately')
    clearTimeout(escPressedTimer.value!)
    handleClose()
    return
  }
  console.log('[NotificationsDrawer] disableEscPress:', disableEscPress.value)
  console.log('[NotificationsDrawer] isEscPressed:', isEscPressed.value)
  if (disableEscPress.value)
    return
  if (isEscPressed.value) {
    console.log('[NotificationsDrawer] ESC pressed twice, closing')
    handleClose()
  }
  else {
    console.log('[NotificationsDrawer] First ESC press, waiting for second press')
    isEscPressed.value = true
    if (escPressedTimer.value) {
      clearTimeout(escPressedTimer.value)
    }
    escPressedTimer.value = setTimeout(() => {
      isEscPressed.value = false
    }, 1300)
  }
}

onMounted(() => {
  console.log('[NotificationsDrawer] onMounted - registering keydown listener')
  window.addEventListener('keydown', handleKeydown, true) // use capture phase
  document.addEventListener('keydown', handleKeydown, true) // also listen on document

  // 监听来自iframe的关闭请求
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'BEWLY_DRAWER_CLOSE_REQUEST' && event.data?.source === 'iframe') {
      console.log('[NotificationsDrawer] Received close request from iframe')

      // 根据设置决定是立即关闭还是需要二次确认
      if (settings.value.closeDrawerWithoutPressingEscAgain) {
        console.log('[NotificationsDrawer] Closing drawer immediately (from iframe)')
        handleClose()
      }
      else {
        // 模拟ESC按下逻辑
        if (isEscPressed.value) {
          console.log('[NotificationsDrawer] Second ESC from iframe, closing')
          handleClose()
        }
        else {
          console.log('[NotificationsDrawer] First ESC from iframe, waiting for second press')
          isEscPressed.value = true
          if (escPressedTimer.value) {
            clearTimeout(escPressedTimer.value)
          }
          escPressedTimer.value = setTimeout(() => {
            isEscPressed.value = false
          }, 1300)
        }
      }
    }
  })

  // Monitor focus changes - if iframe gets focus, show hint
  document.addEventListener('focusin', (e) => {
    if (show.value && iframeRef.value && e.target === iframeRef.value) {
      console.log('[NotificationsDrawer] iframe got focus, showing ESC hint')
      showEscHint.value = true
      // Auto hide hint after 3 seconds
      setTimeout(() => {
        showEscHint.value = false
      }, 3000)
    }
  }, true)

  // Monitor clicks on iframe
  document.addEventListener('click', (e) => {
    if (show.value && iframeRef.value?.contains(e.target as Node)) {
      console.log('[NotificationsDrawer] iframe clicked, showing ESC hint')
      showEscHint.value = true
      setTimeout(() => {
        showEscHint.value = false
      }, 3000)
    }
  }, true)

  // Monitor clicks/mousedown on drawer area (outside iframe) to refocus
  document.addEventListener('mousedown', (e) => {
    if (!show.value || !drawerRef.value || !iframeRef.value)
      return

    const isClickInDrawer = drawerRef.value.contains(e.target as Node)
    const isClickInIframe = iframeRef.value.contains(e.target as Node)

    // If clicked inside drawer but not in iframe, refocus drawer
    if (isClickInDrawer && !isClickInIframe) {
      console.log('[NotificationsDrawer] Click outside iframe, refocusing drawer')
      e.preventDefault()
      showEscHint.value = false
      nextTick(() => {
        drawerRef.value?.focus()
        console.log('[NotificationsDrawer] Drawer refocused, activeElement:', document.activeElement)
      })
    }
  }, true)

  handleOpen()
})

onActivated(() => {
  console.log('[NotificationsDrawer] onActivated - re-registering keydown listener')
  window.removeEventListener('keydown', handleKeydown, true)
  document.removeEventListener('keydown', handleKeydown, true)
  window.addEventListener('keydown', handleKeydown, true)
  document.addEventListener('keydown', handleKeydown, true)
  handleOpen()
})

onBeforeUnmount(() => {
  console.log('[NotificationsDrawer] onBeforeUnmount - removing keydown listener')
  window.removeEventListener('keydown', handleKeydown, true)
  document.removeEventListener('keydown', handleKeydown, true)
  clearRevealIframeTimer()
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
  releaseIframeResources()
})

onDeactivated(() => {
  console.log('[NotificationsDrawer] onDeactivated - removing keydown listener')
  window.removeEventListener('keydown', handleKeydown, true)
  document.removeEventListener('keydown', handleKeydown, true)
  clearRevealIframeTimer()
  if (isPageScrollLocked.value) {
    unlockPageScroll()
    isPageScrollLocked.value = false
  }
})

// 辅助方法：处理点击/鼠标按下，隐藏提示并聚焦抽屉
function handleFocusDrawer(e?: Event) {
  console.log('[NotificationsDrawer] Focusing drawer')
  e?.preventDefault()
  showEscHint.value = false
  nextTick(() => {
    drawerRef.value?.focus()
    console.log('[NotificationsDrawer] Drawer focused, activeElement:', document.activeElement)
  })
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
            <h3 text="xl" fw-bold>
              {{ $t('topbar.notifications') }}
            </h3>
            <div flex="~ items-center gap-2">
              <!-- ESC Hint -->
              <Transition name="fade">
                <div
                  v-if="showEscHint"
                  pointer-events-auto
                  bg="$bew-theme-color" text="white sm" px-3 py-2 rounded-8px
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
                  ml-1 px-1.5 py-0.5 rounded text-xs
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
                  ml-1 px-1.5 py-0.5 rounded text-xs
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
</style>
