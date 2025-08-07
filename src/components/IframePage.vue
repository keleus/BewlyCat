<script setup lang="ts">
import { useDark } from '~/composables/useDark'
import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'

const props = defineProps<{
  url: string
}>()
const { isDark } = useDark()
const headerShow = ref(false)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const currentUrl = ref<string>(props.url)

const showLoading = ref<boolean>(false)

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

// watch(() => props.url, () => {
//   showIframe.value = false
// })

// Only show loading animation after 1.5 seconds to prevent annoying flash when content loads quickly
const showLoadingTimeout = ref()

// 处理iframe加载完成事件
function handleIframeLoad() {
  // 清除loading状态
  clearTimeout(showLoadingTimeout.value)
  showLoading.value = false
  
  // 当iframe加载完成后，发送当前的黑暗模式状态（仅在跨域时需要）
  if (iframeRef.value?.contentWindow) {
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
    }, 100) // 减少延迟，因为iframe已经触发了load事件
  }
}

watch(() => props.url, () => {
  // URL变化时启动loading逻辑，但保持iframe可见以避免样式计算错误
  showLoadingTimeout.value = setTimeout(() => {
    showLoading.value = true
  }, 1500)
})



onMounted(() => {
  // 第一次加载时启动loading逻辑
  showLoadingTimeout.value = setTimeout(() => {
    showLoading.value = true
  }, 1500)
  
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
    <!-- Iframe -->
    <iframe
      ref="iframeRef"
      :src="props.url"
      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation"
      :style="{
        bottom: headerShow ? `var(--bew-top-bar-height)` : '0',
      }"
      frameborder="0"
      pointer-events-auto
      pos="absolute left-0"
      w-inherit h-inherit
      @load="handleIframeLoad"
       />
  </div>
</template>
