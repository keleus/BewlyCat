<script lang="ts" setup>
import { useBewlyApp } from '~/composables/useAppProvider'
import { IFRAME_PAGE_SWITCH_BEWLY, IFRAME_PAGE_SWITCH_BILI, IFRAME_TOP_BAR_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { useMainStore } from '~/stores/mainStore'
import { useSettingsStore } from '~/stores/settingsStore'
import { isHomePage, isInIframe } from '~/utils/main'

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
  // TopBar is now always shown outside iframe, so only check if we're not in iframe
  // Show switcher for all dock items on home page, even if they don't have Bewly page
  if (!isInIframe() && getDockItemByPage(activatedPage.value) && isHomePage())
    return true
  return false
})

function switchPage(useOriginalBiliPage: boolean) {
  const dockItem = settings.value.dockItemsConfig.find(dockItem => dockItem.page === activatedPage.value)
  if (dockItem) {
    dockItem.useOriginalBiliPage = useOriginalBiliPage
  }

  // Since TopBar is now always outside iframe, we need to send message to iframe if it exists
  // Find the iframe and send message to it
  const iframe = document.querySelector('iframe[src*="bilibili.com"]') as HTMLIFrameElement
  if (iframe && iframe.contentWindow) {
    if (useOriginalBiliPage)
      iframe.contentWindow.postMessage(IFRAME_PAGE_SWITCH_BILI, '*')
    else
      iframe.contentWindow.postMessage(IFRAME_PAGE_SWITCH_BEWLY, '*')

    // Also sync current top bar preference so the iframe can hide/show its own Bilibili header immediately.
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
    :class="{ 'disable-frosted-glass': settings.disableFrostedGlass }"
    style="backdrop-filter: var(--bew-filter-glass-1);"
    flex="~ gap-1" bg="$bew-elevated" p-1 rounded-full
    h-34px
  >
    <button
      v-for="option in options" :key="option.name"
      class="bewly-bili-switcher-button"
      :class="{
        active: option.useOriginalBiliPage === (getDockItemConfigByPage(activatedPage)?.useOriginalBiliPage || false),
      }"
      rounded-inherit text="$bew-text-2 hover:$bew-text-1 xs" p="x-2 lg:x-4" bg="hover:$bew-fill-2"
      fw-bold duration-300
      @click="switchPage(option.useOriginalBiliPage)"
    >
      <span class="hidden lg:block">
        {{ option.name }}
      </span>
      <span class="block lg:hidden">
        {{ option.shortName }}
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.force-white-icon .bewly-bili-switcher:not(.disable-frosted-glass) {
  background-color: color-mix(in oklab, var(--bew-elevated-solid), transparent 80%);
}

.force-white-icon .bewly-bili-switcher:not(.disable-frosted-glass) .bewly-bili-switcher-button {
  --uno: "text-white";

  &:hover {
    --uno: "bg-white bg-opacity-20";
  }

  &.active {
    --uno: "bg-white bg-opacity-30";
  }
}

.active {
  --uno: "bg-$bew-fill-3 text-$bew-text-1";
}
</style>
