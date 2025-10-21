<script setup lang="ts">
import { computed } from 'vue'

import UserCard from '~/components/UserCard/UserCard.vue'

import { convertLiveRoomData, convertUserCardData, formatNumber } from '../../searchTransforms'
import VideoGrid from './VideoGrid.vue'

const props = defineProps<{
  liveUserList: any[]
  liveRoomList: any[]
  currentSubCategory: 'all' | 'live_room' | 'live_user'
  liveUserTotalResults?: number
  liveRoomTotalResults?: number
  currentTotalResults: number
  userRelations: Record<number, { isFollowing: boolean, isLoading: boolean }>
  currentPage?: number
  paginationMode?: string
}>()

const emit = defineEmits<{
  followStateChanged: [data: { mid: number, isFollowing: boolean }]
  switchToLiveUser: []
}>()

// 检查是否在翻页模式下且不在第一页
const isInPaginationNonFirstPage = computed(() => {
  return props.paginationMode === 'pagination' && (props.currentPage || 1) > 1
})

function handleFollowStateChanged(mid: number, isFollowing: boolean) {
  emit('followStateChanged', { mid, isFollowing })
}

function formatResultCount(count: number): string {
  return formatNumber(count)
}
</script>

<template>
  <div class="live-results" space-y-6>
    <!-- 主播 (上面) -->
    <div
      v-if="!isInPaginationNonFirstPage
        && liveUserList.length > 0
        && (currentSubCategory === 'all' || currentSubCategory === 'live_user')"
    >
      <div flex items-center gap-3 mb-3>
        <h3 text="lg $bew-text-1" font-medium>
          主播
        </h3>
        <span text="sm $bew-text-3">
          共找到{{ formatResultCount(currentSubCategory === 'live_user' ? currentTotalResults : (liveUserTotalResults || liveUserList.length)) }}个结果
        </span>
      </div>
      <div grid="~ cols-3 gap-4">
        <UserCard
          v-for="user in (currentSubCategory === 'all'
            ? liveUserList.slice(0, 6)
            : liveUserList)"
          :key="user.mid || user.uid"
          v-bind="{
            ...convertUserCardData(user),
            isFollowed: userRelations[user.mid || user.uid]?.isFollowing ? 1 : 0,
          }"
          :compact="true"
          @follow-state-changed="handleFollowStateChanged"
        />
      </div>
      <!-- 查看更多按钮 (仅在全部模式下且主播总数>6时显示) -->
      <div
        v-if="currentSubCategory === 'all' && (liveUserTotalResults || 0) > 6"
        mt-4 flex justify-center
      >
        <button
          class="view-more-btn"
          px-6 py-2 rounded="$bew-radius-half"
          bg="$bew-fill-1 hover:$bew-fill-2"
          text="sm $bew-text-1"
          transition-all
          @click="emit('switchToLiveUser')"
        >
          查看更多主播 ({{ Math.max((liveUserTotalResults || 0) - 6, 0) }}+)
        </button>
      </div>
    </div>

    <!-- 直播间 (下面) -->
    <div
      v-if="liveRoomList.length > 0
        && (currentSubCategory === 'all' || currentSubCategory === 'live_room')"
    >
      <div flex items-center gap-3 mb-3>
        <h3 text="lg $bew-text-1" font-medium>
          直播间
        </h3>
        <span text="sm $bew-text-3">
          共找到{{ formatResultCount(currentSubCategory === 'live_room' ? currentTotalResults : (liveRoomTotalResults || liveRoomList.length)) }}个结果
        </span>
      </div>
      <VideoGrid :videos="liveRoomList.map(live => convertLiveRoomData(live))" :auto-convert="false" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.live-results {
  width: 100%;
}

.view-more-btn {
  cursor: pointer;
  border: none;
  outline: none;
}
</style>
