<script setup lang="ts">
import { formatDate, useDateFormat } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import Icon from '~/components/Icon.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import type { Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { historyLayout, settings } from '~/logic'
import type { HistoryResult, List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import type { HistorySearchResult, List as HistorySearchItem } from '~/models/video/historySearch'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getHistoryUrl } from '~/utils/history'
import { getCSRF, removeHttpFromUrl } from '~/utils/main'

const { t } = useI18n()
const { confirm: showConfirmDialog } = useConfirmDialog()

const isLoading = ref<boolean>()
const noMoreContent = ref<boolean>(false)
const historyList = reactive<Array<HistoryItem>>([])
const currentPageNum = ref<number>(1)
const keyword = ref<string>()
const historyStatus = ref<boolean>()
const { handlePageRefresh, handleReachBottom, haveScrollbar } = useBewlyApp()

const layoutIcons = [
  { value: 'list', icon: 'mingcute:list-check-3-line', activeIcon: 'mingcute:list-check-3-fill' },
  { value: 'grid', icon: 'mingcute:table-3-line', activeIcon: 'mingcute:table-3-fill' },
] as const

function getHistoryItemKey(item: HistoryItem) {
  return `${item.history.business}_${item.history.oid}_${item.view_at}`
}

function transformHistoryItem(item: HistoryItem): Video {
  const isVideo = item.history.business === Business.ARCHIVE || item.history.business === Business.PGC
  return {
    id: item.history.oid,
    title: item.show_title || item.title,
    cover: getHistoryItemCover(item),
    url: getHistoryUrl(item),
    bvid: item.history.bvid || undefined,
    aid: item.history.business === Business.ARCHIVE ? item.history.oid : undefined,
    cid: item.history.cid || undefined,
    epid: item.history.epid || undefined,
    roomid: item.history.business === Business.LIVE ? item.history.oid : undefined,
    liveStatus: item.live_status,
    badge: item.history.business === Business.PGC || item.history.business === Business.LIVE
      ? {
          text: item.history.business === Business.PGC ? t('history.pgc') : t('history.livestreaming'),
          bgColor: 'var(--bew-theme-color)',
          color: 'white',
        }
      : undefined,
    durationStr: isVideo
      ? `${calcCurrentTime(item.progress === -1 ? item.duration : Math.max(0, item.progress))} / ${calcCurrentTime(item.duration)}`
      : undefined,
    capsuleText: formatDate(new Date(item.view_at * 1000), 'HH:mm:ss'),
    author: {
      name: item.author_name || item.title,
      authorFace: item.author_face || item.cover,
      mid: item.author_mid || undefined,
      authorUrl: item.author_mid ? `https://space.bilibili.com/${item.author_mid}` : item.uri,
    },
    threePointV2: [],
  }
}

const historyGroups = computed(() => {
  if (historyLayout.value !== 'grid')
    return [{ date: 'list', items: historyList }]

  const groups = new Map<string, HistoryItem[]>()
  for (const item of historyList) {
    const date = formatDate(new Date(item.view_at * 1000), 'YYYY-MM-DD')
    const items = groups.get(date)
    if (items)
      items.push(item)
    else
      groups.set(date, [item])
  }
  return Array.from(groups, ([date, items]) => ({ date, items }))
})

watch(historyLayout, async () => {
  await nextTick()
  if (getCSRF() && !isLoading.value && !noMoreContent.value && historyList.length && !await haveScrollbar()) {
    if (keyword.value)
      searchHistoryList()
    else
      getHistoryList()
  }
}, { flush: 'post' })

const HistoryBusiness = computed(() => {
  return Business
})

onMounted(() => {
  getHistoryList()
  getHistoryPauseStatus()

  initPageAction()
})

function initPageAction() {
  handleReachBottom.value = () => {
    if (isLoading.value)
      return
    if (noMoreContent.value)
      return

    // 优化：添加延迟执行提高触发成功率
    setTimeout(() => {
      if (!isLoading.value && !noMoreContent.value) {
        if (keyword.value)
          searchHistoryList()
        else
          getHistoryList()
      }
    }, 50)
  }

  handlePageRefresh.value = () => {
    historyList.length = 0
    currentPageNum.value = 1
    noMoreContent.value = false
    getHistoryList()
  }
}

