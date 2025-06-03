<script setup lang="ts">
import { useDark } from '~/composables/useDark'
import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'

const props = defineProps<{
  url: string
}>()
const { isDark } = useDark()
const headerShow = ref(false)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref<string>(props.url)
const showIframe = ref<boolean>(false)
const showLoading = ref<boolean>(false)

watch(() => isDark.value, (newValue) => {
  // 尝试直接操作同域iframe的DOM（用于同域情况）
  try {
    iframeRef.value?.contentDocument?.documentElement.classList.toggle('dark', newValue)
    iframeRef.value?.contentDocument?.body?.classList.toggle('dark', newValue)
  }
  catch (error) {
    // 同域操作失败，忽略错误，因为我们会使用postMessage
  }

  // 使用postMessage通知iframe内的页面切换黑暗模式（用于跨域情况）
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

watch(() => props.url, () => {
  showIframe.value = false
})

// Only show loading animation after 1.5 seconds to prevent annoying flash when content loads quickly
const showLoadingTimeout = ref()
watch(() => showIframe.value, async (newValue) => {
  clearTimeout(showLoadingTimeout.value)
  if (!newValue) {
    showLoadingTimeout.value = setTimeout(() => {
      showLoading.value = true
    }, 1500)
  }
  else {
    showLoading.value = false

    // 当iframe加载完成后，立即发送当前的黑暗模式状态
    if (newValue && iframeRef.value?.contentWindow) {
      // 延迟一下确保iframe完全加载，并且多次尝试确保消息被接收
      const sendDarkModeState = () => {
        try {
          iframeRef.value?.contentWindow?.postMessage({
            type: IFRAME_DARK_MODE_CHANGE,
            isDark: isDark.value,
          }, '*')
        }
        catch (error) {
          console.warn('Failed to send initial dark mode state to iframe:', error)
        }
      }

      // 多次发送确保消息被接收
      setTimeout(sendDarkModeState, 100)
      setTimeout(sendDarkModeState, 500)
      setTimeout(sendDarkModeState, 1000)
    }
  }
}, { immediate: true })

onMounted(() => {
  nextTick(() => {
    iframeRef.value?.focus()
  })
})

onBeforeUnmount(() => {
  releaseIframeResources()
})

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

function handleBackToTop() {
  if (iframeRef.value) {
    iframeRef.value.contentWindow?.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function handleRefresh() {
  if (iframeRef.value) {
    iframeRef.value.contentWindow?.location.reload()
  }
}

defineExpose({
  handleBackToTop,
  handleRefresh,
})
</script>

<template>
  <div
    pos="relative top-0 left-0" of-hidden w-full h-full
  >
    <Transition name="fade">
      <Loading v-if="showLoading" w-full h-full pos="absolute top-0 left-0" />
    </Transition>
    <Transition name="fade">
      <!-- Iframe -->
      <iframe
        v-show="showIframe"
        ref="iframeRef"
        :src="props.url"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        :style="{
          bottom: headerShow ? `var(--bew-top-bar-height)` : '0',
        }"
        frameborder="0"
        pointer-events-auto
        pos="absolute left-0"
        w-inherit h-inherit
        @load="showIframe = true"
      />
    </Transition>
  </div>
</template>

<style lang="scss" scoped>

</style>
