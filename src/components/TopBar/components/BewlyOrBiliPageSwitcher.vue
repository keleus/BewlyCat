<script lang="ts" setup>
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { IFRAME_PAGE_SWITCH_BEWLY, IFRAME_PAGE_SWITCH_BILI, IFRAME_TOP_BAR_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { isHomePage, isInIframe } from '~/utils/main'

const props = defineProps<{
  forceWhiteIcon: boolean
}>()

const { activatedPage } = useBewlyApp()
const { getDockItemByPage } = useMainStore()
const { getDockItemConfigByPage } = useSettingsStore()
const options = readonly([
  {
    name: 'BewlyCat',
    shortName: 'Bewly',
    useOriginalBiliPage: false,
  },
  {
    name: 'BiliBili',
    shortName: 'Bili',
    useOriginalBiliPage: true,
  },
])

const showBewlyOrBiliPageSwitcher = computed(() => {
  if (settings.value.useOriginalBilibiliHomepage)
    return false
  // 顶栏始终位于 iframe 外部，因此只需排除 iframe 内部环境
  if (!isInIframe() && getDockItemByPage(activatedPage.value) && isHomePage())
    return true
  return false
})

const isOriginalBiliPageActive = computed(() => {
  return getDockItemConfigByPage(activatedPage.value)?.useOriginalBiliPage ?? false
})

const liquidIndicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)

watch(showBewlyOrBiliPageSwitcher, (visible) => {
  if (visible)
    void liquidIndicatorRef.value?.updateIndicator(true)
})

function switchPage(nextUseOriginalBiliPage: boolean) {
  if (nextUseOriginalBiliPage === isOriginalBiliPageActive.value)
    return

  const dockItem = settings.value.dockItemsConfig.find(dockItem => dockItem.page === activatedPage.value)
  if (dockItem) {
    dockItem.useOriginalBiliPage = nextUseOriginalBiliPage
  }

  // iframe 位于 Shadow DOM 内，切回 Bewly 页面时同步通知尚未卸载的 iframe
  const iframe = document.getElementById('bewly')
    ?.shadowRoot
    ?.querySelector<HTMLIFrameElement>('iframe[src*="bilibili.com"]')
  if (iframe && iframe.contentWindow) {
    if (nextUseOriginalBiliPage)
      iframe.contentWindow.postMessage(IFRAME_PAGE_SWITCH_BILI, '*')
    else
      iframe.contentWindow.postMessage(IFRAME_PAGE_SWITCH_BEWLY, '*')

    // 同步当前顶栏偏好，避免 iframe 卸载前短暂恢复原版顶栏
    iframe.contentWindow.postMessage({
      type: IFRAME_TOP_BAR_CHANGE,
      useOriginalBilibiliTopBar: settings.value.useOriginalBilibiliTopBar,
    }, '*')
  }
}
</script>

<template>
  <div
    v-if="showBewlyOrBiliPageSwitcher"
    class="bewly-bili-switcher bew-segment-control bew-segment-control--surface"
    :class="{
      'bewly-bili-switcher--white': props.forceWhiteIcon,
      'bew-segment-control--solid': !settings.enableFrostedGlass,
      'bew-segment-control--static': !settings.enableLiquidSegmentIndicator,
    }"
    role="group"
    aria-label="Homepage mode"
  >
    <LiquidSegmentIndicator
      v-if="settings.enableLiquidSegmentIndicator"
      ref="liquidIndicatorRef"
      :active-key="isOriginalBiliPageActive"
      :white="props.forceWhiteIcon && settings.enableFrostedGlass"
    />

    <button
      v-for="option in options" :key="option.name"
      class="bewly-bili-switcher-button bew-segment-control__item"
      data-segment-item
      :data-active="option.useOriginalBiliPage === isOriginalBiliPageActive ? 'true' : undefined"
      :class="{
        active: option.useOriginalBiliPage === isOriginalBiliPageActive,
      }"
      :aria-pressed="option.useOriginalBiliPage === isOriginalBiliPageActive"
      :title="option.name"
      @click="switchPage(option.useOriginalBiliPage)"
    >
      <span class="bewly-bili-switcher-button__full">
        {{ option.name }}
      </span>
      <span class="bewly-bili-switcher-button__short">
        {{ option.shortName }}
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.bewly-bili-switcher {
  --bew-segment-item-active-bg-white: rgba(255, 255, 255, 0.3);
  --bew-segment-item-active-shadow-white: none;
  --bew-control-label-weight: var(--bew-control-brand-label-weight);

  flex: none;

  &--white:not(.bew-segment-control--solid) {
    --bew-segment-surface-background: var(--bew-control-background-white);
    --bew-segment-surface-shadow: none;
    --bew-segment-item-color: white;
    --bew-segment-item-hover-current-color: white;
    --bew-segment-item-hover-current-bg: var(--bew-segment-item-hover-bg-white);
    --bew-segment-item-focus-color: white;
    --bew-segment-item-focus-bg: var(--bew-segment-item-hover-bg-white);
    --bew-segment-item-current-color: white;
  }

  // 无液态指示器时，静态选中态也要沿用白色主题底色
  &--white.bew-segment-control--static {
    --bew-segment-item-active-bg: var(--bew-segment-item-active-bg-white);
    --bew-segment-item-active-shadow: var(--bew-segment-item-active-shadow-white);
    --bew-segment-item-current-color: white;
  }
}

.bewly-bili-switcher-button {
  display: grid;
  place-items: center;

  &__full {
    display: none;
  }

  &__short {
    display: block;
  }
}

@media (min-width: 1280px) {
  .bewly-bili-switcher-button {
    padding-inline: var(--bew-control-item-padding-x-wide);

    &__full {
      display: block;
    }

    &__short {
      display: none;
    }
  }
}

@media (max-width: 640px) {
  .bewly-bili-switcher {
    display: none;
  }
}
</style>
