<script lang="ts" setup>
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { IFRAME_PAGE_SWITCH_BEWLY, IFRAME_PAGE_SWITCH_BILI, IFRAME_TOP_BAR_CHANGE } from '~/constants/globalEvents'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { isHomePage, isInIframe, isWatchLaterListPage } from '~/utils/main'
import { buildNativeSearchUrl } from '~/utils/searchNavigation'

import TopBarItemEditor from './TopBarItemEditor.vue'

const props = defineProps<{
  forceWhiteIcon: boolean
}>()

const { activatedPage } = useBewlyApp()
const { isLayoutEditing } = useLayoutEditMode()
const { getDockItemByPage } = useMainStore()
const { getDockItemConfigByPage } = useSettingsStore()

function getOriginalBiliAppPage(url: string): AppPage | undefined {
  const urlObj = new URL(url)
  const { hostname, pathname } = urlObj

  if (hostname === 'search.bilibili.com')
    return AppPage.Search
  if (hostname === 't.bilibili.com')
    return AppPage.Moments
  if (hostname === 'space.bilibili.com' && /^\/\d+\/favlist\/?$/.test(pathname))
    return AppPage.Favorites
  if (hostname !== 'www.bilibili.com' && hostname !== 'bilibili.com')
    return undefined

  if (/^\/(?:anime|guochuang)(?:\/|$)/.test(pathname))
    return AppPage.Anime
  if (/^\/(?:account\/)?history(?:\/|$)/.test(pathname))
    return AppPage.History
  if (pathname.startsWith('/opus/'))
    return AppPage.Moments
  if (isWatchLaterListPage(url))
    return AppPage.WatchLater

  return undefined
}

const originalBiliAppPage = getOriginalBiliAppPage(window.location.href)

function getSearchKeyword(url: string): string {
  try {
    return new URL(url).searchParams.get('keyword')?.trim() || ''
  }
  catch {
    return ''
  }
}

const isPluginSearchResultsPage = computed(() => {
  return isHomePage()
    && activatedPage.value === AppPage.SearchResults
})

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
  if (settings.value.useOriginalBilibiliHomepage || isInIframe())
    return false

  if (isHomePage()) {
    return settings.value.showBewlyOrBiliPageSwitcher
      && Boolean(getDockItemByPage(isPluginSearchResultsPage.value ? AppPage.Search : activatedPage.value))
  }

  return settings.value.showBewlyOrBiliPageSwitcherOnMorePages && originalBiliAppPage !== undefined
})

const showSwitcherInLayoutEditor = computed(() => showBewlyOrBiliPageSwitcher.value)

const isOriginalBiliPageActive = computed(() => {
  if (originalBiliAppPage !== undefined && !isHomePage())
    return true
  return getDockItemConfigByPage(activatedPage.value)?.useOriginalBiliPage ?? false
})

const liquidIndicatorRef = ref<InstanceType<typeof LiquidSegmentIndicator> | null>(null)

watch(showSwitcherInLayoutEditor, (visible) => {
  if (visible)
    void liquidIndicatorRef.value?.updateIndicator(true)
})

function switchPage(nextUseOriginalBiliPage: boolean) {
  if (isLayoutEditing.value)
    return

  if (nextUseOriginalBiliPage === isOriginalBiliPageActive.value)
    return

  const page = originalBiliAppPage
    ?? (isPluginSearchResultsPage.value ? AppPage.Search : activatedPage.value)
  let dockItem = settings.value.dockItemsConfig.find(dockItem => dockItem.page === page)
  if (!dockItem) {
    const defaultDockItem = getDockItemByPage(page)
    if (defaultDockItem) {
      dockItem = {
        page,
        visible: true,
        openInNewTab: false,
        useOriginalBiliPage: defaultDockItem.useOriginalBiliPage,
      }
      settings.value.dockItemsConfig.push(dockItem)
    }
  }
  if (dockItem) {
    dockItem.useOriginalBiliPage = nextUseOriginalBiliPage
  }

  // SearchResults is a virtual BewlyCat page and has no iframe-backed dock
  // item. Navigate directly to the native search page while forwarding only
  // the active keyword, never the current route's tracking parameters.
  if (nextUseOriginalBiliPage && isPluginSearchResultsPage.value) {
    window.location.assign(buildNativeSearchUrl(getSearchKeyword(window.location.href)))
    return
  }

  if (originalBiliAppPage !== undefined && !isHomePage()) {
    window.location.assign(`https://www.bilibili.com/?page=${originalBiliAppPage}`)
    return
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
      showTopBar: settings.value.showTopBar,
    }, '*')
  }
}
</script>

<template>
  <TopBarItemEditor
    component-key="switcher"
    :title="$t('settings.show_bewly_or_bili_page_switcher')"
  >
    <div
      v-if="showSwitcherInLayoutEditor"
      class="top-bar-switcher-editor-anchor"
      :class="{ 'top-bar-switcher-editor-anchor--editing': isLayoutEditing }"
      data-top-bar-editor-anchor
    >
      <div
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
    </div>
  </TopBarItemEditor>
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

  // 无液态指示器时，静态选中态也要沿用白色主题底色。
  // 关闭磨砂玻璃时 surface 是不透明浅底，白色变体会让选中项彻底消失，
  // 因此与上面的白色文字规则一样排除 solid。
  &--white.bew-segment-control--static:not(.bew-segment-control--solid) {
    --bew-segment-item-active-bg: var(--bew-segment-item-active-bg-white);
    --bew-segment-item-active-shadow: var(--bew-segment-item-active-shadow-white);
    --bew-segment-item-current-color: white;
  }
}

.top-bar-switcher-editor-anchor {
  position: relative;
  display: inline-flex;
  min-width: 24px;
  min-height: var(--bew-control-height);
  align-items: center;
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

  .top-bar-switcher-editor-anchor--editing .bewly-bili-switcher {
    display: flex;
  }
}
</style>
