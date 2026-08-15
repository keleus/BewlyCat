<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import Icon from '~/components/Icon.vue'
import Loading from '~/components/Loading.vue'
import Tooltip from '~/components/Tooltip.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, scrollToTop } from '~/utils/main'

type MomentType = 'video' | 'live' | 'article'
interface MomentTab { type: MomentType, name: any }

const topBarStore = useTopBarStore()

const { t } = useI18n()

const momentTabs = computed((): MomentTab[] => {
  return [
    {
      type: 'video',
      // 如果开启了过滤专栏，显示"视频"，否则显示"全部"
      name: settings.value.filterArticlesInMoments
        ? t('topbar.moments_dropdown.tabs.videos')
        : t('topbar.moments_dropdown.tabs.all'),
    },
    {
      type: 'live',
      name: t('topbar.moments_dropdown.tabs.live'),
    },
  ]
},
)
const selectedMomentTab = ref<MomentTab>(momentTabs.value[0])

const momentsWrap = ref<HTMLElement>()

watch(() => selectedMomentTab.value.type, (newVal, oldVal) => {
  if (newVal === oldVal)
    return

  if (momentsWrap.value)
    scrollToTop(momentsWrap.value)

  initData()
})

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (topBarStore.isLoadingMoments || topBarStore.moments.length === 0)
    return

  getData()
}

