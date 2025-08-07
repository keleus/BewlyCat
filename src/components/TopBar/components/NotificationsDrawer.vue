<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'

// TODO: support shortcuts like `Ctrl+Alt+T` to open in new tab, `Esc` to close

const props = defineProps<{
  url: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { mainAppRef } = useBewlyApp()
const { isDark } = useDark()

const show = ref(false)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref<string>(props.url || 'https://message.bilibili.com/')
const showIframe = ref(false)
const delayCloseTimer = ref<NodeJS.Timeout | null>(null)

// 计算属性：只有在显示iframe时才设置src，避免隐藏时提前加载
const src = computed(() => showIframe.value ? currentUrl.value : undefined)

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

onMounted(() => {
  handleOpen()
})

onActivated(() => {
  handleOpen()
})

const beforeUrl = ref<string>('')
function handleOpen() {
  show.value = true
  if (beforeUrl.value !== props.url) {
    currentUrl.value = props.url
    beforeUrl.value = props.url
  }
  // 延迟加载iframe，确保抽屉动画完成后再开始加载内容
  setTimeout(() => {
    showIframe.value = true
    nextTick(() => {
      iframeRef.value?.focus()
    })
  }, 100) // 短暂延迟，确保抽屉显示动画开始
}

onBeforeUnmount(() => {
  releaseIframeResources()
})

async function handleClose() {
  if (delayCloseTimer.value) {
    clearTimeout(delayCloseTimer.value)
  }
  // await releaseIframeResources()
  show.value = false
  showIframe.value = false // 重置iframe显示状态
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

/**
 * Not working, idk why
 */
nextTick(() => {
  onKeyStroke('Escape', (e: KeyboardEvent) => {
    e.preventDefault()
    if (settings.value.closeDrawerWithoutPressingEscAgain) {
      clearTimeout(escPressedTimer.value!)
      handleClose()
      return
    }
    if (disableEscPress.value)
      return
    if (isEscPressed.value) {
      handleClose()
    }
    else {
      isEscPressed.value = true
      if (escPressedTimer.value) {
        clearTimeout(escPressedTimer.value)
      }
      escPressedTimer.value = setTimeout(() => {
        isEscPressed.value = false
      }, 1300)
    }
  }, { target: iframeRef.value?.contentWindow })
})
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
        />
      </Transition>

      <Transition name="drawer">
        <div
          v-show="show"
          pos="absolute top-0 right-0" of-hidden bg="$bew-bg"
          w="xl:70vw lg:80vw md:100vw 100vw" max-w-1400px h-full
        >
          <div
            pos="fixed top-0 right-0" z-10 flex="~ items-center justify-between gap-2"
            w-inherit max-w-inherit h="$bew-top-bar-height"
            m-auto px-4
            pointer-events-none
            bg="$bew-bg"
          >
            <h3 text="xl" fw-bold>
              {{ $t('topbar.notifications') }}
            </h3>
            <div flex="~ items-center gap-2">
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
                <kbd>Esc</kbd>
              </Button>
            </div>
          </div>

          <Transition name="fade">
            <Loading
              v-if="!showIframe"
              pos="absolute top-0 right-0" of-hidden
              w-full h-full
            />
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
              }"
              @load="showIframe = true"
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
</style>