/**
 * Get history list
 */
function getHistoryList(): Promise<void> {
  isLoading.value = true
  return api.history.getHistoryList({
    type: 'all',
    view_at:
        historyList.length > 0
          ? historyList[historyList.length - 1].view_at
          : 0,
  })
    .then(async (res: HistoryResult) => {
      if (res.code === 0) {
        if (Array.isArray(res.data.list) && res.data.list.length > 0)
          historyList.push(...res.data.list)

        if (res.data.list.length < 20) {
          isLoading.value = false
          noMoreContent.value = true
          return
        }

        noMoreContent.value = false

        // ✅ 修复：添加 await，因为 haveScrollbar() 是异步函数
        if (!(await haveScrollbar()) && !noMoreContent.value) {
          return getHistoryList()
        }
      }
    })
    .finally(() => {
      isLoading.value = false
    })
}

function searchHistoryList(): Promise<void> {
  isLoading.value = true
  return api.history.searchHistoryList({
    pn: currentPageNum.value++,
    keyword: keyword.value,
  })
    .then(async (res: HistorySearchResult) => {
      if (res.code === 0) {
        res.data.list.forEach((item: HistorySearchItem) => {
          historyList.push(item as unknown as HistoryItem)
        })

        noMoreContent.value = res.data.list.length < 20
        if (!noMoreContent.value && !await haveScrollbar())
          return searchHistoryList()
      }
    })
    .finally(() => {
      isLoading.value = false
    })
}

function handleSearch() {
  historyList.length = 0
  currentPageNum.value = 1
  noMoreContent.value = false
  if (keyword.value)
    searchHistoryList()
  else getHistoryList()
}

function deleteHistoryItem(historyItem: HistoryItem) {
  api.history.deleteHistoryItem({
    kid: `${historyItem.history.business}_${historyItem.history.oid}`,
    csrf: getCSRF(),
  })
    .then((res) => {
      if (res.code === 0) {
        const index = historyList.indexOf(historyItem)
        if (index !== -1)
          historyList.splice(index, 1)
      }
    })
}

function getHistoryItemCover(item: HistoryItem) {
  if (item.history.business === 'article' || item.history.business === 'article-list') {
    if (item.covers)
      return removeHttpFromUrl(`${item.covers[0]}`)
  }

  return removeHttpFromUrl(item.cover)
}

function getHistoryPauseStatus() {
  api.history.getHistoryPauseStatus()
    .then((res) => {
      if (res.code === 0)
        historyStatus.value = res.data
    })
}

function setHistoryPauseStatus(isPause: boolean) {
  api.history.setHistoryPauseStatus({
    csrf: getCSRF(),
    switch: isPause,
  })
    .then((res) => {
      if (res.code === 0)
        getHistoryPauseStatus()
    })
}

function clearAllHistory() {
  api.history.clearAllHistory({
    csrf: getCSRF(),
  })
    .then((res) => {
      if (res.code === 0)
        historyList.length = 0
    })
}

async function handleClearAllWatchHistory() {
  const result = await showConfirmDialog(
    t('history.clear_all_watch_history_confirm'),
  )
  if (result)
    clearAllHistory()
}

async function handlePauseWatchHistory() {
  const result = await showConfirmDialog(
    t('history.pause_watch_history_confirm'),
  )
  if (result)
    setHistoryPauseStatus(true)
}

async function handleTurnOnWatchHistory() {
  const result = await showConfirmDialog(
    t('history.turn_on_watch_history_confirm'),
  )
  if (result)
    setHistoryPauseStatus(false)
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}
</script>

