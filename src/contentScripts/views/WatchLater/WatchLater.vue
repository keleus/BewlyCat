<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

import Icon from '~/components/Icon.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import type { Video } from '~/components/VideoCard/types'
import { getAuthorJumpUrl } from '~/components/VideoCard/utils'
import VideoCardContextMenu from '~/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import type { WatchLaterLayout } from '~/logic'
import { settings, watchLaterLayout } from '~/logic'
import type { List as VideoItem, WatchLaterResult } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { computeFloatingMenuPosition } from '~/utils/floatingMenu'
import { getCSRF, openLinkToNewTab, removeHttpFromUrl } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'
import { getWatchLaterAuthor } from '~/utils/watchLater'

const { t } = useI18n()
const { confirm: showConfirmDialog } = useConfirmDialog()
const { openIframeDrawer, mainAppRef } = useBewlyApp()
const topBarStore = useTopBarStore()

provide('getVideoType', () => 'common')

const moreMenuItem = ref<VideoItem | null>(null)
const moreMenuTrigger = ref<HTMLButtonElement | null>(null)
const moreMenuStyles = ref<CSSProperties>({})
const showMoreButton = computed(() => settings.value.showVideoCardMoreButton
  && settings.value.videoCardContextMenuConfig.some(item => item.visible))

function openMoreMenu(item: VideoItem, event: MouseEvent) {
  const trigger = event.currentTarget as HTMLButtonElement
  const position = computeFloatingMenuPosition(trigger.getBoundingClientRect(), window.innerWidth, window.innerHeight)
  moreMenuTrigger.value = trigger
  moreMenuStyles.value = {
    position: 'fixed',
    top: position.top,
    bottom: position.bottom,
    left: `${position.left}px`,
    width: `${position.width}px`,
    maxHeight: `${position.maxHeight}px`,
  }
  moreMenuItem.value = item
}

const isLoading = ref<boolean>()
const noMoreContent = ref<boolean>()
const currentWatchLaterList = ref<VideoItem[]>([])
const watchLaterCount = ref<number>(0)
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()
const pageNum = ref<number>(1)
const pageSize = ref<number>(20)

const layoutIcons = computed<Array<{ icon: string, iconActivated: string, value: WatchLaterLayout }>>(() => [
  { icon: 'mingcute:list-check-3-line', iconActivated: 'mingcute:list-check-3-fill', value: 'list' },
  { icon: 'mingcute:table-3-line', iconActivated: 'mingcute:table-3-fill', value: 'grid' },
])

function syncTopBarWatchLaterState() {
  const sync = () => {
    void topBarStore.syncWatchLaterState(true).catch((error) => {
      console.error('刷新顶栏稍后再看状态失败:', error)
    })
  }

  sync()
  window.setTimeout(sync, 1000)
}

onMounted(() => {
  initPageAction()
  initData()
})

async function initData() {
  moreMenuItem.value = null
  isLoading.value = false
  noMoreContent.value = false
  currentWatchLaterList.value.length = 0
  pageNum.value = 1
  await getWatchLaterListByPage()
}

function getData() {
  getWatchLaterListByPage()
}

function initPageAction() {
  handlePageRefresh.value = async () => {
    if (isLoading.value)
      return

    initData()
  }
}

function handleListReachBottom() {
  if (isLoading.value || noMoreContent.value)
    return

  // 优化：添加延迟执行提高触发成功率
  setTimeout(() => {
    if (!isLoading.value && !noMoreContent.value) {
      getData()
    }
  }, 50)
}

// 列表模式使用全局滚动触底加载；grid 模式由 VideoCardGrid 内部哨兵触发
watch(watchLaterLayout, (layout) => {
  moreMenuItem.value = null
  handleReachBottom.value = layout === 'list' ? handleListReachBottom : undefined
}, { immediate: true })

/**
 * Get watch later list by page
 */
