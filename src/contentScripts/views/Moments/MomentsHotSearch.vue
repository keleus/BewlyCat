<script setup lang="ts">
import { storeToRefs } from 'pinia'

import ALink from '~/components/ALink.vue'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { isHomePage } from '~/utils/main'
import { buildKeywordSearchUrl, navigateToPluginSearchResults } from '~/utils/searchNavigation'
import { openLinkInBackground } from '~/utils/tabs'

interface HotSearchItem {
  keyword: string
  show_name: string
  icon: string
}

const list = ref<HotSearchItem[]>([])
const isLoading = ref(false)
const topBarStore = useTopBarStore()
const { searchKeyword } = storeToRefs(topBarStore)

function handleHotSearchClick(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized)
    return

  searchKeyword.value = normalized
  if (navigateToPluginSearchResults(normalized))
    return

  const searchUrl = buildKeywordSearchUrl(normalized)
  if (settings.value.searchBarLinkOpenMode === 'background') {
    void openLinkInBackground(searchUrl)
    return
  }

  let target = '_blank'
  if (settings.value.searchBarLinkOpenMode === 'currentTabIfNotHomepage')
    target = isHomePage() ? '_blank' : '_self'
  else if (settings.value.searchBarLinkOpenMode === 'currentTab' || settings.value.searchBarLinkOpenMode === 'drawer')
    target = '_self'

  window.open(searchUrl, target)
}

async function loadHotSearch() {
  if (isLoading.value)
    return

  isLoading.value = true
  try {
    const res = await api.search.getHotSearchList({ limit: 10 })
    if (res?.code === 0)
      list.value = (res.data?.trending?.list || []).slice(0, 10)
  }
  catch (error) {
    console.error('Failed to load moments hot search:', error)
  }
  finally {
    isLoading.value = false
  }
}

onMounted(loadHotSearch)
</script>

<template>
  <section class="moments-hot-search" aria-label="热搜">
    <header class="moments-hot-search__header">
      <span i-tabler-flame aria-hidden="true" />
      <strong>{{ $t('search_bar.hot_search_title') || '热搜' }}</strong>
    </header>

    <div v-if="isLoading && !list.length" class="moments-hot-search__list" aria-hidden="true">
      <span
        v-for="index in 8"
        :key="index"
        class="moments-hot-search__skeleton"
      />
    </div>
    <div v-else class="moments-hot-search__list">
      <ALink
        v-for="(item, index) in list"
        :key="item.keyword"
        :href="buildKeywordSearchUrl(item.keyword)"
        type="searchBar"
        :custom-click-event="true"
        class="moments-hot-search__item"
        @click="handleHotSearchClick(item.keyword)"
      >
        <span
          class="moments-hot-search__rank"
          :class="`moments-hot-search__rank--${index < 3 ? index + 1 : 'rest'}`"
        >
          {{ index + 1 }}
        </span>
        <span class="moments-hot-search__keyword">{{ item.show_name || item.keyword }}</span>
        <img
          v-if="item.icon && !item.icon.includes('.gif')"
          :src="item.icon"
          class="moments-hot-search__icon"
          alt=""
        >
      </ALink>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.moments-hot-search {
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--bew-space-3);
  border-radius: var(--bew-panel-radius);
  background: var(--bew-elevated);
  scrollbar-width: thin;
}

.moments-hot-search__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-3);
  color: var(--bew-text-1);
}

.moments-hot-search__header strong {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.moments-hot-search__header [class^="i-"] {
  font-size: var(--bew-icon-size-sm);
  color: var(--bew-theme-color);
}

.moments-hot-search__list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.moments-hot-search__item {
  display: flex;
  min-width: 0;
  min-height: 32px;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  text-decoration: none;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.moments-hot-search__item:hover {
  background: var(--bew-fill-2);
}

.moments-hot-search__item:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
}

.moments-hot-search__rank {
  flex: 0 0 16px;
  width: 16px;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-bold);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}

.moments-hot-search__rank--1 {
  color: #f25d8e;
}

.moments-hot-search__rank--2 {
  color: #ff7f24;
}

.moments-hot-search__rank--3 {
  color: #f5b301;
}

.moments-hot-search__keyword {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moments-hot-search__icon {
  flex: 0 0 auto;
  width: auto;
  height: 16px;
  max-width: 24px;
  object-fit: contain;
}

.moments-hot-search__skeleton {
  display: block;
  height: 18px;
  margin: 7px var(--bew-space-2);
  border-radius: var(--bew-radius-sm);
  background: var(--bew-skeleton-color, var(--bew-fill-2));
}
</style>