<template>
  <div v-if="getCSRF()" flex="~ col md:row lg:row" gap-4>
    <main min-w-0 w="full md:60% lg:70% xl:75%" order="2 md:1 lg:1" mb-6>
      <div class="history-heading-row" mb-6>
        <h3 class="bew-page-heading" text="$bew-text-1">
          {{ $t('history.title') }}
        </h3>
        <div
          class="bew-segment-control bew-segment-control--surface"
          :class="{
            'bew-segment-control--static': !settings.enableLiquidSegmentIndicator,
            'bew-segment-control--solid': !settings.enableFrostedGlass,
          }"
          shrink-0
        >
          <LiquidSegmentIndicator v-if="settings.enableLiquidSegmentIndicator" :active-key="historyLayout" />
          <button
            v-for="layout in layoutIcons"
            :key="layout.value"
            type="button"
            class="bew-segment-control__item bew-segment-control__item--icon"
            data-segment-item
            :data-active="historyLayout === layout.value ? 'true' : undefined"
            :aria-pressed="historyLayout === layout.value"
            :title="t(`history.layout_${layout.value}`)"
            :aria-label="t(`history.layout_${layout.value}`)"
            @click="historyLayout = layout.value"
          >
            <Icon
              class="bew-segment-control__icon"
              :icon="historyLayout === layout.value ? layout.activeIcon : layout.icon"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      <!-- Each date row grows with its card grid, keeping the timeline aligned. -->
      <div :class="{ 'history-grid': historyLayout === 'grid' }">
        <div v-for="group in historyGroups" :key="group.date" class="history-date-group">
          <div v-if="historyLayout === 'grid'" class="history-date">
            <time :datetime="group.date">{{ group.date }}</time>
          </div>
          <VideoCardGrid
            v-if="historyLayout === 'grid'"
            class="history-cards"
            :state-key="`history:${group.date}`"
            :items="group.items"
            :transform-item="transformHistoryItem"
            :get-item-key="getHistoryItemKey"
            grid-layout="adaptive"
            no-more-content
            :show-no-more-content="false"
            :show-watch-later="false"
            :more-btn="false"
            disable-content-visibility
            cover-top-left-always-visible
          >
            <template #coverTopLeft="{ item }">
              <button
                type="button"
                class="history-remove-action"
                :title="t('common.operation.delete')"
                :aria-label="t('common.operation.delete')"
                @click.prevent.stop="deleteHistoryItem(item)"
              >
                <div i-tabler:trash />
              </button>
            </template>
          </VideoCardGrid>
          <TransitionGroup v-else name="list" tag="div">
            <ALink
              v-for="historyItem in group.items"
              :key="getHistoryItemKey(historyItem)"
              type="videoCard"
              :href="getHistoryUrl(historyItem)"
              block
              class="group history-card"
              flex
              cursor-pointer
            >
              <!-- time slot -->
              <div
                mr-8 px-4
                b-l="~ 2px dashed $bew-fill-2"
                group-hover:b-l="$bew-theme-color-40"
                shrink-0
                relative
                duration-300
                flex="important-xl:~ items-center justify-center"
                hidden
              >
                <!-- hidden lg:flex -->
                <!-- Dot -->
                <i
                  pos="absolute left--1px"
                  w-2
                  h-2
                  rounded-6
                  bg="$bew-fill-3"
                  group-hover:bg="$bew-theme-color"
                  transform="~ translate-x--1/2"
                  duration-300
                />
                <div
                  text="sm $bew-text-3"
                  group-hover:text="$bew-theme-color"
                  bg="$bew-fill-1"
                  group-hover:bg="$bew-theme-color-20"
                  p="x-3 y-1"
                  rounded="$bew-radius-half"
                  duration-300
                >
                  {{
                    useDateFormat(historyItem.view_at * 1000, 'YYYY-MM-DD HH:mm:ss')
                      .value
                  }}
                </div>
              </div>

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
                    :src="`${getHistoryItemCover(historyItem)}@480w_270h_1c`"
                    :alt="historyItem.title"
                    object-cover
                  >

                  <span
                    v-if="historyItem.history.business !== HistoryBusiness.ARCHIVE"
                    pos="absolute right-0 top-0"
                    bg="$bew-theme-color"
                    text="xs white"
                    p="x-2 y-1"
                    m-1
                    rounded="$bew-radius-half"
                  >
                    <template
                      v-if="historyItem.history.business === HistoryBusiness.LIVE"
                    >
                      {{ t('history.livestreaming') }}
                    </template>
                    <template
                      v-else-if="historyItem.history.business === HistoryBusiness.PGC"
                    >
                      {{ t('history.pgc') }}
                    </template>
                  </span>

                  <div
                    v-if="
                      historyItem.history.business === HistoryBusiness.ARCHIVE
                        || historyItem.history.business === HistoryBusiness.PGC
                    "
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
                        historyItem.progress === -1
                          ? calcCurrentTime(historyItem.duration)
                          : calcCurrentTime(historyItem.progress)
                      } /
                          ${calcCurrentTime(historyItem.duration)}`
                    }}
                  </div>
                  <div w-full pos="absolute bottom-0" bg="white opacity-60">
                    <Progress
                      v-if="
                        historyItem.history.business === HistoryBusiness.ARCHIVE
                          || historyItem.history.business === HistoryBusiness.PGC
                      "
                      :percentage="
                        (historyItem.progress / historyItem.duration) * 100
                      "
                    />
                  </div>
                </div>

                <!-- Description -->
                <div flex justify-between w-full h-full>
                  <div flex="~ col">
                    <a
                      :href="`${getHistoryUrl(historyItem)}`" target="_blank"
                      :title="historyItem.show_title ? historyItem.show_title : historyItem.title"
                    >
                      <h3
                        class="keep-two-lines"
                        overflow="hidden"
                        text="lg overflow-ellipsis"
                      >
                        {{ historyItem.show_title ? historyItem.show_title : historyItem.title }}
                      </h3>
                    </a>
                    <a
                      un-text="$bew-text-2 sm"
                      m="t-4 b-2"
                      flex="~ items-center"
                      cursor-pointer
                      w-fit
                      rounded="$bew-radius"
                      hover:color="$bew-theme-color"
                      hover:bg="$bew-theme-color-10"
                      duration-300
                      pr-2
                      :href="historyItem.author_mid ? `https://space.bilibili.com/${historyItem.author_mid}` : historyItem.uri" target="_blank"
                    >
                      <img
                        :src="
                          removeHttpFromUrl(`${historyItem.author_face
                            ? historyItem.author_face
                            : historyItem.cover}@40w_40h_1c`)
                        "
                        w-30px
                        aspect-square
                        object-cover
                        alt=""
                        rounded="1/2"
                        mr-2
                      >
                      {{
                        historyItem.author_name
                          ? historyItem.author_name
                          : historyItem.title
                      }}
                      <span
                        v-if="historyItem.live_status === 1"
                        text="$bew-theme-color"
                        flex
                        items-center
                        gap-1
                        m="l-2"
                      ><div i-tabler:live-photo />
                        {{ t('history.live') }}
                      </span>
                    </a>
                    <div
                      display="xl:none"
                      flex items-center
                      text="$bew-text-3 sm"
                      mt-auto
                    >
                      <span text-xl mr-2 lh-0>
                        <i
                          v-if="historyItem.history.dt === 1 || historyItem.history.dt === 3 || historyItem.history.dt === 5 || historyItem.history.dt === 7"
                          i-mingcute:cellphone-line
                        />
                        <i v-if="historyItem.history.dt === 2" i-mingcute:tv-1-line />
                        <i
                          v-if="historyItem.history.dt === 4 || historyItem.history.dt === 6" i-mingcute:pad-line
                        />
                        <i v-if="historyItem.history.dt === 33" i-mingcute:tv-2-line />
                      </span>
                      <span>
                        {{
                          useDateFormat(historyItem.view_at * 1000, 'YYYY-MM-DD HH:mm:ss')
                            .value
                        }}
                      </span>
                    </div>
                  </div>

                  <button
                    text="size-$bew-icon-size-lg $bew-text-3"
                    hover:color="$bew-theme-color"
                    opacity-0 group-hover:opacity-100
                    p-2
                    duration-300
                    :aria-label="t('common.operation.delete')"
                    @click.prevent.stop="deleteHistoryItem(historyItem)"
                  >
                    <div i-tabler:trash />
                  </button>
                </div>
              </section>
            </ALink>
          </TransitionGroup>
        </div>
      </div>

      <!-- no more content -->
      <Empty v-if="noMoreContent" class="py-4" :description="$t('common.no_more_content')" />

      <!-- loading -->
      <Transition name="fade">
        <loading
          v-if="isLoading && historyList.length !== 0 && !noMoreContent"
          m="-t-4"
        />
      </Transition>
    </main>

    <aside relative w="full md:40% lg:30% xl:25%" order="1 md:2 lg:2">
      <div
        class="history-sidebar-panel bew-popover-surface bew-popover-surface--wallpaper"
        pos="sticky top-120px" flex="~ col gap-4" justify-start my-10 w-full
      >
        <input
          v-model.lazy.trim="keyword"
          type="text"
          :placeholder="t('history.search_watch_history')"
          class="px-3"
          :style="{ height: 'var(--bew-control-height)', lineHeight: 'var(--bew-control-height)' }"
          rounded="$bew-radius"
          bg="$bew-content-solid"
          shadow="$bew-shadow-1"
          outline-none
          w-full
          @keyup.enter="handleSearch"
        >
        <Button
          block
          style="
            --b-button-shadow: var(--bew-shadow-1);
          "
          @click="handleClearAllWatchHistory"
        >
          <template #left>
            <div i-tabler:trash />
          </template>
          {{ $t('history.clear_all_watch_history') }}
        </Button>
        <Button
          v-if="!historyStatus"
          block
          style="
            --b-button-shadow: var(--bew-shadow-1);
          "
          @click="handlePauseWatchHistory"
        >
          <template #left>
            <div i-ph:pause-circle-bold />
          </template>
          {{ $t('history.pause_watch_history') }}
        </Button>
        <Button
          v-else
          block
          style="
            --b-button-shadow: var(--bew-shadow-1);
          "
          @click="handleTurnOnWatchHistory"
        >
          <template #left>
            <div i-ph:play-circle-bold />
          </template>
          {{ $t('history.turn_on_watch_history') }}
        </Button>
      </div>
    </aside>
  </div>
  <Empty v-else mt-6 :description="t('common.please_log_in_first')">
    <Button type="primary" @click="jumpToLoginPage()">
      {{ $t('common.login') }}
    </Button>
  </Empty>
