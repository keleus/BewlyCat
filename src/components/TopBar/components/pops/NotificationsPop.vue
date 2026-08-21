<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'

const props = defineProps<{
  // 接收外部传入的通知数据
  unReadMessage?: any
  unReadDm?: any
}>()

const emit = defineEmits<{
  (e: 'itemClick', item: { name: string, url: string, unreadCount: number, icon: string }): void
}>()

const { t } = useI18n()
const list = computed((): { name: string, url: string, unreadCount: number, icon: string }[] => [
  {
    name: t('topbar.noti_dropdown.replys'),
    url: 'https://message.bilibili.com/#/reply',
    unreadCount: 0,
    icon: 'i-solar:reply-2-bold-duotone',
  },
  {
    name: t('topbar.noti_dropdown.mentions'),
    url: 'https://message.bilibili.com/#/at',
    unreadCount: 0,
    icon: 'i-solar:mention-circle-bold-duotone',
  },
  {
    name: t('topbar.noti_dropdown.likes'),
    url: 'https://message.bilibili.com/#/love',
    unreadCount: 0,
    icon: 'i-solar:like-bold-duotone',
  },
  {
    name: t('topbar.noti_dropdown.messages'),
    url: 'https://message.bilibili.com/#/system',
    unreadCount: 0,
    icon: 'i-solar:chat-line-bold-duotone',
  },
  {
    name: t('topbar.noti_dropdown.chats'),
    url: 'https://message.bilibili.com/#/whisper',
    unreadCount: 0,
    icon: 'i-solar:chat-round-bold-duotone',
  },
])

// 监听外部传入的数据变化，更新列表
watch(() => props.unReadMessage, (newVal) => {
  if (newVal) {
    list.value[0].unreadCount = newVal.reply || 0
    list.value[1].unreadCount = newVal.at || 0
    const likeCount = typeof newVal.like === 'number' ? newVal.like : 0
    const recvLikeCount = typeof newVal.recv_like === 'number' ? newVal.recv_like : 0
    const likesCount = Math.max(likeCount, recvLikeCount)
    list.value[2].unreadCount = likesCount
    list.value[3].unreadCount = newVal.sys_msg || 0
  }
}, { immediate: true, deep: true })

watch(() => props.unReadDm, (newVal) => {
  if (newVal) {
    // 同时处理follow_unread和unfollow_unread
    list.value[4].unreadCount = (newVal.follow_unread || 0) + (newVal.unfollow_unread || 0)
  }
}, { immediate: true, deep: true })

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
