<script setup lang="ts">
import { storeToRefs } from 'pinia'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import Progress from '~/components/Progress.vue'
import { getAuthorJumpUrl } from '~/components/VideoCard/utils'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import type { List as WatchLaterItem } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { isActualHomepage, isHomePage, isInIframe, removeHttpFromUrl } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'
import { getWatchLaterAuthor } from '~/utils/watchLater'

import PopCoverIconButton from './PopCoverIconButton.vue'
import PopMediaCard from './PopMediaCard.vue'

const emit = defineEmits<{ addOpenTabs: [] }>()

const topBarStore = useTopBarStore()
const { watchLaterList, isLoadingWatchLater, watchLaterCount, isAddingOpenTabsToWatchLater } = storeToRefs(topBarStore)
const viewAllUrl = computed((): string => {
  return 'https://www.bilibili.com/watchlater/list'
})
const playAllUrl = computed((): string => {
  return 'https://www.bilibili.com/list/watchlater'
})

const scrollContainer = ref<HTMLElement>()

// 检查是否还有更多内容
const hasMoreContent = computed(() => {
  return watchLaterList.value.length < watchLaterCount.value
})

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (isLoadingWatchLater.value || !hasMoreContent.value)
    return

  topBarStore.loadMoreWatchLaterList()
}

