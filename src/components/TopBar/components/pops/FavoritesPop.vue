<script setup lang="ts">
import type { Ref } from 'vue'

import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
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

const viewAllUrl = computed((): string => {
  return `//space.bilibili.com/${getUserID()}/favlist?fid=${
    activatedMediaId.value
  }&ftype=create`
})

const playAllUrl = computed((): string => {
  return `https://www.bilibili.com/list/ml${activatedMediaId.value}`
})

watch(activatedMediaId, (newVal: number, oldVal: number) => {
  if (newVal === oldVal)
    return

  favoriteResources.length = 0
  if (favoriteVideosWrap.value)
    scrollToTop(favoriteVideosWrap.value)

  currentPageNum.value = 1
  getFavoriteResources()
})

onMounted(() => {
  initData()
})

async function initData() {
  await getFavoriteCategories()
  activatedMediaId.value = favoriteCategories[0].id
  activatedFavoriteTitle.value = favoriteCategories[0].title

  if (favoriteVideosWrap.value) {
    favoriteVideosWrap.value.addEventListener('scroll', () => {
      // When you scroll to the bottom, they will automatically
      // add the next page of data to the history list
      if (
        favoriteVideosWrap.value.clientHeight
        + favoriteVideosWrap.value.scrollTop
        >= favoriteVideosWrap.value.scrollHeight - 20
        && favoriteResources.length > 0
        && !isLoading.value
      ) {
        if (activatedMediaId.value && !noMoreContent.value) {
          currentPageNum.value++
          getFavoriteResources()
        }
      }
    })
  }
}

async function getFavoriteCategories() {
  await api.favorite.getFavoriteCategories({
    up_mid: getUserID(),
  })
    .then((res) => {
      if (res.code === 0) {
        Object.assign(favoriteCategories, res.data.list)
        noMoreContent.value = false
      }
      isLoading.value = false
    })
}

/**
 * Get favorite video resources
 */
function getFavoriteResources() {
  isLoading.value = true
  api.favorite.getFavoriteResources({
    media_id: activatedMediaId.value,
    pn: currentPageNum.value,
    keyword: '',
  })
    .then((res) => {
      const { code, data } = res
      if (code === 0) {
        if ('medias' in data && Array.isArray(data.medias) && data.medias.length > 0)
          favoriteResources.push(...data.medias)

        if (
          !data.medias
          || (data.medias.length < 20 && favoriteResources.length > 0)
        ) {
          isLoading.value = false
          noMoreContent.value = true
          return
        }

        noMoreContent.value = false
      }
      isLoading.value = false
    })
}

function refreshFavoriteResources() {
  favoriteResources.length = 0
  currentPageNum.value = 1
  getFavoriteResources()
}

function changeCategory(categoryItem: FavoriteCategory) {
  activatedMediaId.value = categoryItem.id
  activatedFavoriteTitle.value = categoryItem.title
}

function isMusic(item: FavoriteResource) {
  return item.link.includes('bilibili://music')
}

defineExpose({
  refreshFavoriteResources,
})
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
    h="[calc(100vh-100px)]" max-h-500px important-overflow-y-overlay
    bg="$bew-elevated"
    w="450px"
    rounded="$bew-radius"
    pos="relative"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-border-color"
    class="favorites-pop"
  >
    <!-- top bar -->
    <header
      flex="~" items-center justify-between
      p="x-6"
      pos="sticky top-0 left-0"
      w="full"
      h-50px
      z="2"
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

    <main flex="~" h="[calc(100%-50px)]" rounded="$bew-radius">
      <aside
        pos="sticky top-50px left-0"
        w="140px" h-full overflow="y-auto"
        flex="shrink-0" bg="$bew-fill-1"
      >
        <ul grid="~ cols-1">
          <li
            v-for="item in favoriteCategories"
            :key="item.id"
            :class="activatedMediaId === item.id ? 'activated-category' : ''"
            p="y-2 x-6"
            cursor="pointer"
            transition="~ duration-300"
            @click="changeCategory(item)"
          >
            {{ item.title }}
          </li>
        </ul>
      </aside>

      <!-- Favorite videos wrapper -->
      <div
        ref="favoriteVideosWrap"
        flex="~ col gap-2 1"
        overflow="y-auto"
        p="x-4"
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
          rounded="$bew-radius"
        />

        <!-- empty -->
        <Empty
          v-if="!isLoading && favoriteResources.length === 0"
          w="full" h="full"
          rounded="$bew-radius-half"
        />

        <!-- favorites -->
        <TransitionGroup name="list">
          <ALink
            v-for="item in favoriteResources"
            :key="item.id"
            :href="isMusic(item) ? `https://www.bilibili.com/audio/au${item.id}` : `//www.bilibili.com/video/${item.bvid}`"
            type="topBar"
            hover:bg="$bew-fill-2"
            rounded="$bew-radius"
            m="last:b-4" p="2"
            class="group"
            transition="~ duration-300"
          >
            <section flex="~ gap-4" item-start>
              <div
                bg="$bew-skeleton"
                w="120px"
                flex="shrink-0"
                rounded="$bew-radius-half"
                overflow="hidden"
              >
                <div pos="relative">
                  <img
                    w="120px"
                    class="aspect-video"
                    :src="`${removeHttpFromUrl(item.cover)}@256w_144h_1c`"
                    :alt="item.title"
                    bg="contain"
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
              <div>
                <h3
                  class="keep-two-lines"
                >
                  {{ item.title }}
                </h3>
                <div
                  text="$bew-text-2 sm"
                  m="t-2"
                  flex="~"
                  items-center
                >
                  {{ item.upper.name }}
                </div>
              </div>
            </section>
          </ALink>
        </TransitionGroup>

        <!-- loading -->
        <Transition name="fade">
          <Loading v-if="isLoading && favoriteResources.length !== 0" m="-t-4" />
        </Transition>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.activated-category {
  --uno: "bg-$bew-theme-color text-white";
}
</style>
