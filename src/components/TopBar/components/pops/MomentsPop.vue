<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import Tooltip from '~/components/Tooltip.vue'
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
      name: t('topbar.moments_dropdown.tabs.videos'),
    },
    {
      type: 'live',
      name: t('topbar.moments_dropdown.tabs.live'),
    },
    {
      type: 'article',
      name: t('topbar.moments_dropdown.tabs.articles'),
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

onMounted(() => {
  const wrap = momentsWrap.value
  if (wrap) {
    wrap.addEventListener('scroll', () => {
      if (
        wrap.clientHeight + wrap.scrollTop
        >= wrap.scrollHeight - 20
        && topBarStore.moments.length > 0
        && !topBarStore.isLoadingMoments
      ) {
        getData()
      }
    })
  }
})

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
  // 修改这里，直接使用 topBarStore.addedWatchLaterList
  const isInWatchLater = topBarStore.addedWatchLaterList.includes(aid)

  if (!isInWatchLater) {
    api.watchlater.saveToWatchLater({
      aid,
      csrf: getCSRF(),
    })
      .then((res) => {
        if (res.code === 0)
          topBarStore.addedWatchLaterList.push(aid)
      })
  }
  else {
    api.watchlater.removeFromWatchLater({
      aid,
      csrf: getCSRF(),
    })
      .then((res) => {
        if (res.code === 0) {
          topBarStore.addedWatchLaterList.length = 0
          Object.assign(topBarStore.addedWatchLaterList, topBarStore.addedWatchLaterList.filter(item => item !== aid))
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
    rounded="$bew-radius"
    pos="relative"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-border-color"
    class="moments-pop bew-popover"
    data-key="moments"
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
        <div
          v-for="tab in momentTabs"
          :key="tab.type"
          m="r-4"
          transition="all duration-300"
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
      rounded="$bew-radius"
      overflow-y-auto
      p="x-4"
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
        bg="$bew-content"
        z="0" w="full" h="full"
        flex="~ items-center"
        rounded="$bew-radius-half"
      />

      <!-- moments -->
      <TransitionGroup name="list">
        <ALink
          v-for="(moment, index) in topBarStore.moments"
          :key="index"
          :href="moment.link"
          type="topBar"
          flex="~ justify-between"
          m="b-2" p="2"
          rounded="$bew-radius"
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
          <ALink
            :href="moment.authorJumpUrl"
            type="topBar"
            :stop-propagation="true"
            rounded="1/2"
            w="40px" h="40px" m="r-4"
            bg="$bew-skeleton"
            shrink-0
          >
            <img
              :src="`${moment.authorFace}@50w_50h_1c`"
              rounded="1/2"
              w="40px" h="40px"
            >
          </ALink>

          <div flex="~" justify="between" w="full">
            <div>
              <!-- <span v-if="selectedTab !== 1">{{ `${moment.name} ${t('topbar.moments_dropdown.uploaded')}` }}</span> -->
              <!-- <span v-else>{{ `${moment.name} ${t('topbar.moments_dropdown.now_streaming')}` }}</span> -->

              <ALink
                :href="moment.authorJumpUrl"
                type="topBar"
                :stop-propagation="true"
                font-bold
              >
                {{ moment.author }}
              </ALink>
              <div overflow-hidden text-ellipsis break-anywhere>
                {{ moment.title }}
              </div>
              <div
                text="$bew-text-2 sm"
                m="y-2"
              >
                <!-- publish time -->
                <div v-if="selectedMomentTab.type !== 'live'">
                  {{ moment.pubTime }}
                </div>

                <!-- Live -->
                <div
                  v-else
                  text="$bew-theme-color"
                  font="bold"
                  flex="~"
                  items="center"
                >
                  <div i-fluent:live-24-filled m="r-2" />
                  {{ $t('topbar.moments_dropdown.live_status') }}
                </div>
              </div>
            </div>
            <div
              class="group"
              flex="~ items-center justify-center" w="82px"
              h="46px" m="l-4" shrink-0
              rounded="$bew-radius-half"
              bg="$bew-skeleton"
            >
              <img
                :src="`${moment.cover}@128w_72h_1c`"
                w="82px" h="46px"
                rounded="$bew-radius-half"
              >
              <!-- 修改这里，使用 topBarStore.addedWatchLaterList -->
              <div
                opacity-0 group-hover:opacity-100
                pos="absolute" duration-300 bg="black opacity-60"
                rounded="$bew-radius-half" p-1
                z-1 color-white
                @click.prevent="toggleWatchLater(moment.rid || 0)"
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
        </ALink>
      </TransitionGroup>

      <!-- loading -->
      <Transition name="fade">
        <Loading v-if="topBarStore.isLoadingMoments && topBarStore.moments.length !== 0" m="-t-4" />
      </Transition>
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
