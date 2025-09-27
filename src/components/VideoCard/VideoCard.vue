<script lang="ts" setup>
import { computed, useAttrs, useSlots } from 'vue'

import { settings } from '~/logic'
import type { VideoCardLayoutSetting } from '~/logic/storage'

import ModernVideoCard from './ModernVideoCard.vue'
import OldVideoCard from './OldVideoCard.vue'
import type { Video } from './types'

const props = withDefaults(defineProps<Props>(), {
  showWatcherLater: true,
  type: 'common',
  moreBtn: true,
})

interface Props {
  skeleton?: boolean
  video?: Video
  /** rcmd: recommend video; appRcmd: app recommend video; bangumi: bangumi video; common: common video */
  type?: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'
  showWatcherLater?: boolean
  horizontal?: boolean
  showPreview?: boolean
  moreBtn?: boolean
}

const slots = useSlots()
const attrs = useAttrs()

const layoutComponent = computed(() => {
  const layout = settings.value.videoCardLayout as VideoCardLayoutSetting | undefined
  return layout === 'old' ? OldVideoCard : ModernVideoCard
})

const hasDefaultSlot = computed(() => Boolean(slots.default))
const hasCoverTopLeftSlot = computed(() => Boolean(slots.coverTopLeft))
const forwardedProps = computed(() => ({
  ...attrs,
  ...props,
}))
</script>

<template>
  <component
    :is="layoutComponent"
    v-bind="forwardedProps"
  >
    <template v-if="hasDefaultSlot" #default>
      <slot />
    </template>
    <template v-if="hasCoverTopLeftSlot" #coverTopLeft>
      <slot name="coverTopLeft" />
    </template>
  </component>
</template>
