<script setup lang="ts">
import { useDateFormat } from '@vueuse/core'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import Progress from '~/components/Progress.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import type { HistoryResult, List as HistoryItem } from '~/models/history/history'
import { Business } from '~/models/history/history'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getCSRF, removeHttpFromUrl, scrollToTop } from '~/utils/main'

const { t } = useI18n()
const historys = reactive<Array<HistoryItem>>([])
const historyTabs = computed(() => [
  {
    id: 0,
    name: t('topbar.moments_dropdown.tabs.videos'),
    isSelected: true,
  },
  {
    id: 1,
    name: t('topbar.moments_dropdown.tabs.live'),
    isSelected: false,
  },
  {
    id: 2,
    name: t('topbar.moments_dropdown.tabs.articles'),
    isSelected: false,
  },
])
/**
 * Active tab (0: archive, 1: live, 2: article)
 */
const activatedTab = ref<number>(0)
const isLoading = ref<boolean>(false)
// when noMoreContent is true, the user can't scroll down to load more content
const noMoreContent = ref<boolean>(false)
// API 报错时为 true
const loadFailed = ref<boolean>(false)
const livePage = ref<number>(1)
const historysWrap = ref<HTMLElement>() as Ref<HTMLElement>

watch(activatedTab, (newVal: number | undefined, oldVal: number | undefined) => {
  if (newVal === oldVal)
    return

  historys.length = 0
  if (historysWrap.value)
    scrollToTop(historysWrap.value)

  if (newVal === 0) {
    getHistoryList(Business.ARCHIVE)
  }
  else if (newVal === 1) {
    livePage.value = 1
    getHistoryList(Business.LIVE)
  }
  else if (newVal === 2) {
    getHistoryList(Business.ARTICLE)
  }
}, { immediate: true })

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (isLoading.value || noMoreContent.value || historys.length === 0)
    return

  const lastViewAt = historys[historys.length - 1]?.view_at
  if (!lastViewAt)
    return

  if (activatedTab.value === 0) {
    getHistoryList(Business.ARCHIVE, lastViewAt)
  }
  else if (activatedTab.value === 1) {
    getHistoryList(Business.LIVE, lastViewAt)
  }
  else if (activatedTab.value === 2) {
    getHistoryList(Business.ARTICLE, lastViewAt)
  }
}

function retryHistoryList() {
  noMoreContent.value = false
  const lastViewAt = historys[historys.length - 1]?.view_at ?? 0

  if (activatedTab.value === 0) {
    getHistoryList(Business.ARCHIVE, lastViewAt)
  }
  else if (activatedTab.value === 1) {
    getHistoryList(Business.LIVE, lastViewAt)
  }
  else if (activatedTab.value === 2) {
    getHistoryList(Business.ARTICLE, lastViewAt)
  }
}