</template>

<style lang="scss" scoped>
.history-grid {
  .history-date-group {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    column-gap: var(--bew-space-6);
  }

  .history-date {
    position: relative;
    padding: var(--bew-space-2) 0 var(--bew-space-8) var(--bew-space-4);
    margin-left: var(--bew-space-1);
    border-left: 2px dashed var(--bew-fill-2);
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-medium);
    line-height: var(--bew-line-height-control);

    &::before {
      content: "";
      position: absolute;
      top: var(--bew-space-3);
      left: -1px;
      width: var(--bew-space-2);
      height: var(--bew-space-2);
      border-radius: 50%;
      background: var(--bew-theme-color);
      transform: translateX(-50%);
    }
  }

  .history-cards {
    min-width: 0;
    padding-bottom: var(--bew-space-8);
  }
}

.history-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-4);
}

.history-remove-action {
  display: grid;
  place-items: center;
  width: var(--bew-control-item-height);
  height: var(--bew-control-item-height);
  margin: var(--bew-space-1);
  color: white;
  background: rgb(0 0 0 / 62%);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-icon-size-sm);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-error-color);
  }
}

.history-cards :deep(.video-card-container:hover) .history-remove-action,
.history-cards :deep(.video-card-container:focus-within) .history-remove-action {
  opacity: 1;
  pointer-events: auto;
}

.history-card:focus-within button {
  opacity: 1;
}

@media (hover: none) {
  .history-remove-action {
    opacity: 1;
    pointer-events: auto;
  }

  .history-card button {
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .history-grid .history-date-group {
    grid-template-columns: 88px minmax(0, 1fr);
    column-gap: var(--bew-space-2);
  }

  .history-grid .history-date {
    padding-left: var(--bew-space-2);
    font-size: var(--bew-font-size-caption);
  }
}

.history-sidebar-panel {
  padding: var(--bew-space-6);
}

.history-sidebar-panel > input {
  background: var(--bew-fill-1);
}

.history-sidebar-panel > :deep(.b-button) {
  --b-button-color: var(--bew-fill-1);
  --b-button-color-hover: var(--bew-fill-2);

  flex-shrink: 0;
  min-height: var(--bew-control-height);
}
</style>