async function getWatchLaterListByPage() {
  if (isLoading.value || noMoreContent.value) {
    return
  }

  isLoading.value = true

  try {
    const res: WatchLaterResult = await api.watchlater.getWatchLaterListByPage({
      pn: pageNum.value,
      ps: pageSize.value,
    })

    if (res.code === 0) {
      // 第一页时更新总数
      if (pageNum.value === 1) {
        watchLaterCount.value = res.data.count
      }

      // 如果返回的数据少于请求的数量，说明没有更多数据了
      if (res.data.list.length < pageSize.value) {
        noMoreContent.value = true
      }

      // 添加新数据到列表
      currentWatchLaterList.value.push(...res.data.list)
      pageNum.value++

      // 如果没有滚动条且还有更多数据，继续加载
      if (!await haveScrollbar() && !noMoreContent.value) {
        getWatchLaterListByPage()
      }
    }
  }
  finally {
    isLoading.value = false
  }
}

function deleteWatchLaterItem(index: number, aid: number) {
  api.watchlater.removeFromWatchLater({
    aid,
    csrf: getCSRF(),
  })
    .then((res) => {
      if (res.code === 0) {
        currentWatchLaterList.value.splice(index, 1)
        watchLaterCount.value--
        syncTopBarWatchLaterState()
      }
    })
}

function handleRemoveWatchLater(item: VideoItem) {
  const index = currentWatchLaterList.value.findIndex(video => video.aid === item.aid)
  if (index !== -1)
    deleteWatchLaterItem(index, item.aid)
}

function handlePlayWatchLater(item: VideoItem) {
  const index = currentWatchLaterList.value.findIndex(video => video.aid === item.aid)
  if (index !== -1)
    handleOpenVideoPageAndRemove(index, item.bvid, item.aid)
}

function handleWatchLaterCardClick(item: VideoItem, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  handleLinkClick(`https://www.bilibili.com/list/watchlater?bvid=${item.bvid}`)
}

function transformWatchLaterItem(item: VideoItem): Video {
  return {
    id: item.aid,
    duration: item.duration,
    title: item.title,
    desc: item.desc,
    cover: item.pic,
    author: getWatchLaterAuthor(item),
    publishedTimestamp: item.pubdate,
    bvid: item.bvid,
    aid: item.aid,
    threePointV2: [],
  }
}

async function handleClearAllWatchLater() {
  const result = await showConfirmDialog(
    t('watch_later.clear_all_confirm'),
  )
  if (result) {
    isLoading.value = true
    api.watchlater.clearAllWatchLater({
      csrf: getCSRF(),
    }).then((res) => {
      if (res.code === 0) {
        initData()
        syncTopBarWatchLaterState()
      }
    }).finally(() => {
      isLoading.value = false
    })
  }
}

async function handleRemoveWatchedVideos() {
  const result = await showConfirmDialog(
    t('watch_later.remove_watched_videos_confirm'),
  )
  if (result) {
    api.watchlater.removeFromWatchLater({
      viewed: true,
      csrf: getCSRF(),
    })
      .then((res) => {
        if (res.code === 0) {
          initData()
          syncTopBarWatchLaterState()
        }
      })
  }
}

function handlePlayAll() {
  openLinkToNewTab('https://www.bilibili.com/list/watchlater')
}

