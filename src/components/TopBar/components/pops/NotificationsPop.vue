<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'
import { settings } from '~/logic'
import { getNotificationBadgeCounts } from '~/utils/notificationBadge'

const props = defineProps<{
  // 接收外部传入的通知数据
  unReadMessage?: Partial<UnReadMessage>
  unReadDm?: Partial<UnReadDm>
}>()

const emit = defineEmits<{
  (e: 'itemClick', item: { name: string, url: string, unreadCount: number, icon: string }): void
}>()

const { t } = useI18n()
const counts = computed(() => getNotificationBadgeCounts(settings.value, props.unReadMessage, props.unReadDm))
const list = computed((): { name: string, url: string, unreadCount: number, icon: string }[] => [
  {
    name: t('topbar.noti_dropdown.replys'),
    url: 'https://message.bilibili.com/#/reply',
    unreadCount: counts.value.reply,
    icon: 'i-solar:reply-2-bold-duotone',
  },
  {
    name: t('topbar.noti_dropdown.mentions'),
    url: 'https://message.bilibili.com/#/at',
    unreadCount: counts.value.at,
    icon: 'i-solar:mention-circle-bold-duotone',
  },
  {
    name: t('topbar.noti_dropdown.likes'),
    url: 'https://message.bilibili.com/#/love',
    unreadCount: counts.value.like,
    icon: 'i-solar:like-bold-duotone',
  },
  {
    name: t('topbar.noti_dropdown.messages'),
    url: 'https://message.bilibili.com/#/system',
    unreadCount: counts.value.sys_msg,
    icon: 'i-solar:chat-line-bold-duotone',
  },
  {
    name: t('topbar.noti_dropdown.chats'),
    url: 'https://message.bilibili.com/#/whisper',
    unreadCount: counts.value.follow_unread + counts.value.unfollow_unread,
    icon: 'i-solar:chat-round-bold-duotone',
  },
])

function handleClick(event: MouseEvent, item: { name: string, url: string, unreadCount: number, icon: string }) {
  emit('itemClick', item)
}
</script>

<template>
  <div
    bg="$bew-elevated"
    shadow="$bew-shadow-3"
    border="1 $bew-popover-border-color"
    flex="~ col"
    class="notifications-pop bew-popover bew-popover-inset"
    data-key="notifications"
  >
    <ALink
      v-for="item in list"
      :key="item.name"
      :href="item.url"
      type="topBar"
      pos="relative"
      flex="~ items-center justify-between"
      p="l-5 r-8 y-2"
      hover:bg="$bew-fill-2"
      rounded="$bew-menu-item-radius"
      transition="colors"
      duration="200"
      m="b-1 last:b-0"
      :custom-click-event="settings.openNotificationsPageAsDrawer"
      @click="(event: MouseEvent) => handleClick(event, item)"
    >
      <div flex="~ items-center gap-2">
        <i :class="item.icon" text="$bew-text-2" />
        <span flex="1 shrink-0" text-nowrap>{{ item.name }}</span>
      </div>
      <Transition name="notification-badge">
        <div
          v-if="item.unreadCount > 0"
          class="notification-badge"
          bg="$bew-theme-color"
          rounded="$bew-badge-radius"
          text="white xs leading-none center"
          grid="~ place-items-center"
          px-1
          h="16px"
        >
          {{ item.unreadCount > 99 ? '99+' : item.unreadCount }}
        </div>
      </Transition>
    </ALink>
  </div>
</template>

<style scoped lang="scss">
.notification-badge {
  min-width: var(--bew-space-4);
  max-width: var(--bew-space-8);
  margin-left: var(--bew-space-3);
  overflow: hidden;
  transition:
    min-width var(--bew-duration-normal) var(--bew-ease-standard),
    max-width var(--bew-duration-normal) var(--bew-ease-standard),
    margin-left var(--bew-duration-normal) var(--bew-ease-standard),
    padding-inline var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard);
}

.notification-badge-enter-from,
.notification-badge-leave-to {
  min-width: 0;
  max-width: 0;
  margin-left: 0;
  padding-inline: 0;
  opacity: 0;
  transform: scale(0.8);
}
</style>
