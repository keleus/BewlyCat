<script setup lang="ts">
import { onClickOutside, onKeyStroke, useDebounceFn } from '@vueuse/core'
import DOMPurify from 'dompurify'
import { computed, inject, reactive, ref, shallowRef, watch } from 'vue'

import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import api from '~/utils/api'
import { findLeafActiveElement } from '~/utils/element'
import { isHomePage } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'

import type { HistoryItem, SuggestionItem, SuggestionResponse } from './searchHistoryProvider'
import {
  addSearchHistory,
  clearAllSearchHistory,
  getSearchHistory,
  removeSearchHistory,
} from './searchHistoryProvider'

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

// 搜索推荐数据类型定义
interface SearchRecommendationItem {
  seid: string
  id: number
  type: number
  show_name: string
  name: string
  goto_type: number
  goto_value: string
  url: string
}

interface SearchRecommendationResponse {
  code: number
  message: string
  ttl: number
  data: SearchRecommendationItem
}

const props = defineProps<{
  darkenOnFocus?: boolean
  blurredOnFocus?: boolean
  focusedCharacter?: string
  showHotSearch?: boolean
  modelValue?: string
  searchBehavior?: 'navigate' | 'stay'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: [value: string]
}>()

const searchWrapRef = ref<HTMLElement>()
const keywordRef = ref<HTMLInputElement>()
const isFocus = ref<boolean>(false)
const keyword = ref<string>(props.modelValue ?? '')
const suggestions = reactive<SuggestionItem[]>([])
const selectedIndex = ref<number>(-1)
const searchHistory = shallowRef<HistoryItem[]>([])
const historyItemRef = ref<HTMLElement[]>([])
const suggestionItemRef = ref<HTMLElement[]>([])
// 热搜相关状态
const hotSearchList = ref<HotSearchItem[]>([])
const isLoadingHotSearch = ref<boolean>(false)
// 搜索推荐相关状态
const searchRecommendation = ref<SearchRecommendationItem | null>(null)
const isLoadingSearchRecommendation = ref<boolean>(false)

const searchMode = computed(() => props.searchBehavior ?? 'navigate')
const isInPlaceSearch = computed(() => searchMode.value === 'stay')

// 计算 placeholder 显示文本
const placeholderText = computed(() => {
  if (settings.value.showSearchRecommendation && searchRecommendation.value) {
    return searchRecommendation.value.show_name || searchRecommendation.value.name
  }
  return ''
})

// 尝试获取 BEWLY_APP（在首页时可用）
const bewlyApp = inject<BewlyAppProvider | undefined>('BEWLY_APP', undefined)

// 判断是否在搜索页且启用了插件搜索
const shouldHandleInCurrentPage = computed(() => {
  if (!settings.value.usePluginSearchResultsPage)
    return false
  // 如果能获取到 bewlyApp，使用 activatedPage 来判断
  if (bewlyApp?.activatedPage) {
    return bewlyApp.activatedPage.value === AppPage.Search
  }
  // 降级方案：检查 URL 参数（在非首页或无法获取 bewlyApp 时使用）
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('page') === 'Search' && !!urlParams.get('keyword')
})

watch(() => props.modelValue, (value) => {
  const next = value ?? ''
  if (next !== keyword.value)
    keyword.value = next
})

watch(keyword, (value) => {
  if (value !== (props.modelValue ?? ''))
    emit('update:modelValue', value)
})

watch(isFocus, async (focus) => {
  // 延后加载搜索历史
  if (focus) {
    try {
      searchHistory.value = await getSearchHistory()
    }
    catch (error) {
      console.error('Failed to load search history:', error)
      searchHistory.value = []
    }
    // 加载热搜数据
    if (props.showHotSearch ?? settings.value.showHotSearchInTopBar) {
      try {
        await loadHotSearchData()
      }
      catch (error) {
        console.error('Failed to load hot search list:', error)
      }
    }
  }
})

