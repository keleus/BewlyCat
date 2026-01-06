<script setup lang="ts">
import { storeToRefs } from 'pinia'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import Picture from '~/components/Picture.vue'
import Progress from '~/components/Progress.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { useTopBarStore } from '~/stores/topBarStore'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { removeHttpFromUrl } from '~/utils/main'

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
  topBarStore.getAllWatchLaterList()
})

/**
 * Return the URL of the watch later item
 * @param bvid bvid
 * @return {string} url
 */
function getWatchLaterUrl(bvid: string): string {
  return `https://www.bilibili.com/list/watchlater?bvid=${bvid}`
}

function deleteWatchLaterItem(index: number, aid: number) {
  topBarStore.deleteWatchLaterItem(index, aid)
}
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
    h="[calc(100vh-100px)]" max-h-500px important-overflow-y-overlay
    bg="$bew-elevated"
    w="380px"
    rounded="$bew-radius"
    pos="relative"
    of="hidden"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-border-color"
    class="watchLater-pop bew-popover"
    data-key="watchLater"
    flex="~ col"
  >
    <!-- top bar -->
    <header
      flex="~ items-center justify-between"
      p="x-6"
      pos="sticky top-0 left-0"
      w="full"
      h-50px
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
      overflow-y-auto rounded="$bew-radius"
      flex="~ col gap-2"
      p="x-4"
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
        bg="$bew-content"
        z="0" w="full" h="full"
        flex="~ items-center"
        rounded="$bew-radius"
      />

      <!-- watchlater -->
      <TransitionGroup name="list">
        <ALink
          v-for="(item, index) in watchLaterList"
          :key="item.aid"
          :href="getWatchLaterUrl(item.bvid)"
          class="group"
          type="topBar"
          m="last:b-4" p="2"
          rounded="$bew-radius"
          hover:bg="$bew-fill-2"
          duration-300
        >
          <section flex="~ gap-4 item-start">
            <!-- Video cover, live cover, ariticle cover -->
            <div
              bg="$bew-skeleton"
              pos="relative"
              w="150px"
              flex="shrink-0"
              border="rounded-$bew-radius-half"
              overflow="hidden"
            >
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
              <div pos="relative">
                <Picture
                  w="150px" h-full
                  class="aspect-video"
                  :src="`${removeHttpFromUrl(
                    item.pic,
                  )}@256w_144h_1c`"
                  :alt="item.title"
                  loading="lazy"
                />
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
            <div>
              <h3
                class="keep-two-lines"
                overflow="hidden"
                text="ellipsis"
                break-anywhere
              >
                {{ item.title }}
              </h3>
              <div text="$bew-text-2 sm" m="t-4" flex="~" align="items-center">
                {{ item.owner.name }}
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
    --uno: "transition-all duration-300";
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