useOptimizedScroll(
  historysWrap,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

function onClickTab(tabId: number) {
  // Prevent changing tab when loading, cuz it will cause a bug
  if (isLoading.value)
    return

  noMoreContent.value = false

  activatedTab.value = tabId
  historyTabs.value.forEach((tab) => {
    tab.isSelected = tab.id === tabId
  })
}

/**
 * Return the URL of the history item
 * @param item history item
 * @return {string} url
 */
function getHistoryUrl(item: HistoryItem) {
  if (item.uri)
    return item.uri

  // Video
  if (item.history.business === Business.ARCHIVE) {
    if (item?.videos && item.videos > 0)
      return `//www.bilibili.com/video/${item.history.bvid}?p=${item.history.page}`
    return `//www.bilibili.com/video/${item.history.bvid}`
  }
  // Live
  else if (item.history.business === Business.LIVE) {
    return `//live.bilibili.com/${item.history.oid}`
  }
  // Article
  else if (item.history.business === Business.ARTICLE || item.history.business === Business.ARTICLE_LIST) {
    if (item.history.cid === 0)
      return `//www.bilibili.com/read/cv${item.history.oid}`
    else
      return `//www.bilibili.com/read/cv${item.history.cid}`
  }
  return ''
}

/**
 * Get history list
 * @param type
 * @param view_at Last viewed timestamp
 */
async function getHistoryList(type: Business, view_at = 0 as number) {
  if (isLoading.value)
    return
  if (noMoreContent.value)
    return

  isLoading.value = true
  loadFailed.value = false

  try {
    const res: HistoryResult = await api.history.getHistoryList({
      type,
      view_at,
    })

    if (res.code === 0) {
      // 如果返回的数据为空，说明没有更多内容了
      if (!res.data?.list || res.data.list.length === 0) {
        noMoreContent.value = true
        return
      }

      // 添加数据到列表
      if (Array.isArray(res.data.list) && res.data.list.length > 0) {
        historys.push(...res.data.list)
      }
    }
    else {
      console.error('Failed to load history list:', res)
      loadFailed.value = true
      noMoreContent.value = false
    }
  }
  catch (error) {
    console.error('Failed to load history list:', error)
    loadFailed.value = true
    noMoreContent.value = false
  }
  finally {
    isLoading.value = false
  }
}

function deleteHistoryItem(index: number, historyItem: HistoryItem) {
  api.history.deleteHistoryItem({
    kid: `${historyItem.history.business}_${historyItem.history.oid}`,
    csrf: getCSRF(),
  })
    .then((res) => {
      if (res.code === 0)
        historys.splice(index, 1)
    })
}

function initData() {
  historys.length = 0
  noMoreContent.value = false
  if (historysWrap.value)
    scrollToTop(historysWrap.value)

  if (activatedTab.value === 0) {
    getHistoryList(Business.ARCHIVE)
  }
  else if (activatedTab.value === 1) {
    livePage.value = 1
    getHistoryList(Business.LIVE)
  }
  else if (activatedTab.value === 2) {
    getHistoryList(Business.ARTICLE)
  }
}

defineExpose({
  initData,
})
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
    h="[calc(100vh-100px)]" max-h-500px important-overflow-y-overlay
    bg="$bew-elevated"
    w="380px"
    pos="relative"
    shadow="$bew-shadow-3"
    border="1 $bew-popover-border-color"
    class="history-pop bew-popover"
    data-key="history"
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
        <div
          v-for="tab in historyTabs"
          :key="tab.id"
          m="r-4"
          transition="background-color duration-200, color duration-200, opacity duration-200"
          class="tab"
          :class="tab.isSelected ? 'tab-selected' : ''"
          cursor="pointer"
          @click="onClickTab(tab.id)"
        >
          {{ tab.name }}
        </div>
      </div>
      <ALink
        href="https://www.bilibili.com/history"
        type="topBar"
        flex="~ items-center"
      >
        <span text="sm">{{ $t('common.view_all') }}</span>
      </ALink>
    </header>

    <!-- historys wrapper -->
    <main
      ref="historysWrap"
      overflow-y-auto
      flex="~ col gap-2"
      p="x-3"
      flex-1
      min-h-0
      pos="relative"
    >
      <!-- loading -->
      <Loading
        v-if="isLoading && historys.length === 0"
        h="full"
        flex="~ items-center"
      />

      <!-- empty -->
      <Empty
        v-if="!isLoading && !loadFailed && historys.length === 0"
        pos="absolute top-0 left-0"
        z="0" w="full" h="full"
        flex="~ items-center"
      />

      <!-- load failed -->
      <Empty
        v-if="!isLoading && loadFailed && historys.length === 0"
        :description="$t('common.load_failed')"
        pos="absolute top-0 left-0"
        z="0" w="full" h="full"
        flex="~ col items-center justify-center"
      >
        <Button type="secondary" size="small" @click="retryHistoryList">
          {{ $t('common.operation.refresh') }}
        </Button>
      </Empty>

      <!-- historys -->
      <TransitionGroup name="list">
        <ALink
          v-for="(historyItem, index) in historys"
          :key="historyItem.kid"
          :href="getHistoryUrl(historyItem)"
          type="topBar"
          class="group bew-content-card"
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
                @click.stop.prevent="deleteHistoryItem(index, historyItem)"
              >
                <i i-mingcute:close-line />
              </div>

              <!-- Video -->
              <template v-if="activatedTab === 0">
                <div class="bew-top-bar-media-frame">
                  <img
                    w-full h-full
                    :src="`${removeHttpFromUrl(
                      historyItem.cover,
                    )}@320w_180h_1c`"
                    :alt="historyItem.title"
                    object-cover
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
                        historyItem.progress === -1
                          ? calcCurrentTime(historyItem.duration)
                          : calcCurrentTime(historyItem.progress)
                      } /
                    ${calcCurrentTime(historyItem.duration)}`
                    }}
                  </div>
                </div>
                <Progress
                  :percentage="
                    (historyItem.progress / historyItem.duration) * 100
                  "
                />
              </template>

              <!-- Live -->
              <template v-else-if="activatedTab === 1">
                <div class="bew-top-bar-media-frame">
                  <img
                    w-full h-full
                    :src="`${removeHttpFromUrl(
                      historyItem.cover,
                    )}@320w_180h_1c`"
                    :alt="historyItem.title"
                    object-cover
                  >
                  <div
                    v-if="historyItem.live_status === 1"
                    pos="absolute top-0 left-0"
                    bg="$bew-theme-color"
                    text="xs white"
                    p="x-2 y-1"
                    m="1"
                    rounded-full
                    font="semibold"
                  >
                    LIVE
                    <i i-svg-spinners:pulse-3 align-middle mt--0.2em />
                  </div>
                  <div
                    v-else
                    pos="absolute top-0 left-0"
                    bg="black opacity-60"
                    text="xs white"
                    p="x-2 y-1"
                    m="1"
                    rounded="full"
                  >
                    OFFLINE
                  </div>
                </div>
              </template>

              <!-- Article -->
              <div v-else-if="activatedTab === 2" class="bew-top-bar-media-frame">
                <img
                  w-full h-full
                  :src="`${
                    Array.isArray(historyItem.covers)
                      ? historyItem.covers[0]
                      : ''
                  }@320w_180h_1c`"
                  object-cover
                  :alt="historyItem.title"
                  bg="contain"
                >
              </div>
            </div>

            <!-- Description -->
            <div class="bew-top-bar-media-copy">
              <h3
                :title="historyItem.title"
                class="bew-top-bar-media-title"
              >
                {{ historyItem.title }}
              </h3>
              <div text="$bew-text-2" m="t-2" flex="~ items-center">
                <ALink
                  :href="`https://space.bilibili.com/${historyItem.author_mid}`"
                  type="topBar"
                  :stop-propagation="true"
                  class="bew-top-bar-media-author"
                >
                  {{ historyItem.author_name }}
                </ALink>
                <span
                  v-if="historyItem.live_status === 1"
                  text="$bew-theme-color"
                  flex
                  items-center
                  gap-1
                  m="l-2"
                >
                  LIVE
                  <i i-svg-spinners:pulse-3 align-middle mt--0.2em />
                </span>
              </div>
              <p class="bew-top-bar-media-meta" text="$bew-text-2">
                {{
                  useDateFormat(
                    historyItem.view_at * 1000,
                    'YYYY-MM-DD HH:mm:ss',
                  ).value
                }}
              </p>
            </div>
          </section>
        </ALink>
      </TransitionGroup>
      <div
        v-if="!isLoading && loadFailed && historys.length > 0"
        flex="~ items-center justify-center gap-2"
        m="b-4"
        text="$bew-text-2 sm"
      >
        <span>{{ $t('common.load_failed') }}</span>
        <Button type="tertiary" size="small" @click="retryHistoryList">
          {{ $t('common.operation.refresh') }}
        </Button>
      </div>
      <!-- loading -->
      <Transition name="fade">
        <Loading v-if="isLoading && historys.length !== 0" m="b-4" />
      </Transition>
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
