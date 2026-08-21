<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { ComponentPublicInstance, Ref } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import { useOptimizedScroll } from '~/composables/useOptimizedScroll'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { calcCurrentTime } from '~/utils/dataFormatter'
import { getUserID, removeHttpFromUrl, scrollToTop } from '~/utils/main'

import type { FavoriteCategory, FavoriteResource } from '../../types'

const favoriteCategories = reactive<Array<FavoriteCategory>>([])
const favoriteResources = reactive<Array<FavoriteResource>>([])

const activatedMediaId = ref<number>(0)
const activatedFavoriteTitle = ref<string>()
const currentPageNum = ref<number>(1)

const isLoading = ref<boolean>(false)
// when noMoreContent is true, the user can't scroll down to load more content
const noMoreContent = ref<boolean>(false)
const favoriteVideosWrap = ref<HTMLElement>() as Ref<HTMLElement>
const topBarStore = useTopBarStore()
const { favoriteStateVersion } = storeToRefs(topBarStore)
const categoryLabelElements = new Map<number, HTMLElement>()
const categoryMarqueeStyles = reactive<Record<number, Record<string, string>>>({})
let favoriteDataRequestVersion = 0
let favoriteResourcesRequestVersion = 0
let categoryLabelResizeObserver: ResizeObserver | undefined

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

  favoriteResources.length = 0
  if (favoriteVideosWrap.value)
    scrollToTop(favoriteVideosWrap.value)

  currentPageNum.value = 1
  noMoreContent.value = false
  void getFavoriteResources(true)
})

watch(favoriteStateVersion, () => {
  void refreshFavoriteData()
})

onMounted(() => {
  categoryLabelResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement
      const categoryId = Number(element.dataset.categoryId)
      updateCategoryMarquee(categoryId, element)
    }
  })
  categoryLabelElements.forEach(element => categoryLabelResizeObserver?.observe(element))
  initData()
})

onBeforeUnmount(() => categoryLabelResizeObserver?.disconnect())

function updateCategoryMarquee(categoryId: number, element: HTMLElement) {
  const textElement = element.querySelector<HTMLElement>('.favorite-category-label__text')
  if (!textElement)
    return

  const overflowDistance = Math.ceil(textElement.scrollWidth - element.clientWidth)
  if (overflowDistance <= 1) {
    delete categoryMarqueeStyles[categoryId]
    return
  }

  const duration = Math.min(12, Math.max(4, overflowDistance / 24 + 3))
  categoryMarqueeStyles[categoryId] = {
    '--favorite-category-marquee-distance': `-${overflowDistance}px`,
    '--favorite-category-marquee-duration': `${duration}s`,
  }
}

function setCategoryLabelRef(element: Element | ComponentPublicInstance | null, categoryId: number) {
  const previousElement = categoryLabelElements.get(categoryId)
  if (previousElement && previousElement !== element)
    categoryLabelResizeObserver?.unobserve(previousElement)

  if (!(element instanceof HTMLElement)) {
    categoryLabelElements.delete(categoryId)
    delete categoryMarqueeStyles[categoryId]
    return
  }

  categoryLabelElements.set(categoryId, element)
  categoryLabelResizeObserver?.observe(element)
}

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

async function initData() {
  await refreshFavoriteData()
}

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
async function getFavoriteResources(force = false) {
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

      // 添加数据到列表
      if (data && 'medias' in data && Array.isArray(data.medias) && data.medias.length > 0) {
        favoriteResources.push(...data.medias.filter((m: any) => m != null))
      }
      else if (!data || !data.medias || data.medias.length === 0) {
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
  favoriteResources.length = 0
  currentPageNum.value = 1
  void getFavoriteResources(true)
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
    w="450px"
    pos="relative"
    shadow="$bew-shadow-3"
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

    <main flex="~" flex-1 min-h-0>
      <aside
        w="140px" h-full overflow="y-auto"
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
            transition="background-color duration-200, color duration-200, opacity duration-200"
            @click="changeCategory(item)"
          >
            <span
              :ref="element => setCategoryLabelRef(element, item.id)"
              class="favorite-category-label"
              :data-category-id="item.id"
              :title="item.title"
            >
              <span
                class="favorite-category-label__text"
                :class="{
                  'is-marquee': activatedMediaId === item.id && !!categoryMarqueeStyles[item.id],
                }"
                :style="categoryMarqueeStyles[item.id]"
              >
                {{ item.title }}
              </span>
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

        <!-- favorites -->
        <TransitionGroup name="list">
          <ALink
            v-for="item in favoriteResources"
            :key="item.id"
            :href="isMusic(item) ? `https://www.bilibili.com/audio/au${item.id}` : `//www.bilibili.com/video/${item.bvid}`"
            type="topBar"
            hover:bg="$bew-fill-2"
            m="last:b-4" p="2"
            class="group bew-content-card"
            transition="colors"
            duration-200
          >
            <section flex="~ gap-4" items-start>
              <div
                class="bew-top-bar-media-frame bew-top-bar-media-frame--narrow"
                bg="$bew-skeleton"
              >
                <div pos="relative" w-full h-full>
                  <img
                    w-full h-full
                    :src="`${removeHttpFromUrl(item.cover)}@256w_144h_1c`"
                    :alt="item.title"
                    object-cover
                  >
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
                </div>
              </div>

              <!-- Description -->
              <div class="bew-top-bar-media-copy">
                <h3
                  :title="item.title"
                  class="bew-top-bar-media-title"
                >
                  {{ item.title }}
                </h3>
                <div
                  text="$bew-text-2"
                  m="t-2"
                  flex="~"
                  items-center
                >
                  <ALink
                    :href="`https://space.bilibili.com/${item.upper.mid}`"
                    type="topBar"
                    :stop-propagation="true"
                    class="bew-top-bar-media-author"
                  >
                    {{ item.upper.name }}
                  </ALink>
                </div>
              </div>
            </section>
          </ALink>
        </TransitionGroup>

        <!-- loading -->
        <Transition name="fade">
          <Loading v-if="isLoading && favoriteResources.length !== 0" m="b-4" />
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
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.favorite-category-label__text {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-marquee {
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    animation: favorite-category-marquee var(--favorite-category-marquee-duration) linear infinite alternate;
    will-change: transform;
  }
}

@keyframes favorite-category-marquee {
  0%,
  15% {
    transform: translateX(0);
  }

  85%,
  100% {
    transform: translateX(var(--favorite-category-marquee-distance));
  }
}

@media (prefers-reduced-motion: reduce) {
  .favorite-category-label__text.is-marquee {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    animation: none;
  }
}
</style>