// 点击外部关闭搜索框
onClickOutside(searchWrapRef, () => {
  isFocus.value = false
})

// 加载热搜数据
async function loadHotSearchData() {
  if (isLoadingHotSearch.value)
    return

  try {
    isLoadingHotSearch.value = true
    const res: HotSearchResponse = await api.search.getHotSearchList({ limit: 10 })
    if (res && res.code === 0) {
      hotSearchList.value = res.data.trending.list.slice(0, 10)
    }
  }
  catch (error) {
    console.error('Failed to load hot search data:', error)
  }
  finally {
    isLoadingHotSearch.value = false
  }
}

// 加载搜索推荐数据
async function loadSearchRecommendation() {
  if (isLoadingSearchRecommendation.value)
    return

  try {
    isLoadingSearchRecommendation.value = true
    const res: SearchRecommendationResponse = await api.search.getDefaultSearchRecommendation()
    if (res && res.code === 0) {
      searchRecommendation.value = res.data
    }
  }
  catch (error) {
    console.error('Failed to load search recommendation:', error)
  }
  finally {
    isLoadingSearchRecommendation.value = false
  }
}

// 定时更新搜索推荐的定时器
let recommendationTimer: ReturnType<typeof setInterval> | null = null

// 初始化搜索推荐（组件挂载时调用）
function initSearchRecommendation() {
  if (!settings.value.showSearchRecommendation)
    return

  // 立即加载一次
  loadSearchRecommendation()

  // 设置10分钟定时更新
  if (recommendationTimer)
    clearInterval(recommendationTimer)

  recommendationTimer = setInterval(() => {
    if (settings.value.showSearchRecommendation) {
      loadSearchRecommendation()
    }
  }, 10 * 60 * 1000) // 10分钟
}

// 清理定时器
function cleanupRecommendationTimer() {
  if (recommendationTimer) {
    clearInterval(recommendationTimer)
    recommendationTimer = null
  }
}

// 监听设置变化，动态启用或停止推荐功能
watch(() => settings.value.showSearchRecommendation, (enabled) => {
  if (enabled) {
    initSearchRecommendation()
  }
  else {
    cleanupRecommendationTimer()
    searchRecommendation.value = null
  }
})

// 组件挂载时初始化
onMounted(() => {
  if (settings.value.showSearchRecommendation) {
    initSearchRecommendation()
  }
})

// 组件卸载时清理定时器
onBeforeUnmount(() => {
  cleanupRecommendationTimer()
})

onKeyStroke('/', (e: KeyboardEvent) => {
  // Reference: https://github.com/polywock/globalSpeed/blob/3705ac836402b324550caf92aa65075b2f2347c6/src/contentScript/ConfigSync.ts#L94
  const target = e.target as HTMLElement
  const ignoreTagNames = ['INPUT', 'TEXTAREA']
  if (target && (ignoreTagNames.includes(target.tagName) || target.isContentEditable))
    return

  const activeElement = findLeafActiveElement(document) as HTMLElement | undefined
  if (activeElement && target !== activeElement) {
    if (ignoreTagNames.includes(activeElement.tagName) || activeElement.isContentEditable)
      return
  }

  e.preventDefault()
  keywordRef.value?.focus()
})
onKeyStroke('Escape', (e: KeyboardEvent) => {
  e.preventDefault()
  keywordRef.value?.blur()
  isFocus.value = false
}, { target: keywordRef })

const handleKeywordInput = useDebounceFn(() => {
  selectedIndex.value = -1
  if (keyword.value.trim().length > 0) {
    api.search.getSearchSuggestion({
      term: keyword.value,
    })
      .then((res: SuggestionResponse) => {
        if (!res || (res && res.code !== 0))
          return
        Object.assign(suggestions, res.result.tag)
      })
  }
  else {
    suggestions.length = 0
  }
}, 200)

function handleNativeInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  keyword.value = value
  handleKeywordInput()
}

