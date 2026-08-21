<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const list = computed(() => {
  return [
    {
      name: t('topbar.upload_dropdown.article'),
      url: 'https://member.bilibili.com/platform/upload/text/apply',
      icon: 'i-solar:document-add-bold-duotone',
    },
    {
      name: t('topbar.upload_dropdown.music'),
      url: 'https://member.bilibili.com/platform/upload/audio/frame',
      icon: 'i-solar:music-notes-bold-duotone',
    },
    {
      name: t('topbar.upload_dropdown.sticker'),
      url: 'https://member.bilibili.com/platform/upload/sticker',
      icon: 'i-solar:sticker-smile-square-bold-duotone',
    },
    {
      name: t('topbar.upload_dropdown.video'),
      url: 'https://member.bilibili.com/platform/upload/video/frame',
      icon: 'i-solar:video-frame-bold-duotone',
    },
    {
      name: t('topbar.upload_dropdown.manager'),
      url: 'https://member.bilibili.com/platform/upload-manager/article',
      icon: 'i-solar:video-library-bold-duotone',
    },
  ]
})
</script>

<template>
  <div
    bg="$bew-elevated"
    min-w="120px"
    shadow="$bew-shadow-3"
    border="1 $bew-popover-border-color"
    flex="~ col"
    class="upload-pop bew-popover bew-popover-inset"
    data-key="upload"
  >
    <a
      v-for="item in list"
      :key="item.url"
      class="upload-item"
      :href="item.url"
      target="_blank"
      flex="~ items-center gap-3"
      p="l-5 r-8 y-2"
      hover:bg="$bew-fill-2"
      rounded="$bew-menu-item-radius"
      transition="colors"
      duration="200"
      m="b-1 last:b-0"
    >
      <i :class="item.icon" text="$bew-text-2" />

      <div text-nowrap>{{ item.name }}</div>
    </a>
  </div>
</template>

<style lang="scss" scoped>

</style>
