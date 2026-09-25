<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { getUserID } from '~/utils/main'
import { isComponentVisible } from '~/utils/topBarBadge'

const emit = defineEmits<{
  (e: 'bewlyPageClick', event: MouseEvent, key: string): void
}>()
const { t } = useI18n()
const modeSwitcherLabel = computed(() => settings.value.useOriginalBilibiliTopBar
  ? t('topbar.switch_to_bewly_top_bar')
  : t('topbar.switch_to_bilibili_top_bar'))

const list = computed((): { name: string, url: string, icon: string, bewlyKey?: string }[] => [
  { name: t('topbar.notifications'), url: '//message.bilibili.com', icon: 'i-mingcute:notification-line' },
  { name: t('topbar.moments'), url: '//t.bilibili.com/', icon: 'i-tabler:windmill', bewlyKey: 'moments' },
  { name: t('topbar.favorites'), url: `//space.bilibili.com/${getUserID() ?? ''}/favlist`, icon: 'i-mingcute:star-line', bewlyKey: 'favorites' },
  { name: t('topbar.history'), url: '//www.bilibili.com/history', icon: 'i-mingcute:time-line', bewlyKey: 'history' },
  { name: t('topbar.watch_later'), url: '//www.bilibili.com/watchlater/#/list', icon: 'i-mingcute:carplay-line', bewlyKey: 'watchLater' },
  { name: t('topbar.creative_center'), url: '//member.bilibili.com/platform/home', icon: 'i-mingcute:bulb-line' },
])
</script>

<template>
  <div
    max-h-264px important-overflow-y-auto
    w="180px"
    bg="$bew-elevated"
    flex="~ col"
    shadow="$bew-shadow-3"
    border="1 $bew-popover-border-color"
    class="more-pop bew-popover bew-popover-inset"
    data-key="more"
  >
    <ALink
      v-for="item in list"
      :key="item.name"
      :href="item.url"
      type="topBar"
      :custom-click-event="!!item.bewlyKey && !settings.touchScreenOptimization && settings.openTopBarItemsInBewly"
      pos="relative"
      p="x-5 y-2"
      hover:bg="$bew-fill-2"
      rounded="$bew-menu-item-radius"
      transition="colors"
      duration="200"
      m="b-1 last:b-0"
      flex="~ items-center gap-3"
      @click="item.bewlyKey && emit('bewlyPageClick', $event, item.bewlyKey)"
    >
      <i :class="item.icon" />
      <span class="flex-1">{{ item.name }}</span>
    </ALink>
    <button
      v-if="isComponentVisible('topBarSwitcher')"
      type="button"
      class="more-pop__mode-switcher"
      @click="settings.useOriginalBilibiliTopBar = !settings.useOriginalBilibiliTopBar"
    >
      <i i-mingcute:refresh-2-line aria-hidden="true" />
      {{ modeSwitcherLabel }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.more-pop__mode-switcher {
  display: none;
  align-items: center;
  gap: var(--bew-space-3);
  min-height: var(--bew-control-height);
  margin-bottom: var(--bew-space-1);
  padding: var(--bew-space-2) var(--bew-space-5);
  border: 0;
  border-radius: var(--bew-menu-item-radius);
  background: transparent;
  color: var(--bew-text-1);
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--bew-fill-2);
  }
}

@media (max-width: 480px) {
  .more-pop__mode-switcher {
    display: flex;
  }
}
</style>