function buildKeywordHref(keyword: string) {
  const encoded = encodeURIComponent(keyword)
  if (settings.value.usePluginSearchResultsPage) {
    // 写死插件搜索页面 URL
    return `https://www.bilibili.com/?page=Search&keyword=${encoded}`
  }
  // 写死B站原版搜索页面 URL
  return `https://search.bilibili.com/all?keyword=${encoded}`
}

// 从URL中提取搜索关键词
function extractKeywordFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.searchParams.get('keyword') || ''
  }
  catch {
    return ''
  }
}

async function navigateToSearchResultPage(rawKeyword: string) {
  let normalized = (rawKeyword || keyword.value).trim()

  // 如果输入为空且启用了搜索推荐，使用推荐的搜索词
  if (!normalized && settings.value.showSearchRecommendation && searchRecommendation.value) {
    normalized = extractKeywordFromUrl(searchRecommendation.value.url)
  }

  if (!normalized)
    return

  const searchItem = {
    value: normalized,
    timestamp: Number(new Date()),
  }
  try {
    searchHistory.value = await addSearchHistory(searchItem)
  }
  catch (error) {
    console.error('Failed to add search history:', error)
  }

  // 如果是就地搜索模式，则 emit 事件（这是组件级别的行为设置）
  if (isInPlaceSearch.value) {
    emit('search', normalized)
    isFocus.value = false
    return
  }

  // 如果在搜索页且启用了插件搜索，则在当前页加载
  if (shouldHandleInCurrentPage.value) {
    emit('search', normalized)
    isFocus.value = false
    return
  }

  // 不在搜索页时，遵循顶栏链接行为设置
  const searchUrl = buildKeywordHref(normalized)

  if (settings.value.searchBarLinkOpenMode === 'background') {
    // 使用后台标签页打开
    void openLinkInBackground(searchUrl)
  }
  else {
    // 使用 window.open 打开
    let target = '_blank'
    if (settings.value.searchBarLinkOpenMode === 'currentTabIfNotHomepage')
      target = isHomePage() ? '_blank' : '_self'
    else if (settings.value.searchBarLinkOpenMode === 'currentTab')
      target = '_self'
    else if (settings.value.searchBarLinkOpenMode === 'newTab')
      target = '_blank'

    window.open(searchUrl, target)
  }
}

function handleKeywordLinkClick(value: string, event: MouseEvent) {
  // 始终阻止默认行为，使用 navigateToSearchResultPage 来处理所有情况
  event.preventDefault()
  event.stopPropagation()
  void navigateToSearchResultPage(value)
}

async function handleDelete(value: string) {
  searchHistory.value = await removeSearchHistory(value)
}

function handleKeyUp(e: KeyboardEvent) {
  // Skip the key event triggered by IME
  if (e.isComposing)
    return

  if (selectedIndex.value <= 0) {
    selectedIndex.value = 0
    return
  }

  selectedIndex.value--

  if (isFocus.value && suggestions.length !== 0)
    keyword.value = suggestions[selectedIndex.value].value
  else if (isFocus.value && searchHistory.value.length !== 0)
    keyword.value = searchHistory.value[selectedIndex.value].value

  suggestionItemRef.value.forEach((item, index) => {
    if (index === selectedIndex.value)
      item.classList.add('active')
    else item.classList.remove('active')
  })

  historyItemRef.value.forEach((item, index) => {
    if (index === selectedIndex.value)
      item.classList.add('active')
    else item.classList.remove('active')
  })
}

