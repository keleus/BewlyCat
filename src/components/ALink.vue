<script lang="ts" setup>
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import { isHomePage, isInIframe } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'

const props = defineProps<{
  href?: string
  title?: string
  rel?: string
  type: 'topBar' | 'videoCard' | 'searchBar'
  customClickEvent?: boolean
  stopPropagation?: boolean
}>()

const emit = defineEmits<{
  (e: 'click', value: MouseEvent): void
}>()

const { openIframeDrawer } = useBewlyApp()

const processedHref = computed(() => {
  if (!props.href)
    return 'javascript:void(0)'

  return props.href
})

const openMode = computed(() => {
  if (props.type === 'topBar')
    return settings.value.topBarLinkOpenMode
  else if (props.type === 'videoCard')
    return settings.value.videoCardLinkOpenMode
  else if (props.type === 'searchBar')
    return settings.value.searchBarLinkOpenMode
  return 'newTab'
})

// Since BewlyBewly sometimes uses an iframe to open the original Bilibili page in the current tab
// please set the target to `_top` instead of `_self`
const target = computed(() => {
  if (openMode.value === 'newTab') {
    return '_blank'
  }
  if (openMode.value === 'currentTabIfNotHomepage') {
    // When in iframe, treat as homepage by default
    if (isInIframe()) {
      return '_blank'
    }
    return isHomePage() ? '_blank' : '_top'
  }
  if (openMode.value === 'currentTab') {
    return '_top'
  }
  return '_top'
})

function handleClick(event: MouseEvent) {
  if (props.stopPropagation) {
    event.stopPropagation()
  }

  if (event.ctrlKey || event.metaKey || event.altKey)
    return

  if (props.customClickEvent) {
    event.preventDefault()
    emit('click', event)
    return
  }

  // 在触屏模式下，topBar 类型的链接不执行打开操作，只显示弹窗
  // 但有以下例外情况应该允许点击并响应打开行为设置：
  // 1. 链接在弹窗内部（.bew-popover）
  // 2. Home按钮（.home-button）
  // 3. 固定分区（.pinned-channels__item）
  if (props.type === 'topBar' && settings.value.touchScreenOptimization) {
    const target = event.target as HTMLElement
    const isInsidePopup = target.closest('.bew-popover')
    const isHomeButton = target.closest('.home-button')
    const isPinnedChannel = target.closest('.pinned-channels__item')

    if (!isInsidePopup && !isHomeButton && !isPinnedChannel) {
      event.preventDefault()
      return
    }
  }

  if (openMode.value === 'drawer') {
    event.preventDefault()
    if (props.href) {
      openIframeDrawer(processedHref.value)
    }
    return
  }

  if (openMode.value === 'background' && props.href) {
    event.preventDefault()
    openLinkInBackground(processedHref.value)
  }
}
</script>

<template>
  <a
    :href="processedHref"
    :target="target"
    :title="title"
    :rel="rel"
    @click="handleClick"
  >
    <slot />
  </a>
</template>