function handleLinkClick(url: string) {
  if (settings.value.videoCardLinkOpenMode === 'drawer') {
    openIframeDrawer(url) // 在抽屉打开
  }
  else if (settings.value.videoCardLinkOpenMode === 'currentTab') {
    window.open(url, '_self') // 在当前标签页打开
  }
  else if (settings.value.videoCardLinkOpenMode === 'background') {
    openLinkInBackground(url)
  }
  else {
    openLinkToNewTab(url) // 在新标签页打开
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

function handleVideoLinkClick(bvid: string) {
  const videoUrl = `https://www.bilibili.com/video/${bvid}/`
  if (settings.value.videoCardLinkOpenMode === 'drawer') {
    openIframeDrawer(videoUrl) // 在抽屉打开
  }
  else if (settings.value.videoCardLinkOpenMode === 'currentTab') {
    window.open(videoUrl, '_self') // 在当前标签页打开
  }
  else if (settings.value.videoCardLinkOpenMode === 'background') {
    openLinkInBackground(videoUrl)
  }
  else {
    openLinkToNewTab(videoUrl) // 在新标签页打开
  }
}

function handleOpenVideoPageAndRemove(index: number, bvid: string, aid: number) {
  handleVideoLinkClick(bvid)
  deleteWatchLaterItem(index, aid)
}
</script>

<template>
  <div v-if="getCSRF()" flex="~ col md:row lg:row items-stretch" gap-4>
    <main min-w-0 w="full md:60% lg:70% xl:75%" order="2 md:1 lg:1" mb-6>
      <div flex="~ items-center justify-between gap-4" mb-6>
        <h3 class="bew-page-heading" text="$bew-text-1">
          {{ t('watch_later.title') }} ({{ watchLaterCount }})
        </h3>
        <div
          class="watch-later-layout-switcher bew-segment-control bew-segment-control--surface"
          :class="{
            'bew-segment-control--static': !settings.enableLiquidSegmentIndicator,
            'bew-segment-control--solid': !settings.enableFrostedGlass,
          }"
          flex="~ shrink-0 items-center"
          box-border
        >
          <LiquidSegmentIndicator
            v-if="settings.enableLiquidSegmentIndicator"
            :active-key="watchLaterLayout"
          />
          <button
            v-for="icon in layoutIcons" :key="icon.value"
            type="button"
            class="watch-later-layout-item bew-segment-control__item bew-segment-control__item--icon"
            data-segment-item
            :data-active="watchLaterLayout === icon.value ? 'true' : undefined"
            :aria-pressed="watchLaterLayout === icon.value"
            :title="icon.value === 'list' ? t('watch_later.layout_list') : t('watch_later.layout_grid')"
            @click="watchLaterLayout = icon.value"
          >
            <Icon
              class="watch-later-layout-item__icon bew-segment-control__icon"
              :icon="watchLaterLayout === icon.value ? icon.iconActivated : icon.icon"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      <Empty v-if="watchLaterCount === 0 && !isLoading" />
      <template v-else>
        <!-- grid layout -->
        <VideoCardGrid
          v-if="watchLaterLayout === 'grid'"
          :items="currentWatchLaterList"
          :transform-item="transformWatchLaterItem"
          :get-item-key="(item: VideoItem) => item.aid"
          grid-layout="adaptive"
          :loading="isLoading"
          :no-more-content="noMoreContent"
          :show-watcher-later="false"
          :card-click-handler="handleWatchLaterCardClick"
          @refresh="initData"
          @load-more="getWatchLaterListByPage"
        >
          <template #coverTopLeft="{ item }">
            <button
              class="watch-later-remove-action"
              :aria-label="t('watch_later.remove_from_watch_later')"
              @click.prevent.stop="handleRemoveWatchLater(item)"
            >
              <Tooltip :content="t('watch_later.remove_from_watch_later')" placement="bottom-left" type="dark">
                <div i-tabler:trash />
              </Tooltip>
            </button>
          </template>
          <template #coverTopRight="{ item }">
            <button
              type="button"
              class="watch-later-play-action"
              :aria-label="t('watch_later.play_video')"
              @click.prevent.stop="handlePlayWatchLater(item)"
            >
              <Tooltip :content="t('watch_later.play_video')" placement="bottom-right" type="dark">
                <div i-tabler:player-play />
              </Tooltip>
            </button>
          </template>
        </VideoCardGrid>

        <!-- list layout -->
        <template v-else>
          <!-- watcher later list -->
          <TransitionGroup name="list">
            <ALink
              v-for="(item, index) in currentWatchLaterList"
              :key="item.aid"
              :href="`https://www.bilibili.com/video/${item.bvid}/`"
              type="videoCard"
              class="group watch-later-list-item"
              flex cursor-pointer
            >
              <section
                rounded="$bew-radius"
                flex="~ gap-6 col md:col lg:row items-start"
                relative
                group-hover:bg="$bew-fill-2"
                duration-300 w-full
                p-2 m-1
                content-visibility-auto
              >
                <!-- Cover -->
                <div
                  pos="relative"
                  bg="$bew-skeleton"
                  w="full md:full lg:250px"
                  flex="shrink-0"
                  rounded="$bew-radius"
                  overflow-hidden
                  aspect-video
                >
                  <img
                    w="full"
                    aspect-video
                    :src="removeHttpFromUrl(`${item.pic}@480w_270h_1c`)"
                    :alt="item.title"
                    object-cover
                  >

                  <!-- <div
                  pos="absolute bottom-0 right-0"
                  bg="black opacity-60"
                  m="2"
                  p="x-2 y-1"
                  text="white xs"
                  rounded="$bew-radius-half"
                >
                  {{ calcCurrentTime(item.duration) }}
                </div> -->
                  <div

                    pos="absolute bottom-0 right-0"
                    bg="black opacity-60"
                    m="2"
                    p="x-2 y-1"
                    text="white xs"
                    rounded="$bew-radius-half"
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
                  <div w-full pos="absolute bottom-0" bg="white opacity-60">
                    <Progress
                      :percentage="
                        (item.progress / item.duration) * 100
                      "
                    />
                  </div>
                </div>

                <!-- Description -->
                <div class="watch-later-list-description">
                  <div class="watch-later-list-details" flex="~ col">
                    <a
                      class="keep-two-lines"
                      overflow="hidden"
                      un-text="lg overflow-ellipsis"
                      @click.stop.prevent="handleVideoLinkClick(item.bvid)"
                    >
                      {{ item.title }}
                    </a>
                    <a
                      un-text="$bew-text-2 sm"
                      m="t-4 b-2"
                      flex="~"
                      items-center
                      cursor-pointer
                      w-fit
                      rounded="$bew-radius"
                      hover:color="$bew-theme-color"
                      hover:bg="$bew-theme-color-10"
                      duration-300
                      pr-2
                      :href="getAuthorJumpUrl(getWatchLaterAuthor(item))" target="_blank"
                      @click.stop
                    >
                      <img
                        :src="removeHttpFromUrl(`${getWatchLaterAuthor(item).authorFace}@40w_40h_1c`)"
                        w-30px
                        aspect-square
                        object-cover
                        alt=""
                        rounded="1/2"
                        mr-2
                      >
                      {{ getWatchLaterAuthor(item).name }}
                    </a>
                    <p display="block xl:none" text="$bew-text-3 sm" mt-auto mb-2>
                      {{
                        useDateFormat(item.pubdate * 1000, 'YYYY-MM-DD HH:mm:ss')
                          .value
                      }}
                    </p>
                  </div>

                  <div class="watch-later-list-actions">
                    <Tooltip :content="t('watch_later.play_video')" placement="top">
                      <button
                        :aria-label="t('watch_later.play_video')"
                        text="size-$bew-icon-size-lg $bew-text-3"
                        hover:color="$bew-theme-color"
                        class="watch-later-list-action"
                        type="button"
                        p-2
                        duration-300
                        @click.prevent.stop="handleOpenVideoPageAndRemove(index, item.bvid, item.aid)"
                      >
                        <div i-tabler:player-play />
                      </button>
                    </Tooltip>
                    <Tooltip :content="t('watch_later.play_in_watch_later')" placement="top">
                      <button
                        :aria-label="t('watch_later.play_in_watch_later')"
                        text="size-$bew-icon-size-lg $bew-text-3"
                        hover:color="$bew-theme-color"
                        class="watch-later-list-action"
                        type="button"
                        p-2
                        duration-300
                        @click.prevent.stop="handleLinkClick(`https://www.bilibili.com/list/watchlater?bvid=${item.bvid}`)"
                      >
                        <div i-tabler:list-check />
                      </button>
                    </Tooltip>
                    <Tooltip :content="t('watch_later.remove_from_watch_later')" placement="top">
                      <button
                        :aria-label="t('watch_later.remove_from_watch_later')"
                        text="size-$bew-icon-size-lg $bew-text-3"
                        hover:color="$bew-theme-color"
                        class="watch-later-list-action"
                        type="button"
                        p-2
                        duration-300
                        @click.prevent.stop="deleteWatchLaterItem(index, item.aid)"
                      >
                        <div i-tabler:trash />
                      </button>
                    </Tooltip>
                    <Tooltip v-if="showMoreButton" :content="t('video_card.operation.more_options')" placement="top">
                      <button
                        type="button"
                        class="watch-later-list-action"
                        :class="{ 'watch-later-list-action--active': moreMenuItem?.aid === item.aid }"
                        :aria-label="t('video_card.operation.more_options')"
                        aria-haspopup="menu"
                        :aria-expanded="moreMenuItem?.aid === item.aid"
                        text="size-$bew-icon-size-lg $bew-text-3"
                        hover:color="$bew-theme-color"
                        p-2
                        duration-300
                        @click.prevent.stop="openMoreMenu(item, $event)"
                      >
                        <div i-mingcute:more-2-line />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </section>
            </ALink>
          </TransitionGroup>
          <!-- loading -->
          <Transition name="fade">
            <loading
              v-if="isLoading && currentWatchLaterList.length !== 0 && !noMoreContent"
              m="-t-4"
            />
          </Transition>
        </template>
      </template>
    </main>

    <aside relative w="full md:40% lg:30% xl:25%" order="1 md:2 lg:2">
      <div
        class="watch-later-sidebar-panel"
        :class="{
          'watch-later-sidebar-panel--cover': settings.enableSidebarCoverBlur,
          'bew-popover-surface bew-popover-surface--wallpaper': !settings.enableSidebarCoverBlur,
        }"
      >
        <!-- Frosted Glass Cover -->
        <div
          v-if="settings.enableSidebarCoverBlur"
          class="watch-later-sidebar-background"
        >
          <div
            absolute inset-0
            bg="$bew-sidebar-cover-mask"
          />
          <img
            v-if="currentWatchLaterList[0]"
            :src="removeHttpFromUrl(`${currentWatchLaterList[0].pic}@480w_270h_1c`)"
            w-full h-full object="cover center" blur-40px
            relative z--1
          >
        </div>

        <!-- Content -->
        <main
          class="watch-later-sidebar-content"
          flex="~ col gap-4 justify-start"
          p-6
        >
          <picture
            class="hidden md:block"
            rounded="$bew-radius" style="box-shadow: 0 16px 24px -12px rgba(0, 0, 0, .36)"
            aspect-video mb-4 bg="$bew-skeleton"
          >
            <img
              v-if="currentWatchLaterList[0]" :src="removeHttpFromUrl(`${currentWatchLaterList[0].pic}@480w_270h_1c`)"
              rounded="$bew-radius" aspect-video w-full
            >
          </picture>

          <h3 class="bew-page-heading">
            {{ t('watch_later.title') }} ({{ watchLaterCount }})
          </h3>
          <div v-if="watchLaterCount > 0" flex="~ col" gap-2 w-full>
            <Button
              type="secondary" block strong
              :color="settings.enableSidebarCoverBlur ? 'rgba(255,255,255,.35)' : undefined"
              :text-color="settings.enableSidebarCoverBlur ? 'white' : undefined"
              @click="handlePlayAll"
            >
              <template #left>
                <div i-tabler:player-play />
              </template>
              {{ t('common.play_all') }}
            </Button>
            <Button
              type="secondary" block strong
              :color="settings.enableSidebarCoverBlur ? 'rgba(255,255,255,.35)' : undefined"
              :text-color="settings.enableSidebarCoverBlur ? 'white' : undefined"
              @click="handleClearAllWatchLater"
            >
              <template #left>
                <div i-tabler:trash />
              </template>
              {{ t('watch_later.clear_all') }}
            </Button>
            <Button
              type="secondary" block strong
              :color="settings.enableSidebarCoverBlur ? 'rgba(255,255,255,.35)' : undefined"
              :text-color="settings.enableSidebarCoverBlur ? 'white' : undefined"
              @click="handleRemoveWatchedVideos"
            >
              <template #left>
                <div i-tabler:circle-minus />
              </template>
              {{ t('watch_later.remove_watched_videos') }}
            </Button>
          </div>
        </main>
      </div>
    </aside>
    <Teleport v-if="moreMenuItem && showMoreButton" :to="mainAppRef">
      <VideoCardContextMenu
        :key="moreMenuItem.aid"
        :video="{
          ...transformWatchLaterItem(moreMenuItem),
          url: `https://www.bilibili.com/video/${moreMenuItem.bvid}/`,
        }"
        :context-menu-styles="moreMenuStyles"
        :trigger-element="moreMenuTrigger"
        @close="moreMenuItem = null"
        @removed="moreMenuItem = null"
      />
    </Teleport>
  </div>
  <Empty v-else mt-6 :description="t('common.please_log_in_first')">
    <Button type="primary" @click="jumpToLoginPage()">
      {{ $t('common.login') }}
    </Button>
  </Empty>