function handleKeyDown(e: KeyboardEvent) {
  // Skip the key event triggered by IME
  if (e.isComposing)
    return

  let isShowSuggestion = false
  if (isFocus.value && suggestions.length !== 0)
    isShowSuggestion = true
  else if (isFocus.value && !keyword.value && searchHistory.value.length !== 0)
    isShowSuggestion = false

  if (
    isShowSuggestion
    && selectedIndex.value >= suggestions.length - 1
  ) {
    selectedIndex.value = suggestions.length - 1
    return
  }
  if (
    !isShowSuggestion
    && selectedIndex.value >= searchHistory.value.length - 1
  ) {
    selectedIndex.value = searchHistory.value.length - 1
    return
  }

  selectedIndex.value++
  keyword.value = isShowSuggestion
    ? suggestions[selectedIndex.value].value
    : searchHistory.value[selectedIndex.value].value

  suggestionItemRef.value.forEach((item, index) => {
    if (index === selectedIndex.value)
      item.classList.add('active')
    else item.classList.remove('active')
  })

  historyItemRef.value.forEach((item, index) => {
    if (index === selectedIndex.value)
      item.classList.add('active')
    else item.classList.remove('active')
  })
}

function handleKeyEnter(e: KeyboardEvent) {
  if (!e.shiftKey && e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    navigateToSearchResultPage(keyword.value)
  }
}

async function handleClearSearchHistory() {
  await clearAllSearchHistory()
  searchHistory.value = []
}

function handleFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget as HTMLElement | null
  if (nextTarget && searchWrapRef.value?.contains(nextTarget))
    return

  isFocus.value = false
}
</script>

