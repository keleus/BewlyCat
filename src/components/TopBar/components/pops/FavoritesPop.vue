<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { Ref } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import WatchLaterCoverButton from '~/components/WatchLaterCoverButton.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getUserID, removeHttpFromUrl, scrollToTop } from '~/utils/main'

import type { FavoriteCategory, FavoriteResource } from '../../types'
import PopMediaCard from './PopMediaCard.vue'

const favoriteCategories = reactive<Array<FavoriteCategory>>([])
const favoriteResources = reactive<Array<FavoriteResource>>([])
// 整表替换（切换分类/刷新）时自增，强制重挂载列表组：
// 旧组整体卸载不播离场动画，新组以 appear 播入场，避免同组内旧卡离场与新卡入场叠播成“向下退场”。
const resourcesRenderKey = ref(0)

const activatedMediaId = ref<number>(0)
const activatedFavoriteTitle = ref<string>()
const currentPageNum = ref<number>(1)

const isLoading = ref<boolean>(false)
// when noMoreContent is true, the user can't scroll down to load more content
const noMoreContent = ref<boolean>(false)
const favoriteVideosWrap = ref<HTMLElement>() as Ref<HTMLElement>
const topBarStore = useTopBarStore()
const { favoriteStateVersion } = storeToRefs(topBarStore)
let favoriteDataRequestVersion = 0
let favoriteResourcesRequestVersion = 0

const viewAllUrl = computed((): string => {
  return `//space.bilibili.com/${getUserID()}/favlist?fid=${
    activatedMediaId.value
  }&ftype=create`
})

const playAllUrl = computed((): string => {
  return `https://www.bilibili.com/list/ml${activatedMediaId.value}`
})

watch(activatedMediaId, (newId, oldId) => {
  if (newId === oldId)
    return

  if (favoriteVideosWrap.value)
    scrollToTop(favoriteVideosWrap.value)

  currentPageNum.value = 1
  noMoreContent.value = false
  // 保留旧分类卡片直到新数据到达再原子替换（与刷新路径一致），
  // 避免清空数组导致全屏 Loading 遮罩闪一下。
  void getFavoriteResources(true, true)
})

watch(favoriteStateVersion, () => {
  void refreshFavoriteData()
})

onMounted(refreshFavoriteData)

// 使用 useOptimizedScroll 处理滚动加载
function handleReachBottom() {
  if (isLoading.value || noMoreContent.value || favoriteResources.length === 0)
    return

  if (activatedMediaId.value) {
    currentPageNum.value++
    getFavoriteResources()
  }
}

useOptimizedScroll(
  favoriteVideosWrap,
  { onReachBottom: handleReachBottom },
  { bottomThreshold: 400, throttleDelay: 100 },
)

async function refreshFavoriteData() {
  const requestVersion = ++favoriteDataRequestVersion
  const previousMediaId = activatedMediaId.value
  await getFavoriteCategories(requestVersion)
  if (requestVersion !== favoriteDataRequestVersion)
    return

  const category = favoriteCategories.find(item => item.id === previousMediaId) || favoriteCategories[0]
  if (!category) {
    activatedMediaId.value = 0
    activatedFavoriteTitle.value = undefined
    favoriteResources.length = 0
    favoriteResourcesRequestVersion++
    isLoading.value = false
    return
  }

  if (activatedMediaId.value === category.id) {
    activatedFavoriteTitle.value = category.title
    refreshFavoriteResources()
  }
  else {
    changeCategory(category)
  }
}

async function getFavoriteCategories(requestVersion?: number) {
  await api.favorite.getFavoriteCategories({
    up_mid: getUserID(),
  })
    .then((res) => {
      if (requestVersion !== undefined && requestVersion !== favoriteDataRequestVersion)
        return

      if (res.code === 0) {
        favoriteCategories.length = 0
        favoriteCategories.push(...res.data.list)
        noMoreContent.value = false
      }
      isLoading.value = false
    })
}

/**
 * Get favorite video resources
 */
async function getFavoriteResources(force = false, replace = false) {
  if (isLoading.value && !force)
    return

  const requestVersion = ++favoriteResourcesRequestVersion
  const mediaId = activatedMediaId.value
  const pageNum = currentPageNum.value
  isLoading.value = true

  try {
    const res = await api.favorite.getFavoriteResources({
      media_id: mediaId,
      pn: pageNum,
      keyword: '',
    })

    if (requestVersion !== favoriteResourcesRequestVersion || mediaId !== activatedMediaId.value)
      return

    const { code, data } = res
    if (code === 0) {
      // 检查是否还有更多内容
      if (data && 'has_more' in data && !data.has_more) {
        noMoreContent.value = true
      }
      else {
        noMoreContent.value = false
      }

      const medias = data && 'medias' in data && Array.isArray(data.medias)
        ? data.medias.filter((m: any) => m != null)
        : []

      // 保留旧卡片，等新数据到达后再原子替换，避免 Pop 闪烁；
      // 同 tick 自增渲染 key，让新列表整组重挂载并播入场（追加翻页不走此分支）。
      if (replace) {
        favoriteResources.splice(0, favoriteResources.length, ...medias)
        resourcesRenderKey.value++
      }
      else if (medias.length > 0) {
        favoriteResources.push(...medias)
      }

      if (medias.length === 0) {
        // 如果没有数据返回，也标记为没有更多内容
        noMoreContent.value = true
      }
    }
  }
  catch (error) {
    console.error('Failed to load favorite resources:', error)
  }
  finally {
    if (requestVersion === favoriteResourcesRequestVersion)
      isLoading.value = false
  }
}

