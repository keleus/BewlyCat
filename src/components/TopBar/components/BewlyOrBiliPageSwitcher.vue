<script lang="ts" setup>
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
    class="bewly-bili-switcher"
    :class="{
      'bewly-bili-switcher--white': props.forceWhiteIcon,
      'bewly-bili-switcher--solid': !settings.enableFrostedGlass,
    }"
    role="group"
    aria-label="Homepage mode"
  >
    <button
      v-for="option in options" :key="option.name"
      class="bewly-bili-switcher-button"
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
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 4px;
  height: 34px;
  padding: 4px;
  border: 0;
  border-radius: var(--bew-top-bar-control-radius);
  background: var(--bew-elevated);
  backdrop-filter: var(--bew-filter-glass-1);

  &--solid {
    backdrop-filter: none;
  }

  &--white:not(.bewly-bili-switcher--solid) {
    background: color-mix(in oklab, var(--bew-elevated-solid), transparent 80%);

    .bewly-bili-switcher-button {
      color: white;

      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      &.active {
        color: white;
        background: rgba(255, 255, 255, 0.3);
      }
    }
  }
}

.bewly-bili-switcher-button {
  appearance: none;
  display: grid;
  height: 26px;
  place-items: center;
  padding: 0 8px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--bew-text-2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-fill-2);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: 1px;
  }

  &.active {
    color: var(--bew-text-1);
    background: var(--bew-fill-3);
  }

  &__full {
    display: none;
  }

  &__short {
    display: block;
  }
}

@media (min-width: 1280px) {
  .bewly-bili-switcher-button {
    padding: 0 16px;

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
