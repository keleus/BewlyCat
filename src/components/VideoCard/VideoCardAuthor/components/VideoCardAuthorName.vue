<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import { getAuthorJumpUrl } from '~/components/VideoCard/utils'

import type { Author } from '../../types'

const props = defineProps<{
  author?: Author | Author[]
}>()
const { t } = useI18n()
const authorName = computed(() => {
  if (Array.isArray(props.author)) {
    if (props.author.length > 1)
      return t('video_card.group_contribution', {
        firstAuthor: props.author[0].name,
        num: props.author.length,
      })
    return props.author[0]?.name
  }
  return props.author?.name
})
const authorJumpUrl = computed(() =>
  getAuthorJumpUrl(Array.isArray(props.author) ? props.author[0] : props.author),
)
</script>

<template>
  <component
    :is="authorJumpUrl ? 'a' : 'span'"
    class="channel-name keep-one-line"
    block
    min-w-0
    max-w-full
    :class="authorJumpUrl ? 'cursor-pointer hover:text-$bew-theme-color' : ''"
    mr-4
    :href="authorJumpUrl || undefined"
    :title="authorName"
    :target="authorJumpUrl ? '_blank' : undefined"
    @click="authorJumpUrl ? $event.stopPropagation() : undefined"
  >
    {{ authorName }}
  </component>
</template>
