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
    const likesCount = newVal.like ?? newVal.recv_like ?? 0
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
  if (settings.value.openNotificationsPageAsDrawer) {
    emit('itemClick', item)
  }
}
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
    bg="$bew-elevated"
    p="4"
    rounded="$bew-radius"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-border-color"
    flex="~ col"
    class="notifications-pop bew-popover"
    data-key="notifications"
  >
    <ALink
      v-for="item in list"
      :key="item.name"
      :href="item.url"
      type="topBar"
      pos="relative"
      flex="~ items-center justify-between gap-2"
      p="x-4 y-2"
      bg="hover:$bew-fill-2"
      rounded="$bew-radius"
      transition="all duration-300"
      m="b-1 last:b-0"
      :custom-click-event="settings.openNotificationsPageAsDrawer"
      @click="(event: MouseEvent) => handleClick(event, item)"
    >
      <div flex="~ items-center gap-2">
        <i :class="item.icon" text="$bew-text-2" />
        <span flex="1 shrink-0" text-nowrap>{{ item.name }}</span>
      </div>
      <!-- Use visibility to control the number of notifications to prevent width changes as soon as there is a number -->
      <div
        :style="{ visibility: item.unreadCount > 0 ? 'visible' : 'hidden' }"
        bg="$bew-theme-color"
        rounded="$bew-radius"
        text="white xs leading-none center"
        grid="~ place-items-center"
        px-1
        min-w="16px"
        h="16px"
      >
        {{ item.unreadCount > 99 ? '99+' : item.unreadCount }}
      </div>
    </ALink>
  </div>
</template>
