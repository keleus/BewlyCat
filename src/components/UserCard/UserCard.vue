<script lang="ts" setup>
import DOMPurify from 'dompurify'
import { computed, ref, watch } from 'vue'

import api from '~/utils/api'
import { LV0_ICON, LV1_ICON, LV2_ICON, LV3_ICON, LV4_ICON, LV5_ICON, LV6_ICON } from '~/utils/lvIcons'
import { getCSRF } from '~/utils/main'

interface UserCardProps {
  mid: number
  name: string
  face: string
  sign?: string
  fans?: number
  videos?: number
  level?: number // 用户等级 0-6
  gender?: number // 0:保密, 1:男, 2:女
  isVerified?: boolean
  verifyInfo?: string
  horizontal?: boolean
  samples?: UserSample[]
  isFollowed?: number // 0: 未关注, 1: 已关注
  showFollowButton?: boolean
  compact?: boolean // 紧凑模式，用于用户Tab，不显示代表作
  liveStatus?: number // 直播状态: 0-未直播, 1-直播中
  roomid?: number // 直播间ID
}

const props = withDefaults(defineProps<UserCardProps>(), {
  horizontal: false,
  samples: () => [],
  isFollowed: 0,
  showFollowButton: true,
  compact: false,
})

const emit = defineEmits<{
  followStateChanged: [mid: number, isFollowing: boolean]
}>()

interface UserSample {
  id: string
  title: string
  cover?: string
  url?: string
  duration?: string
  play?: number
}

const sampleList = computed(() => {
  return (props.samples || []).slice(0, 7)
})

const isFollowing = ref(props.isFollowed === 1)
const isFollowLoading = ref(false)

// 监听 isFollowed prop 的变化
watch(() => props.isFollowed, (newVal) => {
  isFollowing.value = newVal === 1
})

const followButtonText = computed(() => {
  if (isFollowLoading.value)
    return '...'
  return isFollowing.value ? '已关注' : '+ 关注'
})

const levelIcons: string[] = [
  LV0_ICON,
  LV1_ICON,
  LV2_ICON,
  LV3_ICON,
  LV4_ICON,
  LV5_ICON,
  LV6_ICON,
]

function getLvIcon(level: number): string {
  return levelIcons[level] || LV0_ICON
}

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

async function handleFollowClick(e: Event) {
  e.stopPropagation()

  if (isFollowLoading.value)
    return

  try {
    isFollowLoading.value = true
    const csrf = getCSRF()

    // act: 1=关注, 2=取关
    const act = isFollowing.value ? 2 : 1

    const response = await api.user.relationModify({
      fid: String(props.mid),
      act,
      re_src: 11, // 11=搜索结果页
      csrf,
    })

    if (response.code === 0) {
      isFollowing.value = !isFollowing.value
      // 通知父组件关注状态已改变
      emit('followStateChanged', props.mid, isFollowing.value)
    }
    else {
      console.error('关注操作失败:', response.message)
    }
  }
  catch (error) {
    console.error('关注操作出错:', error)
  }
  finally {
    isFollowLoading.value = false
  }
}
</script>

