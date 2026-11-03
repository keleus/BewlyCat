<script lang="ts" setup>
import ALink from '~/components/ALink.vue'
import type { Author } from '~/components/VideoCard/types'
import VideoCardAuthorAvatar from '~/components/VideoCard/VideoCardAuthor/components/VideoCardAuthorAvatar.vue'
import VideoCardAuthorName from '~/components/VideoCard/VideoCardAuthor/components/VideoCardAuthorName.vue'
import { useVideoCardSharedStyles } from '~/composables/useVideoCardSharedStyles'
import { calcTimeSince, numFormatter } from '~/utils/dataFormatter'

interface ArticleCardProps {
  id: number | string
  url?: string
  title: string
  desc?: string
  cover?: string
  author: string
  authorMid?: number
  /** 接口返回的 UP 主头像地址，缺失时不渲染头像 */
  authorFace?: string
  /** 数字或接口已格式化文案（如 "20.4万"） */
  view?: number | string
  like?: number | string
  reply?: number | string
  /** Unix 秒级时间戳，或接口直接返回的展示文案 */
  publishTime?: number | string
  categoryName?: string
  tags?: Array<{ name: string }>
}

const props = defineProps<ArticleCardProps>()

// 与视频卡片共用同一套字号设置（标题/作者/元信息随用户设置联动）
const { titleFontSizeClass, titleStyle, authorFontSizeClass, metaFontSizeClass } = useVideoCardSharedStyles()

const articleUrl = computed(() => {
  if (props.url)
    return props.url

  const id = String(props.id)
  if (/^\d{15,}$/.test(id))
    return `https://www.bilibili.com/opus/${id}`
  return `https://www.bilibili.com/read/cv${id.replace(/^cv/, '')}`
})

const authorObject = computed<Author | undefined>(() => {
  if (!props.author)
    return undefined
  return {
    name: props.author,
    mid: props.authorMid,
    authorFace: props.authorFace ?? '',
  }
})

// 数字走共享格式化（与视频卡片一致，支持 i18n 单位）；接口文案原样展示
function formatDisplayNumber(value: number | string | undefined) {
  if (value === undefined || value === null || value === '')
    return '0'
  return typeof value === 'string' ? value : numFormatter(value)
}

function formatDisplayTime(value: number | string | undefined) {
  if (value === undefined || value === null || value === '')
    return ''
  return typeof value === 'string' ? value : calcTimeSince(value)
}

const publishTimeText = computed(() => formatDisplayTime(props.publishTime))
</script>

<template>
  <ALink
    :href="articleUrl"
    type="videoCard"
    class="article-card article-card--interactive"
    flex="~ gap-4 items-start" p-4
    rounded="$bew-card-radius"
    cursor-pointer
  >
    <div class="article-content" flex="~ col gap-2" flex-1 min-w-0>
      <!-- 标题：与视频卡片同款字号档位与两行截断 -->
      <h3
        class="keep-two-lines"
        :class="titleFontSizeClass"
        text="overflow-ellipsis $bew-text-1"
        :style="titleStyle"
        :title="title"
      >
        {{ title }}
      </h3>

      <p v-if="desc" text="sm $bew-text-2" line-clamp-2>
        {{ desc }}
      </p>

      <!-- 作者行：复用视频卡片头像与昵称组件（昵称悬停变主题色） -->
      <div v-if="authorObject" flex="~ items-center" min-w-0 :class="authorFontSizeClass">
        <VideoCardAuthorAvatar v-if="authorObject.authorFace" :author="authorObject" />
        <VideoCardAuthorName :author="authorObject" />
      </div>

      <!-- 元信息：分区/时间为 fill-1 胶囊，统计为图标+文案，与视频卡片 meta 行一致 -->
      <div class="article-meta" flex="~ items-center gap-2 wrap" :class="metaFontSizeClass">
        <span
          v-if="categoryName"
          bg="$bew-fill-1" p="x-2" lh-6 rounded="$bew-radius" text="$bew-text-3"
        >
          {{ categoryName }}
        </span>
        <span
          v-if="publishTimeText"
          bg="$bew-fill-1" p="x-2" lh-6 rounded="$bew-radius" text="$bew-text-3"
        >
          {{ publishTimeText }}
        </span>
        <span v-if="view !== undefined" flex="~ items-center gap-1" text="$bew-text-3">
          <div i-tabler:eye />
          <span>{{ formatDisplayNumber(view) }}</span>
        </span>
        <span v-if="like !== undefined" flex="~ items-center gap-1" text="$bew-text-3">
          <div i-tabler:thumb-up />
          <span>{{ formatDisplayNumber(like) }}</span>
        </span>
        <span v-if="reply !== undefined" flex="~ items-center gap-1" text="$bew-text-3">
          <div i-tabler:message />
          <span>{{ formatDisplayNumber(reply) }}</span>
        </span>
      </div>

      <div v-if="tags && tags.length > 0" flex="~ wrap gap-2">
        <span
          v-for="tag in tags.slice(0, 3)"
          :key="tag.name"
          text="xs $bew-text-3"
          bg="$bew-fill-1"
          p="x-2 y-0.5"
          rounded-full
        >
          {{ tag.name }}
        </span>
      </div>
    </div>

    <!-- 右侧封面：保留横向布局 -->
    <div
      v-if="cover"
      class="article-cover"
      w-32 h-24 flex-shrink-0
      rounded="$bew-media-radius"
      overflow-hidden
      bg="$bew-skeleton"
    >
      <img :src="cover" :alt="title" w-full h-full object-cover>
    </div>
  </ALink>
</template>

<style lang="scss" scoped>
.article-card {
  text-decoration: none;
  color: inherit;
  display: flex;
}

/* 图文卡片文字占比高、封面小，需要常态容器底（elevated）才能成组；
   卡片本身已有底色，悬停只做背景加深（不向外扩环，避免色环与底色粘连），按下 fill-3 */
.article-card--interactive {
  background-color: var(--bew-elevated);
  transition: background-color 0.2s ease;
}

/* 只在支持 hover 的设备上启用（与视频卡片相同，避免触屏性能损失） */
@media (hover: hover) and (pointer: fine) {
  .article-card--interactive:hover {
    background-color: var(--bew-elevated-hover);
  }
}

.article-card--interactive:active {
  background-color: var(--bew-fill-3);
}
</style>
