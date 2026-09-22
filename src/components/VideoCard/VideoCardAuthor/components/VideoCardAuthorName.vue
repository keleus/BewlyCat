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
      return t('video_card.group_contribution', { firstAuthor: props.author[0].name, num: props.author.length })
    return props.author[0]?.name
  }
  return props.author?.name
})
</script>

<template>
  <a
    class="channel-name keep-one-line"
    block min-w-0 max-w-full
    un-text="hover:$bew-theme-color"
    cursor-pointer mr-4
    :href="getAuthorJumpUrl(Array.isArray(author) ? author[0] : author)"
    :title="authorName"
    target="_blank"
    @click.stop=""
  >
    {{ authorName }}
  </a>
</template>