<template>
  <div
    id="search-wrap"
    ref="searchWrapRef"
    w="full"
    max-w="550px"
    h-46px
    pos="relative"
    @focusout="handleFocusOut"
  >
    <div
      v-if="!darkenOnFocus && isFocus"
      pos="fixed top-0 left-0"
      w="full"
      h="full"
      content="~"
      @click="isFocus = false"
    />
    <Transition name="mask">
      <div
        v-if="darkenOnFocus && isFocus" pos="fixed top-0 left-0" w-full h-full bg="black opacity-60"
        @click="isFocus = false"
      />
    </Transition>

    <div
      v-if="blurredOnFocus"
      pos="fixed top-0 left-0" w-full h-full duration-500 pointer-events-none
      ease-out transform-gpu
      :style="{ backdropFilter: isFocus ? 'blur(15px)' : 'blur(0)' }"
    />

    <div
      class="search-bar group"
      :class="isFocus ? 'focus' : ''"
      flex="~ items-center" pos="relative"
      h-inherit
    >
      <Transition name="focus-character">
        <img
          v-show="focusedCharacter && isFocus" :src="focusedCharacter"
          width="100" object-contain pos="absolute right-0 bottom-40px"
        >
      </Transition>

      <input
        ref="keywordRef"
        :value="keyword"
        :placeholder="placeholderText"
        class="group"
        rounded="60px"
        p="l-6 r-18 y-3"
        h-inherit
        text="$b-search-bar-normal-text-color group-focus-within:$b-search-bar-focus-text-color group-hover:$b-search-bar-hover-text-color"
        un-border="1 solid $bew-border-color"
        transition="all duration-300"
        type="text"
        @focus="isFocus = true"
        @input="handleNativeInput"
        @keydown.enter.stop="handleKeyEnter"
        @keyup.up.stop.passive="handleKeyUp"
        @keyup.down.stop.passive="handleKeyDown"
        @keydown.stop="() => {}"
      >
      <button
        v-if="isFocus && keyword"
        pos="absolute right-12" bg="$bew-fill-1 hover:$bew-fill-2" text="xs" rounded-10
        p-1
        flex="~ items-center justify-between"
        @click="keyword = ''"
      >
        <div i-ic-baseline-clear shrink-0 />
      </button>

      <button
        p-2
        rounded-full
        text="lg leading-0 $b-search-bar-normal-icon-color group-hover:$b-search-bar-hover-icon-color group-focus-within:$b-search-bar-focus-icon-color"
        transition="all duration-300"
        border-none
        outline-none
        pos="absolute right-6px"
        bg="hover:$bew-fill-2"
        filter="group-focus-within:~"
        style="--un-drop-shadow: drop-shadow(0 0 6px var(--bew-theme-color))"
        @click="navigateToSearchResultPage(keyword)"
      >
        <div i-tabler:search block align-middle />
      </button>
    </div>

    <Transition name="result-list">
      <div
        v-if="
          isFocus
            && keyword.length === 0
            && (searchHistory.length !== 0 || ((showHotSearch ?? settings.showHotSearchInTopBar) && hotSearchList.length > 0))
        "
        id="search-dropdown"
      >
        <!-- 热搜区块 -->
        <div
          v-if="(showHotSearch ?? settings.showHotSearchInTopBar) && hotSearchList.length > 0"
          class="hot-search-section"
        >
          <div class="title p-2 pb-0">
            <span>{{ $t('search_bar.hot_search_title') || '热搜' }}</span>
          </div>

          <div class="hot-search-container p-2 grid grid-cols-2 gap-x-4 gap-y-1">
            <ALink
              v-for="(item, index) in hotSearchList.slice(0, 10)" :key="item.keyword"
              :href="buildKeywordHref(item.keyword)"
              type="searchBar"
              :custom-click-event="true"
              class="hot-search-item cursor-pointer duration-300"
              flex items-center gap-2 p="x-2 y-1" hover="text-$bew-theme-color"
              @click="handleKeywordLinkClick(item.keyword, $event)"
            >
              <span
                class="index"
                :class="{
                  'top-1': index === 0,
                  'top-2': index === 1,
                  'top-3': index === 2,
                  'normal': index > 2,
                }"
              >
                {{ index + 1 }}
              </span>
              <span class="keyword" text="base $bew-text-1" truncate flex-1>{{ item.show_name }}</span>
              <img
                v-if="item.icon && !item.icon.includes('.gif')"
                :src="item.icon"
                class="hot-search-icon"
                w-4 h-4 object-contain
                alt=""
              >
            </ALink>
          </div>
        </div>

        <!-- 分割线 -->
        <div
          v-if="(showHotSearch ?? settings.showHotSearchInTopBar) && hotSearchList.length > 0 && searchHistory.length > 0"
          class="divider"
          mx-2 my-1 h-px bg="$bew-border-color"
        />

        <!-- 搜索历史区块 -->
        <div
          v-if="searchHistory.length !== 0"
          class="history-section"
        >
          <div class="title p-2 pb-0 flex justify-between">
            <span>{{ $t('search_bar.history_title') }}</span>
            <button class="rounded-2 duration-300 pointer-events-auto cursor-pointer" hover="text-$bew-theme-color" text="base $bew-text-2" @click="handleClearSearchHistory">
              {{ $t('search_bar.clear_history') }}
            </button>
          </div>

          <div class="history-item-container p2 flex flex-wrap gap-x-3 gap-y-3">
            <ALink
              v-for="item in searchHistory" :key="item.timestamp" ref="historyItemRef"
              :href="buildKeywordHref(item.value)"
              type="searchBar"
              :custom-click-event="true"
              class="history-item group"
              flex justify-between items-center
              @click="handleKeywordLinkClick(item.value, $event)"
            >
              <span> {{ item.value }}</span>
              <button
                rounded-full duration-300 pointer-events-auto cursor-pointer p-1
                text="xs $bew-text-2 hover:white" leading-0 bg="$bew-fill-2 hover:$bew-theme-color"
                pos="absolute top-0 right-0" scale-80 opacity-0 group-hover:opacity-100
                @click.stop.prevent="handleDelete(item.value)"
              >
                <div i-ic-baseline-clear />
              </button>
            </ALink>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="result-list">
      <div
        v-if="isFocus && suggestions.length !== 0 && keyword.length > 0"
        id="search-suggestion"
      >
        <div
          v-for="(item, index) in suggestions"
          :key="index"
          ref="suggestionItemRef"
          class="suggestion-item"
          @click="navigateToSearchResultPage(item.value)"
        >
          <span v-html="DOMPurify.sanitize(item.name)" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
::v-deep(.suggest_high_light) {
  --uno: "text-$bew-theme-color not-italic";
}