</template>

<style lang="scss" scoped>
.watch-later-list-description {
  display: flex;
  align-self: stretch;
  flex: 1;
  min-width: 0;
  width: 100%;
  justify-content: space-between;
  gap: var(--bew-space-2);
}

.watch-later-list-details {
  flex: 1;
  min-width: 0;
}

.watch-later-list-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--bew-space-1);
}

.watch-later-list-action {
  opacity: 0;
}

.watch-later-list-action--active,
.watch-later-list-item:hover .watch-later-list-action,
.watch-later-list-item:focus-within .watch-later-list-action {
  opacity: 1;
}

@media (hover: none) {
  .watch-later-list-action {
    opacity: 1;
  }
}

.watch-later-sidebar-panel {
  position: sticky;
  top: 120px;
  width: 100%;
  height: 230px;
  margin: var(--bew-space-10) 0;
  overflow: hidden;
  border-radius: var(--bew-panel-radius);
}

@media (min-width: 768px) {
  .watch-later-sidebar-panel {
    height: calc(100vh - 160px);
    min-height: 230px;
  }
}

.watch-later-sidebar-background {
  position: absolute;
  inset: 0;
  z-index: -1;
}

.watch-later-sidebar-panel--cover {
  isolation: isolate;
}

.watch-later-sidebar-panel--cover .bew-page-heading {
  color: white;
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.3);
}

.watch-later-sidebar-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  overscroll-behavior: contain;
}

.watch-later-sidebar-content > * {
  flex-shrink: 0;
}

.watch-later-sidebar-content :deep(.b-button) {
  flex-shrink: 0;
  min-height: var(--bew-control-height);
}

.watch-later-layout-item {
  &__icon {
    pointer-events: none;
  }
}

.watch-later-remove-action {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 30px;
  margin: var(--bew-space-1);
  padding: 0 var(--bew-space-2);
  color: #fff;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: rgba(0, 0, 0, 0.62);
  cursor: pointer;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-error-color);
  }
}

.watch-later-play-action {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 30px;
  margin: var(--bew-space-1);
  padding: 0 var(--bew-space-2);
  color: #fff;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: rgba(0, 0, 0, 0.62);
  cursor: pointer;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-theme-color);
  }
}
</style>