<template>
  <div
    class="user-card transition-all duration-300 cursor-pointer"
    :class="[
      { horizontal, compact },
    ]"
    relative
    flex
    align-items-center
    gap-3
    p-3
    :bg="compact ? '$bew-elevated' : '$bew-elevated hover:$bew-elevated-hover'"
    rounded="$bew-radius"
    cursor="pointer"
    @click="openUserSpace()"
  >
    <!-- Compact模式布局 -->
    <template v-if="compact">
      <div flex items-center gap-5 w-full>
        <!-- 左侧：头像（带角标） -->
        <div class="avatar-wrapper-compact" relative flex-shrink-0 cursor-pointer @click="openUserSpace">
          <img
            :src="face"
            :alt="name"
            class="avatar"
            w-24 h-24
            rounded-full object-cover
          >
          <!-- 官方认证角标 -->
          <span
            v-if="isVerified && verifyInfo && verifyInfo.includes('官方')"
            class="bili-avatar-icon bili-avatar-right-icon bili-avatar-icon-business bili-avatar-size-86"
          />
          <!-- 个人认证角标 -->
          <span
            v-else-if="isVerified && verifyInfo"
            class="bili-avatar-icon bili-avatar-right-icon bili-avatar-icon-personal bili-avatar-size-86"
          />
        </div>

        <!-- 右侧：用户信息 + 简介 + 关注按钮 -->
        <div flex="~ col gap-1.5" flex-1 min-w-0>
          <!-- 用户名 + 等级 + 性别 -->
          <div flex items-center gap-2>
            <div
              class="username" text="base $bew-text-1" font-medium truncate cursor-pointer
              @click="openUserSpace"
            >
              {{ name }}
            </div>
            <div
              v-if="level !== undefined"
              class="user-level-icon"
              v-html="DOMPurify.sanitize(getLvIcon(level))"
            />
            <div v-if="gender === 1" class="gender-icon gender-male">
              <div i-tabler:gender-male />
            </div>
            <div v-else-if="gender === 2" class="gender-icon gender-female">
              <div i-tabler:gender-female />
            </div>
          </div>

          <!-- 简介（单行） -->
          <div
            class="sign-compact-single"
            text="sm $bew-text-2"
            truncate
          >
            {{ sign || '这个人很懒，什么都没有写~' }}
          </div>

          <!-- 统计信息行 -->
          <div
            v-if="fans || videos || liveStatus === 1"
            flex items-center gap-3
            text="xs $bew-text-3"
          >
            <div v-if="liveStatus === 1" flex items-center gap-1 class="live-status-badge">
              <div i-tabler:live-photo w-3.5 h-3.5 />
              <span>直播中</span>
            </div>
            <div v-if="videos" flex items-center gap-1>
              <div i-tabler:video w-3.5 h-3.5 />
              <span>{{ formatNumber(videos) }}个投稿</span>
            </div>
            <div v-if="fans" flex items-center gap-1>
              <div i-tabler:users w-3.5 h-3.5 />
              <span>{{ formatNumber(fans) }}粉丝</span>
            </div>
          </div>

          <!-- 关注按钮 -->
          <div
            v-if="showFollowButton"
            flex items-center
          >
            <button
              class="follow-button-compact"
              :class="{ followed: isFollowing }"
              :disabled="isFollowLoading"
              @click="handleFollowClick"
            >
              {{ followButtonText }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 非Compact模式布局 -->
    <template v-else>
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
          class="stats"
          flex items-center gap-3 text="xs $bew-text-3"
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
    </template>
  </div>
</template>

<style lang="scss" scoped>
.user-card {
  &:not(.compact):hover {
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

  &.compact {
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--bew-shadow-2);
    }

    &:active {
      transform: translateY(0) scale(0.98);
    }
  }
}

.sign-compact {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.user-level-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  :deep(svg) {
    width: 25px;
    height: 16px;
  }
}

.gender-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  flex-shrink: 0;

  &.gender-male {
    color: rgb(93, 193, 255); // 淡蓝色
  }

  &.gender-female {
    color: rgb(255, 135, 182); // 淡粉色
  }
}

.verify-compact {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.follow-button {
  padding: 0.5rem 1.25rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-theme-color);
  color: white;
  font-size: 0.875rem;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  min-width: 80px;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.followed {
    background: var(--bew-fill-2);
    color: var(--bew-text-2);
    border: 1px solid var(--bew-border-color);

    &:hover:not(:disabled) {
      background: var(--bew-fill-3);
      color: var(--bew-text-1);
    }
  }
}

.sample-list {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
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

.avatar-wrapper-compact {
  position: relative;
}

.bili-avatar-icon {
  position: absolute;
  display: block;
  border-radius: 50%;
  border: 2px solid var(--bew-elevated);
}

.bili-avatar-right-icon {
  right: -2px;
  bottom: -2px;
}

.bili-avatar-size-86 {
  width: 22px;
  height: 22px;
}

.bili-avatar-icon-business {
  background: linear-gradient(135deg, #ff6699 0%, #ff8cb6 100%);

  &::before {
    content: "";
    display: block;
    width: 100%;
    height: 100%;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'%3E%3Cpath d='M8 0L10.5 5.5L16 6.5L11.5 10.5L13 16L8 13L3 16L4.5 10.5L0 6.5L5.5 5.5L8 0Z'/%3E%3C/svg%3E")
      center/60% no-repeat;
  }
}

.bili-avatar-icon-personal {
  background: linear-gradient(135deg, #23ade5 0%, #3db8f5 100%);

  &::before {
    content: "";
    display: block;
    width: 100%;
    height: 100%;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'%3E%3Cpath d='M13 5L6 12L3 9L4 8L6 10L12 4L13 5Z'/%3E%3C/svg%3E")
      center/70% no-repeat;
  }
}

.live-status-badge {
  color: var(--bew-theme-color);
  font-weight: 500;
}

.follow-button-compact {
  padding: 0.35rem 0.75rem;
  border-radius: var(--bew-radius-half);
  background: var(--bew-theme-color);
  color: white;
  font-size: 0.875rem;
  border: 1px solid var(--bew-theme-color);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  min-width: 60px;
  user-select: none;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &.followed {
    background: var(--bew-fill-1);
    color: var(--bew-text-2);
    border: 1px solid transparent;

    &:hover:not(:disabled) {
      background: var(--bew-fill-2);
    }
  }
}
</style>