.result-list-enter-active,
.result-list-leave-active {
  --uno: "transition-all duration-300 ease-in-out";
}

.result-list-enter-from,
.result-list-leave-to {
  --uno: "transform translate-y-4 opacity-0 scale-95";
}

.focus-character-enter-active,
.focus-character-leave-active {
  --uno: "transition-all duration-300 ease-in-out";
}

.focus-character-enter-from,
.focus-character-leave-to {
  --uno: "transform translate-y-6 opacity-0";
}

.mask-enter-active,
.mask-leave-active {
  --uno: "transition-all duration-300 ease-in-out";
}

.mask-enter-from,
.mask-leave-to {
  --uno: "opacity-0";
}

.mask-enter-to,
.mask-leave-from {
  --uno: "opacity-100";
}

#search-wrap {
  --b-search-bar-normal-color: var(--bew-content);
  --b-search-bar-hover-color: var(--bew-content-hover);
  --b-search-bar-focus-color: var(--bew-content-hover);

  --b-search-bar-normal-icon-color: var(--bew-text-1);
  --b-search-bar-hover-icon-color: var(--bew-theme-color);
  --b-search-bar-focus-icon-color: var(--bew-theme-color);

  --b-search-bar-normal-text-color: var(--bew-text-1);
  --b-search-bar-hover-text-color: var(--bew-text-1);
  --b-search-bar-focus-text-color: var(--bew-text-1);

  @mixin card-content {
    --uno: "text-base outline-none w-full bg-$b-search-bar-normal-color transform-gpu border-1 border-$bew-border-color";
    --uno: "shadow-[var(--bew-shadow-2),var(--bew-shadow-edge-glow-1)]";
    backdrop-filter: var(--bew-filter-glass-1);
  }

  .search-bar {
    input {
      @include card-content;

      &:hover {
        --uno: "bg-$b-search-bar-hover-color";
      }

      &:focus {
        --uno: "bg-$b-search-bar-focus-color";
      }
    }

    &.focus input {
      --uno: "border-$bew-theme-color rounded-$bew-radius";
      box-shadow:
        0 0 0 2px var(--bew-theme-color),
        0 6px 16px var(--bew-theme-color-40),
        inset 0 0 6px var(--bew-theme-color-30);
    }
  }

  @mixin search-content {
    @include card-content;
    --uno: "p-2 mt-2 absolute rounded-$bew-radius hover:block";
  }

  @mixin search-content-item {
    --uno: "px-4 py-2 w-full rounded-$bew-radius duration-300 cursor-pointer not-first:mt-1 tracking-wider hover:bg-$bew-fill-2";
  }

  #search-dropdown {
    @include search-content;
    --uno: "bg-$bew-elevated";
    --uno: "max-h-420px important-overflow-y-auto";
    z-index: 1000;

    .title {
      --uno: "text-lg font-500";
    }

    .hot-search-section {
      .hot-search-container {
        .hot-search-item {
          --uno: "relative cursor-pointer duration-300";
          --uno: "hover:text-$bew-theme-color";

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

          .index {
            --uno: "text-xs min-w-4 text-center font-bold";

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

          .keyword {
            --uno: "text-base truncate flex-1";
          }
        }
      }
    }

    .divider {
      --uno: "mx-2 my-1 h-px bg-$bew-border-color";
    }

    .history-section {
      .history-item-container {
        .history-item {
          --uno: "relative cursor-pointer duration-300";
          --uno: "py-2 px-6 bg-$bew-fill-1 hover:bg-$bew-theme-color-20 hover:text-$bew-theme-color rounded-$bew-radius-half";
        }
      }
    }
  }

  #search-suggestion {
    @include search-content;
    --uno: "bg-$bew-elevated";
    --uno: "max-h-420px important-overflow-y-auto";
    z-index: 1000;

    .suggestion-item {
      @include search-content-item;

      &.active {
        --uno: "bg-$bew-fill-2 shadow-[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]";
      }
    }
  }
}
</style>