useOptimizedScroll(
  momentsWrap,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

function onClickTab(tab: MomentTab) {
  // Prevent changing tab when loading, cuz it will cause a bug
  if (topBarStore.isLoadingMoments || tab.type === selectedMomentTab.value.type)
    return

  selectedMomentTab.value = tab
  // 移除这里的 initData() 调用，因为 watch 已经会处理
}

function initData() {
  topBarStore.initMomentsData(selectedMomentTab.value.type)
}

function getData() {
  topBarStore.getMomentsData(selectedMomentTab.value.type)
}

function toggleWatchLater(aid: number) {
  const accountId = topBarStore.userInfo.mid
  if (!topBarStore.isLogin || !accountId)
    return

  // 修改这里，直接使用 topBarStore.addedWatchLaterList
  const isInWatchLater = topBarStore.addedWatchLaterList.includes(aid)

  if (!isInWatchLater) {
    api.watchlater.saveToWatchLater({
      aid,
      csrf: getCSRF(),
    })
      .then((res) => {
        if (res.code === 0 && topBarStore.isLogin && topBarStore.userInfo.mid === accountId) {
          topBarStore.addedWatchLaterList.push(aid)
          void topBarStore.syncWatchLaterState()
        }
      })
  }
  else {
    api.watchlater.removeFromWatchLater({
      aid,
      csrf: getCSRF(),
    })
      .then((res) => {
        if (res.code === 0 && topBarStore.isLogin && topBarStore.userInfo.mid === accountId) {
          const index = topBarStore.addedWatchLaterList.indexOf(aid)
          if (index !== -1)
            topBarStore.addedWatchLaterList.splice(index, 1)
          void topBarStore.syncWatchLaterState()
        }
      })
  }
}

defineExpose({
  initData,
})
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);" h="[calc(100vh-100px)]" max-h-500px
    important-overflow-y-overlay
    bg="$bew-elevated"
    w="380px"
    pos="relative"
    shadow="$bew-shadow-3"
    border="1 $bew-popover-border-color"
    class="moments-pop bew-popover"
    data-key="moments"
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
          v-for="tab in momentTabs"
          :key="tab.type"
          m="r-4"
          transition="background-color duration-200, color duration-200, opacity duration-200"
          class="tab"
          :class="tab.type === selectedMomentTab.type ? 'tab-selected' : ''"
          cursor="pointer"
          @click="onClickTab(tab)"
        >
          {{ tab.name }}
        </div>
      </div>
      <ALink
        href="https://t.bilibili.com/"
        type="topBar"
        flex="~ items-center"
      >
        <span text="sm">{{ $t('common.view_all') }}</span>
      </ALink>
    </header>

    <!-- moments wrapper -->
    <main
      ref="momentsWrap"
      overflow-x-hidden
      overflow-y-auto
      p="x-3"
      flex="~ col gap-2"
      flex-1
      min-h-0
    >
      <!-- loading -->
      <Loading
        v-if="topBarStore.isLoadingMoments && topBarStore.moments.length === 0"
        h="full"
        flex="~"
        items="center"
      />

      <!-- empty -->
      <Empty
        v-else-if="!topBarStore.isLoadingMoments && topBarStore.moments.length === 0"
        pos="absolute top-0 left-0"
        z="0" w="full" h="full"
        flex="~ items-center"
      />

      <!-- moments -->
      <TransitionGroup name="list">
        <ALink
          v-for="(moment, index) in topBarStore.moments"
          :key="index"
          :href="moment.link"
          type="topBar"
          class="group bew-content-card"
          m="last:b-4" p="2"
          hover:bg="$bew-fill-2"
          duration-300
          pos="relative"
        >
          <!-- new moment dot -->
          <div
            v-if="topBarStore.isNewMoment(index) && selectedMomentTab.type === 'video'"
            rounded="full"
            w="8px"
            h="8px"
            m="-2"
            bg="$bew-theme-color"
            pos="absolute -top-12px -left-12px"
            style="box-shadow: 0 0 4px var(--bew-theme-color)"
          />
          <section flex="~ row-reverse gap-4 items-start">
            <div class="bew-top-bar-media-copy">
              <h3
                :title="moment.title"
                class="bew-top-bar-media-title bew-top-bar-media-title--emphasis"
              >
                {{ moment.title }}
              </h3>

              <div flex="~ items-center gap-2" min-w-0 m="t-2">
                <ALink
                  :href="moment.authorJumpUrl"
                  type="topBar"
                  :stop-propagation="true"
                  rounded="1/2"
                  w="24px" h="24px"
                  bg="$bew-skeleton"
                  shrink-0
                >
                  <img
                    :src="`${moment.authorFace}@48w_48h_1c`"
                    rounded="1/2"
                    w="24px" h="24px"
                  >
                </ALink>

                <div
                  class="bew-top-bar-media-author--compact"
                  min-w-0
                  flex-1
                >
                  <!-- 联合投稿显示多个作者 -->
                  <template v-if="moment.isCollaborative && moment.authors">
                    <template v-for="(author, idx) in moment.authors" :key="author.jump_url">
                      <ALink
                        :href="author.jump_url"
                        type="topBar"
                        :stop-propagation="true"
                        class="bew-top-bar-media-author"
                      >
                        {{ author.name }}
                      </ALink>
                      <span v-if="Number(idx) < moment.authors.length - 1" text="$bew-text-2">/</span>
                    </template>
                  </template>
                  <!-- 单个作者 -->
                  <ALink
                    v-else
                    :href="moment.authorJumpUrl"
                    type="topBar"
                    :stop-propagation="true"
                    class="bew-top-bar-media-author"
                  >
                    {{ moment.author }}
                  </ALink>
                </div>

                <div
                  class="bew-top-bar-media-meta"
                  shrink-0
                  whitespace-nowrap
                >
                  <!-- publish time -->
                  <span v-if="selectedMomentTab.type !== 'live'" text="$bew-text-2">
                    {{ moment.pubTime }}
                  </span>

                  <!-- Live -->
                  <span
                    v-else
                    text="$bew-theme-color"
                    font="semibold"
                    flex="~ items-center"
                  >
                    <span i-fluent:live-24-filled m="r-1" />
                    {{ $t('topbar.moments_dropdown.live_status') }}
                  </span>
                </div>
              </div>
            </div>

            <div
              class="bew-top-bar-media-column bew-top-bar-media-column--narrow"
              bg="$bew-skeleton"
            >
              <div
                class="bew-top-bar-media-frame"
                flex="~ items-center justify-center"
              >
                <img
                  :src="`${moment.cover}@240w_135h_1c`"
                  :alt="moment.title"
                >
                <!-- 修改这里，使用 topBarStore.addedWatchLaterList -->
                <div
                  opacity-0 group-hover:opacity-100
                  pos="absolute top-0 right-0"
                  m="1"
                  w="24px" h="24px"
                  grid="~ place-items-center"
                  duration-300 bg="black opacity-60"
                  rounded="$bew-radius-half"
                  z-1 color-white
                  @click.stop.prevent="toggleWatchLater(moment.rid || 0)"
                >
                  <Tooltip v-if="!topBarStore.addedWatchLaterList.includes(moment.rid || 0)" :content="$t('common.save_to_watch_later')" placement="bottom" type="dark">
                    <div i-mingcute:carplay-line />
                  </Tooltip>
                  <Tooltip v-else :content="$t('common.added')" placement="bottom" type="dark">
                    <Icon icon="line-md:confirm" />
                  </Tooltip>
                </div>
              </div>
            </div>
          </section>
        </ALink>
      </TransitionGroup>

      <!-- loading -->
      <Transition name="fade">
        <Loading v-if="topBarStore.isLoadingMoments && topBarStore.moments.length !== 0" m="b-4" />
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
