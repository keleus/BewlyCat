<script lang="ts" setup>
interface ArticleCardProps {
  id: number
  title: string
  desc?: string
  cover?: string
  author: string
  authorMid?: number
  view?: number
  like?: number
  reply?: number
  publishTime?: number
  categoryName?: string
  tags?: Array<{ name: string }>
}

const props = defineProps<ArticleCardProps>()

// 格式化数字
function formatNumber(num: number | undefined) {
  if (!num)
    return '0'
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}万`
  }
  return num.toString()
}

// 格式化日期
function formatDate(timestamp: number | undefined) {
  if (!timestamp)
    return ''

  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60))
      return minutes === 0 ? '刚刚' : `${minutes}分钟前`
    }
    return `${hours}小时前`
  }
  else if (days === 1) {
    return '昨天'
  }
  else if (days < 30) {
    return `${days}天前`
  }
  else if (days < 365) {
    return `${Math.floor(days / 30)}个月前`
  }
  else {
    return `${Math.floor(days / 365)}年前`
  }
}

function openArticle() {
  window.open(`https://www.bilibili.com/read/cv${props.id}`, '_blank')
}
</script>

<template>
  <div
    class="article-card"
    flex gap-4 p-4
    bg="$bew-elevated hover:$bew-elevated-hover"
    rounded="$bew-radius"
    transition-all duration-300 cursor-pointer
    @click="openArticle"
  >
    <!-- 左侧内容 -->
    <div class="article-content" flex-1 min-w-0>
      <!-- 标题 -->
      <h3
        class="article-title"
        text="base $bew-text-1"
        font-medium
        line-clamp-2
        mb-2
      >
        {{ title }}
      </h3>

      <!-- 描述 -->
      <p
        v-if="desc"
        class="article-desc"
        text="sm $bew-text-2"
        line-clamp-2
        mb-2
      >
        {{ desc }}
      </p>

      <!-- 元信息 -->
      <div class="article-meta" flex items-center gap-3 text="xs $bew-text-3">
        <span class="author">{{ author }}</span>
        <span v-if="categoryName">{{ categoryName }}</span>
        <span v-if="publishTime">{{ formatDate(publishTime) }}</span>
      </div>

      <!-- 统计信息 -->
      <div
        class="article-stats" flex items-center gap-3 text="xs $bew-text-3"
        mt-2
      >
        <div v-if="view !== undefined" flex items-center gap-1>
          <div i-tabler:eye />
          <span>{{ formatNumber(view) }}</span>
        </div>
        <div v-if="like !== undefined" flex items-center gap-1>
          <div i-tabler:thumb-up />
          <span>{{ formatNumber(like) }}</span>
        </div>
        <div v-if="reply !== undefined" flex items-center gap-1>
          <div i-tabler:message />
          <span>{{ formatNumber(reply) }}</span>
        </div>
      </div>

      <!-- 标签 -->
      <div
        v-if="tags && tags.length > 0"
        class="article-tags"
        flex flex-wrap gap-2 mt-2
      >
        <span
          v-for="tag in tags.slice(0, 3)"
          :key="tag.name"
          text="xs $bew-text-3"
          bg="$bew-fill-1"
          px-2 py-0.5
          rounded-full
        >
          {{ tag.name }}
        </span>
      </div>
    </div>

    <!-- 右侧图片 -->
    <div
      v-if="cover"
      class="article-cover"
      w-32 h-24
      rounded="$bew-radius-half"
      overflow-hidden
      flex-shrink-0
      bg="$bew-fill-1"
    >
      <img
        :src="cover"
        :alt="title"
        w-full h-full object-cover
      >
    </div>
  </div>
</template>

<style lang="scss" scoped>
.article-card {
  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--bew-shadow-2);
  }
}
</style>
