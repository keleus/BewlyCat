<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { getUserID } from '~/utils/main'
import { getBadgeType, isComponentVisible } from '~/utils/topBarBadge'

const props = defineProps<{ getItemHref: (key: string, url: string) => string }>()

const emit = defineEmits<{
  (e: 'bewlyPageClick', event: MouseEvent, key: string): void
  (e: 'notificationsClick', event: MouseEvent): void
}>()
const { t } = useI18n()
const store = useTopBarStore()
const badgeCounts = computed<Record<string, number>>(() => ({
  notifications: store.unReadMessageCount,
  moments: store.newMomentsCount,
  watchLater: store.watchLaterCount,
}))

const list = computed((): { name: string, url: string, icon: string, bewlyKey?: string, key: string }[] => [
  { key: 'notifications', name: t('topbar.notifications'), url: '//message.bilibili.com', icon: 'i-mingcute:notification-line' },
  { key: 'moments', name: t('topbar.moments'), url: '//t.bilibili.com/', icon: 'i-tabler:windmill', bewlyKey: 'moments' },
  { key: 'favorites', name: t('topbar.favorites'), url: `//space.bilibili.com/${store.userInfo.mid || getUserID() || ''}/favlist`, icon: 'i-mingcute:star-line', bewlyKey: 'favorites' },
  { key: 'history', name: t('topbar.history'), url: '//www.bilibili.com/history', icon: 'i-mingcute:time-line', bewlyKey: 'history' },
  { key: 'watchLater', name: t('topbar.watch_later'), url: '//www.bilibili.com/watchlater/#/list', icon: 'i-mingcute:carplay-line', bewlyKey: 'watchLater' },
  { key: 'creatorCenter', name: t('topbar.creative_center'), url: '//member.bilibili.com/platform/home', icon: 'i-mingcute:bulb-line' },
  { key: 'upload', name: t('topbar.upload'), url: 'https://member.bilibili.com/platform/upload/video/frame', icon: 'i-mingcute:upload-line' },
].filter(item => isComponentVisible(item.key)))

function handleClick(event: MouseEvent, item: typeof list.value[number]) {
  if (item.key === 'notifications' && settings.value.openNotificationsPageAsDrawer)
    emit('notificationsClick', event)
  else if (item.bewlyKey)
    emit('bewlyPageClick', event, item.bewlyKey)
}
</script>

<template>
  <div
    flex="~ col"
    class="more-pop bew-popover bew-popover-surface bew-popover-inset"
    data-key="more"
  >
    <ALink
      v-for="item in list"
      :key="item.key"
      :data-top-bar-action="item.key"
      :href="props.getItemHref(item.key, item.url)"
      type="topBar"
      :custom-click-event="(item.key === 'notifications' && settings.openNotificationsPageAsDrawer) || (!!item.bewlyKey && !settings.touchScreenOptimization && settings.openTopBarItemsInBewly)"
      pos="relative"
      p="x-5 y-2"
      hover:bg="$bew-fill-2"
      rounded="$bew-menu-item-radius"
      transition="colors"
      duration="200"
      m="b-1 last:b-0"
      flex="~ items-center gap-3"
      @click="handleClick($event, item)"
    >
      <i :class="item.icon" />
      <span class="flex-1">{{ item.name }}</span>
      <span
        v-if="badgeCounts[item.key] > 0 && getBadgeType(item.key) !== 'none'"
        class="more-pop__badge" :class="{ 'more-pop__badge--dot': getBadgeType(item.key) === 'dot' }"
      >
        {{ getBadgeType(item.key) === 'number' ? (badgeCounts[item.key] > 99 ? '99+' : badgeCounts[item.key]) : '' }}
      </span>
    </ALink>
  </div>
</template>

<style scoped lang="scss">
.more-pop.bew-popover {
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.more-pop__badge {
  flex: none;
  min-width: var(--bew-space-4);
  padding-inline: var(--bew-space-1);
  border-radius: var(--bew-badge-radius);
  color: white;
  background: var(--bew-theme-color);
  text-align: center;
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  &--dot {
    min-width: 0;
    width: var(--bew-space-2);
    height: var(--bew-space-2);
    padding: 0;
  }
}
</style>