useOptimizedScroll(
  scrollContainer,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

onMounted(async () => {
  await topBarStore.syncWatchLaterState(true)
})

function getVideoPageUrl(bvid: string): string {
  return `https://www.bilibili.com/video/${bvid}/`
}

function getWatchLaterVideoUrl(bvid: string): string {
  return `https://www.bilibili.com/list/watchlater?bvid=${bvid}`
}

function openVideoPage(url: string) {
  if (settings.value.topBarLinkOpenMode === 'background') {
    void openLinkInBackground(url)
    return
  }

  if (settings.value.topBarLinkOpenMode === 'currentTabIfNotHomepage') {
    // Keep the behavior consistent with ALink's target logic.
    if (isInIframe() || isHomePage()) {
      window.open(url, '_blank')
    }
    else {
      window.open(url, '_top')
    }
    return
  }

  if (
    settings.value.topBarLinkOpenMode === 'newTab'
    || (settings.value.topBarLinkOpenMode === 'currentTabIfHomepage' && !isActualHomepage())
  ) {
    window.open(url, '_blank')
    return
  }

  window.open(url, '_top')
}

function deleteWatchLaterItem(index: number, aid: number) {
  topBarStore.deleteWatchLaterItem(index, aid)
}

/** progress = -1 表示已看完，直接展示总时长；角标文案形如「12:34 / 45:00」。 */
function getProgressText(item: WatchLaterItem): string {
  const played = item.progress === -1 ? item.duration : item.progress
  return `${calcCurrentTime(played)} / ${calcCurrentTime(item.duration)}`
}

/** 封面条的宽度百分比；脏数据（缺时长）时回退为 0，避免 NaN%。 */
function getProgressPercentage(item: WatchLaterItem): number {
  if (!item.duration)
    return 0
  const percentage = (item.progress / item.duration) * 100
  if (!Number.isFinite(percentage))
    return 0
  return Math.min(100, Math.max(0, percentage))
}

function handleOpenVideoPageAndRemove(index: number, aid: number, bvid: string) {
  openVideoPage(getVideoPageUrl(bvid))
  deleteWatchLaterItem(index, aid)
}
</script>

<template>
  <div
    h="[calc(100vh-100px)]" max-h-500px important-overflow-y-overlay
    bg="$bew-elevated"
    w="380px"
    pos="relative"
    of="hidden"
    shadow="$bew-shadow-3"
    border="1 $bew-popover-border-color"
    class="watchLater-pop bew-popover"
    data-key="watchLater"
    flex="~ col"
  >
    <!-- top bar -->
    <header
      flex="~ items-center justify-between gap-3 wrap"
      p="x-6 y-5"
      pos="sticky top-0 left-0"
      w="full"
      z="2"
      shrink-0
    >
      <div flex="~">
        <div>
          {{ $t('topbar.watch_later') }}
        </div>
      </div>

      <div flex="~ items-center gap-4 wrap">
        <button
          type="button"
          class="watch-later-header-action bew-top-bar-pop-action"
          :disabled="isAddingOpenTabsToWatchLater"
          :aria-busy="isAddingOpenTabsToWatchLater"
          :title="$t('watch_later.add_open_tabs_hint')"
          @click.stop="emit('addOpenTabs')"
        >
          {{ $t(isAddingOpenTabsToWatchLater ? 'watch_later.adding_open_tabs' : 'watch_later.add_open_tabs') }}
        </button>
        <ALink
          :href="playAllUrl"
          type="topBar"
          class="watch-later-header-action bew-top-bar-pop-action"
        >
          {{ $t('common.play_all') }}
        </ALink>
        <ALink
          :href="viewAllUrl"
          type="topBar"
          class="watch-later-header-action bew-top-bar-pop-action"
        >
          {{ $t('common.view_all') }}
        </ALink>
      </div>
    </header>

    <!-- watchLater wrapper -->
    <main
      ref="scrollContainer"
      overflow-y-auto
      flex="~ col gap-2"
      p="x-3"
      flex-1
      min-h-0
      overscroll-contain
    >
      <!-- loading -->
      <Loading
        v-if="isLoadingWatchLater && watchLaterList.length === 0"
        h="full"
        flex="~ items-center"
      />

      <!-- empty -->
      <Empty
        v-if="!isLoadingWatchLater && watchLaterList.length === 0"
        w="full" flex-1
        flex="~ items-center"
      />

      <!-- watchlater：卡片结构与收藏/动态弹窗视频卡保持一致，特有操作作为封面覆盖层 -->
      <TransitionGroup name="removable-list" tag="div" class="removable-list-group" flex="~ col gap-2">
        <ALink
          v-for="(item, index) in watchLaterList"
          :key="item.aid"
          :href="getWatchLaterVideoUrl(item.bvid)"
          class="group bew-content-card"
          type="topBar"
          block
          m="last:b-4"
          p="2"
          hover:bg="$bew-fill-2"
          duration-300
        >
          <PopMediaCard
            :title="item.title"
            :cover="`${removeHttpFromUrl(item.pic)}@320w_180h_1c`"
            :author-name="getWatchLaterAuthor(item).name"
            :author-href="getAuthorJumpUrl(getWatchLaterAuthor(item))"
          >
            <!-- 左上：在普通视频页打开 / 播放并从列表移除 -->
            <template #coverTopLeft>
              <div
                class="group-hover:opacity-100 opacity-0"
                pos="absolute top-0 left-0 z-1"
                flex="~ gap-1 items-center"
                m="1"
                duration-300
              >
                <PopCoverIconButton
                  :tooltip="$t('watch_later.open_video_page')"
                  :aria-label="$t('watch_later.open_video_page')"
                  @click="openVideoPage(getVideoPageUrl(item.bvid))"
                >
                  <i i-tabler:external-link aria-hidden="true" />
                </PopCoverIconButton>

                <PopCoverIconButton
                  :tooltip="$t('watch_later.play_video')"
                  :aria-label="$t('watch_later.play_video')"
                  @click="handleOpenVideoPageAndRemove(index, item.aid, item.bvid)"
                >
                  <i i-tabler:player-play aria-hidden="true" />
                </PopCoverIconButton>
              </div>
            </template>

            <!-- 右上：从稍后再看移除 -->
            <template #coverTopRight>
              <div
                class="group-hover:opacity-100 opacity-0"
                pos="absolute top-0 right-0 z-1"
                m="1"
                duration-300
              >
                <PopCoverIconButton
                  hover-color="error"
                  :tooltip="$t('watch_later.remove_from_watch_later')"
                  :aria-label="$t('watch_later.remove_from_watch_later')"
                  @click="deleteWatchLaterItem(index, item.aid)"
                >
                  <i i-mingcute:close-line aria-hidden="true" />
                </PopCoverIconButton>
              </div>
            </template>

            <!-- 右下角：观看进度 / 总时长 -->
            <template #coverOverlay>
              <div
                pos="absolute bottom-0 right-0"
                bg="black opacity-60"
                m="1"
                p="x-2 y-1"
                text="white xs"
                border="rounded-full"
                pointer-events-none
              >
                {{ getProgressText(item) }}
              </div>
            </template>

            <template #coverBelow>
              <Progress :percentage="getProgressPercentage(item)" />
            </template>
          </PopMediaCard>
        </ALink>
      </TransitionGroup>

      <!-- loading -->
      <Transition name="fade">
        <Loading v-if="isLoadingWatchLater && watchLaterList.length !== 0" m="b-4" />
      </Transition>

      <!-- no more content -->
      <div
        v-if="!isLoadingWatchLater && !hasMoreContent && watchLaterList.length > 0"
        text="$bew-text-3 xs center"
        p="y-4"
      >
        {{ $t('common.no_more_content') }}
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
.watch-later-header-action {
  display: inline-flex;
  align-items: center;
  min-height: var(--bew-space-6);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
  cursor: pointer;

  &:active:not(:disabled) {
    opacity: 0.7;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
