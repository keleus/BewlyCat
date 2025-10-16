<script lang="ts" setup>
import { computed } from 'vue'

interface UserCardProps {
  mid: number
  name: string
  face: string
  sign?: string
  fans?: number
  videos?: number
  isVerified?: boolean
  verifyInfo?: string
  horizontal?: boolean
  samples?: UserSample[]
}

const props = withDefaults(defineProps<UserCardProps>(), {
  horizontal: false,
  samples: () => [],
})

interface UserSample {
  id: string
  title: string
  cover?: string
  url?: string
  duration?: string
  play?: number
}

const sampleList = computed(() => {
  return (props.samples || []).slice(0, 6)
})

// 格式化数字
function formatNumber(num: number | undefined) {
  if (!num)
    return '0'
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}万`
  }
  return num.toString()
}

function openUserSpace() {
  window.open(`https://space.bilibili.com/${props.mid}`, '_blank')
}
</script>

<template>
  <div
    class="user-card"
    :class="{ horizontal }"
    flex items-center gap-3
    p="3 hover:4"
    bg="$bew-elevated hover:$bew-elevated-hover"
    rounded="$bew-radius"
    transition-all duration-300 cursor-pointer
    @click="openUserSpace"
  >
    <!-- 头像 -->
    <div class="avatar-wrapper" flex-shrink-0>
      <img
        :src="face"
        :alt="name"
        class="avatar"
        :class="horizontal ? 'w-12 h-12' : 'w-16 h-16'"
        rounded-full object-cover
      >
    </div>

    <!-- 用户信息 -->
    <div class="user-info" flex-1 min-w-0>
      <!-- 用户名和认证 -->
      <div flex items-center gap-2 mb-1>
        <div class="username" text="base $bew-text-1" font-medium truncate>
          {{ name }}
        </div>
        <div
          v-if="isVerified && verifyInfo"
          class="verify-badge"
          flex items-center gap-1
          text="xs $bew-theme-color"
          bg="$bew-theme-color-20"
          px-2 py-0.5 rounded-full
        >
          <div i-tabler:rosette-discount-check />
          <span>{{ verifyInfo }}</span>
        </div>
      </div>

      <!-- 签名 -->
      <div
        v-if="sign"
        class="sign"
        text="sm $bew-text-2"
        line-clamp-1
      >
        {{ sign }}
      </div>

      <!-- 统计信息 -->
      <div
        class="stats" flex items-center gap-3 text="xs $bew-text-3"
        mt-1
      >
        <span v-if="fans !== undefined">{{ formatNumber(fans) }} 粉丝</span>
        <span v-if="videos !== undefined">{{ videos }} 视频</span>
      </div>

      <div
        v-if="sampleList.length"
        class="sample-list"
      >
        <a
          v-for="sample in sampleList"
          :key="sample.id"
          class="sample-card"
          :href="sample.url"
          target="_blank"
          rel="noopener"
          @click.stop
        >
          <div class="sample-cover">
            <img
              v-if="sample.cover"
              :src="sample.cover"
              :alt="sample.title"
            >
            <div v-if="sample.duration" class="sample-duration">
              {{ sample.duration }}
            </div>
            <div v-if="sample.play !== undefined" class="sample-play">
              <div i-tabler:player-play />
              <span>{{ formatNumber(sample.play) }}</span>
            </div>
          </div>
          <div class="sample-title" :title="sample.title">
            {{ sample.title }}
          </div>
        </a>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.user-card {
  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--bew-shadow-2);
  }

  &.horizontal {
    padding: 0.75rem;

    .avatar-wrapper {
      width: 3rem;
      height: 3rem;
    }
  }
}

.sample-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.sample-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  cursor: pointer;

  &:hover .sample-title {
    color: var(--bew-theme-color);
  }
}

.sample-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: calc(var(--bew-radius-half) - 2px);
  overflow: hidden;
  background: var(--bew-skeleton);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.sample-duration {
  position: absolute;
  bottom: 0.5rem;
  right: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
}

.sample-play {
  position: absolute;
  left: 0.5rem;
  bottom: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);

  i {
    font-size: 0.9em;
  }
}

.sample-title {
  font-size: 0.8125rem;
  color: var(--bew-text-1);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
