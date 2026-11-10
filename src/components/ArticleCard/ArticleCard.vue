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
  /** Unix 时间戳（秒或毫秒），或接口直接返回的展示文案 */
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

// 搜索接口给 Unix 秒，calcTimeSince 需要毫秒；收藏接口给的是展示文案
function formatDisplayTime(value: number | string | undefined) {
  if (value === undefined || value === null || value === '')
    return ''
  if (typeof value === 'string')
    return value
  return calcTimeSince(value < 1e12 ? value * 1000 : value)
}

const publishTimeText = computed(() => formatDisplayTime(props.publishTime))
</script>

<template>
  <!-- 整卡链接铺在底层，作者链接浮在上层，避免 <a> 嵌套（与 UserCard 相同做法） -->
  <div
    class="article-card"
    relative
    flex="~ gap-4 items-start" p-4
    rounded="$bew-card-radius"
    cursor-pointer
  >
    <ALink
      :href="articleUrl"
      :title="title"
      :aria-label="title"
      type="videoCard"
      class="article-card__link"
      absolute inset-0
      rounded="inherit"
    />
    <div
      class="article-content"
      relative pointer-events-none
      flex="~ col gap-2" flex-1 min-w-0
    >
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
      <div
        v-if="authorObject"
        flex="~ items-center" self-start max-w-full min-w-0
        pointer-events-auto
        :class="authorFontSizeClass"
      >
        <VideoCardAuthorAvatar v-if="authorObject.authorFace" :author="authorObject" compact />
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
      relative pointer-events-none
      w-32 h-24 flex-shrink-0
      rounded="$bew-media-radius"
      overflow-hidden
      bg="$bew-skeleton"
    >
      <img :src="cover" :alt="title" w-full h-full object-cover>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 与搜索页同级的 UserCard / MovieCard 一致：elevated 底，悬停加深、上浮并加阴影 */
.article-card {
  background-color: var(--bew-elevated);
  transition:
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-emphasized);

  &:hover {
    background-color: var(--bew-elevated-hover);
    transform: translateY(-2px);
    box-shadow: var(--bew-shadow-2);
  }
}

.article-card__link {
  color: inherit;
  text-decoration: none;
}
</style>
