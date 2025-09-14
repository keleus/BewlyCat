<script lang="ts" setup>
import { settings } from '~/logic'
import api from '~/utils/api'

// 热搜数据类型定义
interface HotSearchItem {
  keyword: string
  show_name: string
  icon: string
}

interface HotSearchResponse {
  code: number
  data: {
    trending: {
      list: HotSearchItem[]
    }
  }
}

// 热搜相关状态
const hotSearchList = ref<HotSearchItem[]>([])
const isLoadingHotSearch = ref<boolean>(false)

// 加载热搜数据
async function loadHotSearchData() {
  if (isLoadingHotSearch.value)
    return

  try {
    isLoadingHotSearch.value = true
    const res: HotSearchResponse = await api.search.getHotSearchList({ limit: 18 })
    if (res && res.code === 0) {
      hotSearchList.value = res.data.trending.list.slice(0, 18)
    }
  }
  catch (error) {
    console.error('Failed to load hot search data:', error)
  }
  finally {
    isLoadingHotSearch.value = false
  }
}

// 页面加载时获取热搜数据
onMounted(() => {
  if (settings.value.showHotSearchInSearchPage) {
    loadHotSearchData()
  }
})
</script>

<template>
  <div
    flex="~ col"
    justify-center
    items-center
    w-full z-10
    m="t-20vh"
  >
    <Logo
      v-if="settings.searchPageShowLogo" :size="180" :color="settings.searchPageLogoColor === 'white' ? 'white' : 'var(--bew-theme-color)'"
      :glow="settings.searchPageLogoGlow"
      mb-12 z-1
    />
    <SearchBar
      :darken-on-focus="settings.searchPageDarkenOnSearchFocus"
      :blurred-on-focus="settings.searchPageBlurredOnSearchFocus"
      :focused-character="settings.searchPageSearchBarFocusCharacter"
      :show-hot-search="false"
    />

    <!-- 热搜 -->
    <div
      v-if="settings.showHotSearchInSearchPage"
      class="hot-search-section"
      w-full max-w-900px mt-8 px-4
    >
      <div v-if="isLoadingHotSearch" class="loading-container" text-center py-8>
        <div
          class="loading-spinner"
          inline-block w-8 h-8
          border="2 solid $bew-border-color"
          border-t="2 solid $bew-theme-color"
          rounded-full
          animate-spin
        />
        <p mt-4 text="$bew-text-2">
          {{ $t('search_page.loading') }}
        </p>
      </div>

      <div
        v-else-if="hotSearchList.length > 0"
        class="hot-search-container"
        grid="~ cols-3 gap-x-4 gap-y-2"
      >
        <ALink
          v-for="(item, index) in hotSearchList"
          :key="item.keyword"
          :href="`//search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword)}`"
          type="searchBar"
          class="hot-search-item cursor-pointer duration-300"
          flex items-center gap-2 p="x-3 y-2" hover="text-$bew-theme-color bg-$bew-fill-2"
          rounded="$bew-radius-half"
        >
          <span
            class="index"
            :class="{
              'top-1': index === 0,
              'top-2': index === 1,
              'top-3': index === 2,
              'normal': index > 2,
            }"
            text="xs" min-w-4 text-center font-bold
          >
            {{ index + 1 }}
          </span>
          <span class="keyword" text="sm $bew-text-1" truncate flex-1>{{ item.show_name }}</span>
          <img
            v-if="item.icon && !item.icon.includes('.gif')"
            :src="item.icon"
            class="hot-search-icon"
            object-contain
            alt=""
          >
        </ALink>
      </div>

      <div v-else class="empty-state" text-center py-8>
        <div i-tabler:search-off text="4xl $bew-text-3" mb-4 />
        <p text="$bew-text-2">
          {{ $t('search_page.no_hot_search_data') }}
        </p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.hot-search-section {
  position: relative;
  z-index: 10;

  .hot-search-container {
    .hot-search-item {
      .index {
        &.top-1 {
          --uno: "text-red-500";
        }

        &.top-2 {
          --uno: "text-orange-500";
        }

        &.top-3 {
          --uno: "text-yellow-500";
        }

        &.normal {
          --uno: "text-$bew-text-3";
        }
      }

      .hot-search-icon {
        object-fit: contain;
        display: inline-block;
        height: 16px;
        width: auto;
        max-width: 24px;
        vertical-align: baseline;
        flex-shrink: 0;
        position: relative;
        z-index: inherit;
        margin: 0;
        padding: 0;
        border: none;
        background: none;
      }
    }
  }
}
</style>
