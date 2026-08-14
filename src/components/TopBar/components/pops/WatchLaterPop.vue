<script setup lang="ts">
import { storeToRefs } from 'pinia'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import Progress from '~/components/Progress.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { isHomePage, isInIframe, removeHttpFromUrl } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'

const topBarStore = useTopBarStore()
const { watchLaterList, isLoadingWatchLater, watchLaterCount } = storeToRefs(topBarStore)
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

  if (settings.value.topBarLinkOpenMode === 'newTab') {
    window.open(url, '_blank')
    return
  }

  window.open(url, '_top')
}

function deleteWatchLaterItem(index: number, aid: number) {
  topBarStore.deleteWatchLaterItem(index, aid)
}

function handleOpenVideoPageAndRemove(index: number, aid: number, bvid: string) {
  openVideoPage(getVideoPageUrl(bvid))
  deleteWatchLaterItem(index, aid)
}
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
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
      flex="~ items-center justify-between"
      p="x-6 y-5"
      pos="sticky top-0 left-0"
      w="full"
      z="2"
    >
      <div flex="~">
        <div>
          {{ $t('topbar.watch_later') }}
        </div>
      </div>

      <div flex="~ gap-4">
        <ALink
          :href="playAllUrl"
          type="topBar"
          flex="~" items="center"
        >
          <span text="sm">{{ $t('common.play_all') }}</span>
        </ALink>
        <ALink
          :href="viewAllUrl"
          type="topBar"
          flex="~" items="center"
        >
          <span text="sm">{{ $t('common.view_all') }}</span>
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
        pos="absolute top-0 left-0"
        z="0" w="full" h="full"
        flex="~ items-center"
      />

      <!-- watchlater -->
      <TransitionGroup name="list">
        <ALink
          v-for="(item, index) in watchLaterList"
          :key="item.aid"
          :href="getWatchLaterVideoUrl(item.bvid)"
          class="group bew-content-card"
          type="topBar"
          m="last:b-4" p="2"
          hover:bg="$bew-fill-2"
          duration-300
        >
          <section flex="~ gap-4 items-start">
            <!-- Video cover, live cover, ariticle cover -->
            <div
              class="bew-top-bar-media-column"
              bg="$bew-skeleton"
              pos="relative"
            >
              <div
                class="group-hover:opacity-100 opacity-0"
                pos="absolute top-0 left-0" z-1
                flex="~ gap-1"
                m="1"
                duration-300
              >
                <!-- Open in regular video page button -->
                <Tooltip :content="$t('watch_later.open_video_page')" placement="top">
                  <button
                    type="button"
                    w-24px h-24px
                    bg="black opacity-60 hover:$bew-theme-color"
                    grid="~ place-items-center"
                    text="white xs"
                    border="rounded-full"
                    @click.stop.prevent="openVideoPage(getVideoPageUrl(item.bvid))"
                  >
                    <i i-tabler:external-link />
                  </button>
                </Tooltip>

                <!-- Open in video page and remove button -->
                <Tooltip :content="$t('watch_later.play_video')" placement="top">
                  <button
                    type="button"
                    w-24px h-24px
                    bg="black opacity-60 hover:$bew-theme-color"
                    grid="~ place-items-center"
                    text="white xs"
                    border="rounded-full"
                    @click.stop.prevent="handleOpenVideoPageAndRemove(index, item.aid, item.bvid)"
                  >
                    <i i-tabler:player-play />
                  </button>
                </Tooltip>
              </div>

              <!-- Delete button -->
              <div
                class="group-hover:opacity-100 opacity-0"
                pos="absolute top-0 right-0" z-1 w-24px h-24px
                bg="black opacity-60 hover:$bew-error-color"
                grid="~ place-items-center"
                m="1"
                text="white xs"
                duration-300
                border="rounded-full"
                @click.stop.prevent="deleteWatchLaterItem(index, item.aid)"
              >
                <i i-mingcute:close-line />
              </div>

              <!-- Video -->
              <div class="bew-top-bar-media-frame">
                <img
                  w-full h-full
                  :src="`${removeHttpFromUrl(
                    item.pic,
                  )}@320w_180h_1c`"
                  :alt="item.title"
                  object-cover
                  loading="lazy"
                >
                <div
                  pos="absolute bottom-0 right-0"
                  bg="black opacity-60"
                  m="1"
                  p="x-2 y-1"
                  text="white xs"
                  border="rounded-full"
                >
                  <!--  When progress = -1 means that the user watched the full video -->
                  {{
                    `${
                      item.progress === -1
                        ? calcCurrentTime(item.duration)
                        : calcCurrentTime(item.progress)
                    } /
                    ${calcCurrentTime(item.duration)}`
                  }}
                </div>
              </div>
              <Progress
                :percentage="
                  (item.progress / item.duration) * 100
                "
              />
            </div>

            <!-- Description -->
            <div class="bew-top-bar-media-copy">
              <h3
                :title="item.title"
                class="bew-top-bar-media-title"
              >
                {{ item.title }}
              </h3>
              <div text="$bew-text-2" m="t-2" flex="~ items-center">
                <ALink
                  :href="`https://space.bilibili.com/${item.owner.mid}`"
                  type="topBar"
                  :stop-propagation="true"
                  class="bew-top-bar-media-author"
                >
                  {{ item.owner.name }}
                </ALink>
              </div>
            </div>
          </section>
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

<style lang="scss" scoped>
.tab {
  --uno: "relative text-$bew-text-2";

  &::after {
    --uno: "absolute bottom-0 left-0 w-full h-12px bg-$bew-theme-color opacity-0 transform scale-x-0 -z-1";
    --uno: "transition-colors duration-200";
    content: "";
  }
}

.tab-selected {
  --uno: "font-bold text-$bew-text-1";

  &::after {
    --uno: "scale-x-80 opacity-40";
  }
}
</style>