function refreshFavoriteResources() {
  currentPageNum.value = 1
  void getFavoriteResources(true, true)
}

function changeCategory(categoryItem: FavoriteCategory) {
  activatedMediaId.value = categoryItem.id
  activatedFavoriteTitle.value = categoryItem.title
}

function isMusic(item: FavoriteResource) {
  return item.link.includes('bilibili://music')
}

defineExpose({
  refreshFavoriteData,
  refreshFavoriteResources,
})
</script>

<template>
  <div
    h="[calc(100vh-100px)]" max-h-500px overflow="hidden"
    bg="$bew-elevated"
    w="480px"
    pos="relative"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-popover-border-color"
    class="favorites-pop bew-popover"
    flex="~ col"
  >
    <!-- top bar -->
    <header
      flex="~" items-center justify-between
      p="x-6 y-5"
      w="full"
    >
      <h3 cursor="pointer" font-600 @click="scrollToTop(favoriteVideosWrap)">
        {{ activatedFavoriteTitle }}
      </h3>

      <div flex="~ gap-4">
        <ALink
          :href="playAllUrl"
          type="topBar"
          class="bew-top-bar-pop-action"
          flex="~" items="center"
        >
          <span text="sm">{{ $t('common.play_all') }}</span>
        </ALink>
        <ALink
          :href="viewAllUrl"
          type="topBar"
          class="bew-top-bar-pop-action"
          flex="~" items="center"
        >
          <span text="sm">{{ $t('common.view_all') }}</span>
        </ALink>
      </div>
    </header>

    <main flex="~" flex-1 min-h-0>
      <aside
        w="170px" h-full overflow="y-auto"
        flex="shrink-0"
        p="2"
      >
        <ul grid="~ cols-1">
          <li
            v-for="item in favoriteCategories"
            :key="item.id"
            :class="activatedMediaId === item.id ? 'activated-category' : ''"
            p="y-2 x-4"
            m="b-1 last:b-0"
            rounded="$bew-menu-item-radius"
            cursor="pointer"
            hover:bg="$bew-fill-2"
            transition="colors duration-200"
            @click="changeCategory(item)"
          >
            <span
              class="favorite-category-label"
              :title="item.title"
            >
              {{ item.title }}
            </span>
          </li>
        </ul>
      </aside>

      <!-- Favorite videos wrapper -->
      <div
        ref="favoriteVideosWrap"
        flex="~ col gap-2 1"
        overflow="y-auto"
        p="r-3"
        pos="relative"
        h-full
      >
        <!-- loading -->
        <Loading
          v-if="isLoading && favoriteResources.length === 0"
          pos="absolute left-0"
          bg="$bew-content"
          z="1"
          w="full"
          h="full"
          flex="~"
          items="center"
          rounded="$bew-panel-radius"
        />

        <!-- empty -->
        <Empty
          v-if="!isLoading && favoriteResources.length === 0"
          w="full" h="full"
        />

        <!-- favorites：key 随整表替换变化，配合 appear 让切换分类时新卡整组上浮淡入 -->
        <TransitionGroup :key="resourcesRenderKey" name="list" appear>
          <ALink
            v-for="item in favoriteResources"
            :key="item.id"
            :href="isMusic(item) ? `https://www.bilibili.com/audio/au${item.id}` : `//www.bilibili.com/video/${item.bvid}`"
            type="topBar"
            block
            hover:bg="$bew-fill-2"
            m="last:b-4" p="2"
            class="group bew-content-card"
            duration-300
          >
            <PopMediaCard
              :title="item.title"
              :cover="`${removeHttpFromUrl(item.cover)}@256w_144h_1c`"
              :author-name="item.upper.name"
              :author-href="`https://space.bilibili.com/${item.upper.mid}`"
              narrow
              cover-class="bew-cover-action-host"
            >
              <!-- 仅视频稿件(type 2)显示稍后再看；音频/合集不支持 -->
              <template #coverTopRight>
                <WatchLaterCoverButton
                  :target="item.type === 2 ? { aid: item.id, bvid: item.bvid } : undefined"
                  size="sm"
                  tooltip-placement="left"
                />
              </template>
              <template #coverOverlay>
                <div
                  pos="absolute bottom-0 right-0"
                  bg="black opacity-60"
                  m="1"
                  p="x-2 y-1"
                  text="white xs"
                  rounded-full
                >
                  {{ calcCurrentTime(item.duration) }}
                </div>
              </template>
            </PopMediaCard>
          </ALink>
        </TransitionGroup>

        <!-- loading -->
        <Transition name="fade">
          <Loading v-if="isLoading && favoriteResources.length !== 0 && currentPageNum > 1" m="b-4" />
        </Transition>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.activated-category {
  --uno: "bg-$bew-theme-color text-white";
}

.favorite-category-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
