<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

// 旧版应用内设置浮层外壳（ef52b142 之前的形态），由 enableSettingsOverlay 开关启用。
// 与独立设置页（Settings.vue）并存，菜单与二级页统一来自 settingsMenus.ts，新增设置页无需改动本文件。
import type { SettingsNavigationTarget } from '~/composables/useAppProvider'
import { useBewlyApp } from '~/composables/useAppProvider'
import { USAGE_GUIDE_URL } from '~/constants/usageGuide'
import { settings } from '~/logic'
import { createTransformer } from '~/utils/transformer'

import SettingsCategoryLayout from './components/SettingsCategoryLayout.vue'
import { createPinnedChannelHistory, pinnedChannelHistoryKey } from './composables/usePinnedChannelHistory'
import type { SettingsSearchEntry } from './searchCatalog'
import { isSettingsSearchEntryVisible, settingsSearchEntries } from './searchCatalog'
import { settingsMenus } from './settingsMenus'
import type { MenuItem } from './types'
import { MenuType } from './types'

const props = defineProps<{
  pendingNavigation?: SettingsNavigationTarget
}>()

const emit = defineEmits<{
  close: []
  'update:pendingNavigation': [value: SettingsNavigationTarget | undefined]
}>()

const pinnedChannelHistory = createPinnedChannelHistory(computed({
  get: () => settings.value.topBarPinnedChannels,
  set: keys => settings.value.topBarPinnedChannels = keys,
}))
provide(pinnedChannelHistoryKey, pinnedChannelHistory)
// Settings is cached by KeepAlive; closing it does not dispose its scope.
const overlayActive = ref(true)
onDeactivated(() => {
  overlayActive.value = false
  pinnedChannelHistory.reset()
})
onActivated(() => {
  overlayActive.value = true
  pinnedChannelHistory.reset()
})

const { t, tm, rt } = useI18n()
const breadcrumbDetail = ref<string>()
const searchQuery = ref('')
const settingsContentKey = ref(0)
const settingsContentReady = ref(false)
let settingsContentFrame: number | undefined

onMounted(() => {
  // 先让设置外壳完成首帧绘制，再挂载异步设置页，避免点击反馈被重组件初始化阻塞。
  settingsContentFrame = requestAnimationFrame(() => {
    settingsContentFrame = requestAnimationFrame(() => {
      settingsContentFrame = undefined
      settingsContentReady.value = true
    })
  })
})

provide('setSettingsBreadcrumb', (detail?: string) => {
  breadcrumbDetail.value = detail
})

// 与独立设置页共用同一 sessionStorage 键；旧版菜单值已由迁移提交清理，无需别名映射。
const settingsMenuStorageKey = 'bewly-settings-active-menu'
const storedMenuItem = sessionStorage.getItem(settingsMenuStorageKey)
const activatedMenuItem = ref<MenuType>(
  storedMenuItem && settingsMenus.some(menu => menu.value === storedMenuItem)
    ? storedMenuItem as MenuType
    : MenuType.General,
)
const settingsWindow = ref<HTMLDivElement>()
const settingsSearchRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()
const searchPopoverStyle = ref<CSSProperties>({})
const isSearchFocused = ref(false)
const { mainAppRef } = useBewlyApp()

function handleSearchBlur() {
  isSearchFocused.value = false
}

function handleSearchFocus() {
  isSearchFocused.value = true
}

function updateSearchPopoverBounds() {
  const searchElement = settingsSearchRef.value
  const contentElement = searchElement?.closest<HTMLElement>('.settings-content')
  if (!searchElement || !contentElement)
    return

  const searchRect = searchElement.getBoundingClientRect()
  const contentRect = contentElement.getBoundingClientRect()
  const edgeInset = 8
  const popoverGap = 10
  const narrowLayout = window.innerWidth <= 760
  const bottomEdge = Math.min(window.innerHeight - edgeInset, contentRect.bottom - edgeInset)

  // Fixed positioning so the popover can be teleported out of the settings
  // window (which has its own backdrop-filter that would swallow ours).
  searchPopoverStyle.value = {
    position: 'fixed',
    top: `${searchRect.bottom + popoverGap}px`,
    right: narrowLayout ? 'auto' : `${window.innerWidth - searchRect.right}px`,
    left: narrowLayout ? `${contentRect.left + edgeInset}px` : 'auto',
    width: narrowLayout ? `${Math.max(0, contentRect.width - edgeInset * 2)}px` : `${searchRect.width}px`,
    maxHeight: `${Math.max(0, bottomEdge - searchRect.bottom - popoverGap)}px`,
  }
}

function focusSettingsSearch(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('.settings-search-results'))
    return

  searchInputRef.value?.focus({ preventScroll: true })
  nextTick(updateSearchPopoverBounds)
}

useEventListener(window, 'resize', () => {
  createTransformer(settingsWindow, {
    x: '50%',
    y: '50%',
    notrigger: true,
    centerTarget: {
      x: true,
      y: true,
    },
  })
  nextTick(updateSearchPopoverBounds)
})

const scrollViewportRef = ref<HTMLElement>()

// 滚动时关闭搜索弹窗（保留搜索词）
useEventListener(() => scrollViewportRef.value, 'scroll', () => {
  if (isSearchFocused.value) {
    isSearchFocused.value = false
    searchInputRef.value?.blur()
  }
}, { capture: true })

provide('scrollSettingsContentToTop', () => {
  cancelSearchNavigation()
  scrollViewportRef.value?.scrollTo({ top: 0 })
})

watch(
  () => activatedMenuItem.value,
  (menuItem) => {
    breadcrumbDetail.value = undefined
    sessionStorage.setItem(settingsMenuStorageKey, menuItem)
    scrollViewportRef.value?.scrollTo({ top: 0 })
  },
)

// 与独立设置页共用 settingsMenus.ts 数据源；浮层以胶囊主导航 + 分类内二级导航呈现。
// 依赖的模块关闭后菜单隐藏，二级页全部隐藏时整个分类一并隐藏，与独立页行为一致。
const availableMenus = computed(() => settingsMenus.filter(menu => (menu.available?.() ?? true)
  && (!menu.pages || menu.pages.some(page => page.available?.() ?? true))))

const settingsMenuItems = computed<MenuItem[]>(() =>
  availableMenus.value.map(menu => ({
    value: menu.value,
    icon: menu.icon,
    iconActivated: menu.iconActivated,
    titleKey: menu.titleKey,
    sectionStart: menu.sectionStart,
  })),
)

// 当前菜单被隐藏时回到通用页，用户可以在那里重新开启对应模块。
const activeMenuDef = computed(() => availableMenus.value.find(menu => menu.value === activatedMenuItem.value)
  ?? availableMenus.value.find(menu => menu.value === MenuType.General)!)
const visibleSecondaryPages = computed(() => activeMenuDef.value.pages?.filter(page => page.available?.() ?? true) ?? [])

const title = computed(() => t(activeMenuDef.value.titleKey))

function getSearchEntryTitle(entry: SettingsSearchEntry) {
  return entry.titleKey ? t(entry.titleKey) : entry.title ?? ''
}

function getSearchEntryLocation(entry: SettingsSearchEntry) {
  const primaryTitle = getMenuTitle(entry.menu)
  const pageLocation = entry.secondaryTitleKey
    ? `${primaryTitle} / ${t(entry.secondaryTitleKey)}`
    : primaryTitle
  return entry.contextTitleKey
    ? `${t(entry.contextTitleKey)} · ${pageLocation}`
    : pageLocation
}

function getTranslatedSearchTerms(key: string): string[] {
  const collectTerms = (message: unknown): string[] => {
    if (typeof message === 'string' || typeof message === 'function')
      return [rt(message as Parameters<typeof rt>[0])]
    if (Array.isArray(message))
      return message.flatMap(collectTerms)
    if (message && typeof message === 'object')
      return Object.values(message).flatMap(collectTerms)
    return []
  }

  return collectTerms(tm(key))
}

function getSearchEntryKeywordText(entry: SettingsSearchEntry) {
  const inferredKeywordKeys = entry.titleKey
    ? [`${entry.titleKey}_desc`, `${entry.titleKey}_opt`, `${entry.titleKey}_option`, `${entry.titleKey}_unit`]
    : []
  const translatedKeywords = [...inferredKeywordKeys, ...(entry.keywordKeys ?? [])]
    .flatMap(getTranslatedSearchTerms)

  // 菜单路径只用于结果定位，避免输入分类名时命中整组设置。
  return [...translatedKeywords, ...(entry.keywords ?? [])].join(' ').toLocaleLowerCase()
}

interface SearchIndexEntry {
  entry: SettingsSearchEntry
  titleText: string
  keywordText: string
  text: string
  order: number
}

// 搜索文本只随 locale/目录变化重算，输入时复用，避免每次击键重复翻译全部条目。
const searchIndex = computed<SearchIndexEntry[]>(() => settingsSearchEntries.filter(isSettingsSearchEntryVisible).map((entry, order) => {
  const titleText = getSearchEntryTitle(entry).toLocaleLowerCase()
  const keywordText = getSearchEntryKeywordText(entry)
  return {
    entry,
    titleText,
    keywordText,
    text: `${titleText} ${keywordText}`,
    order,
  }
}))

function getSearchMatchScore(item: SearchIndexEntry, query: string, queryParts: string[]) {
  let score = 0
  if (item.titleText === query)
    score += 200
  else if (item.titleText.includes(query))
    score += 40

  for (const part of queryParts) {
    if (item.titleText === part)
      score += 120
    else if (item.titleText.startsWith(part))
      score += 80
    else if (item.titleText.includes(part))
      score += 50
    else if (item.keywordText.startsWith(part))
      score += 20
    else
      score += 10
  }

  return score
}

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query)
    return []

  const queryParts = query.split(/\s+/).filter(Boolean)
  const matches = searchIndex.value
    .filter(item => queryParts.every(part => item.text.includes(part)))
    .map(item => ({ item, score: getSearchMatchScore(item, query, queryParts) }))

  // 标题精确/前缀命中优先于标题包含，再到关键词命中；同分保持目录顺序。
  matches.sort((a, b) => b.score - a.score || a.item.order - b.item.order)
  return matches.map(({ item }) => item.entry)
})

const activeSearchResultIndex = ref(-1)
const searchResultsRef = ref<HTMLElement>()

watch(searchQuery, (query) => {
  activeSearchResultIndex.value = -1
  if (query)
    nextTick(updateSearchPopoverBounds)
})

function moveSearchResultSelection(event: KeyboardEvent, direction: 1 | -1) {
  if (event.isComposing)
    return

  const resultCount = searchResults.value.length
  if (!resultCount)
    return

  event.preventDefault()
  if (activeSearchResultIndex.value < 0)
    activeSearchResultIndex.value = direction > 0 ? 0 : resultCount - 1
  else
    activeSearchResultIndex.value = (activeSearchResultIndex.value + direction + resultCount) % resultCount

  // 键盘导航时让选中项滚动到可视区内
  nextTick(() => {
    searchResultsRef.value?.children[activeSearchResultIndex.value]?.scrollIntoView({ block: 'nearest' })
  })
}

function activateSearchResult(event: KeyboardEvent) {
  if (event.isComposing)
    return

  const entry = searchResults.value[activeSearchResultIndex.value] ?? searchResults.value[0]
  if (entry) {
    event.preventDefault()
    navigateToSearchResult(entry)
  }
}

function getMenuTitle(menu: MenuType) {
  const menuItem = settingsMenuItems.value.find(item => item.value === menu)
  return menuItem ? t(menuItem.titleKey) : t('settings.title')
}

let highlightedSearchTarget: HTMLElement | undefined
let searchTargetHighlightTimer: number | undefined
let searchNavigationId = 0
let searchTargetRetryTimer: number | undefined
let searchTargetFrame: number | undefined

function cancelSearchNavigation() {
  searchNavigationId++
  if (searchTargetRetryTimer !== undefined)
    window.clearTimeout(searchTargetRetryTimer)
  if (searchTargetFrame !== undefined)
    window.cancelAnimationFrame(searchTargetFrame)
  searchTargetRetryTimer = undefined
  searchTargetFrame = undefined
  clearSearchTargetHighlight()
}

function clearSearchTargetHighlight() {
  if (searchTargetHighlightTimer)
    window.clearTimeout(searchTargetHighlightTimer)

  highlightedSearchTarget?.classList.remove('settings-search-target')
  highlightedSearchTarget?.removeAttribute('data-settings-search-highlight')
  highlightedSearchTarget = undefined
  searchTargetHighlightTimer = undefined
}

function highlightSearchTarget(target: HTMLElement) {
  clearSearchTargetHighlight()
  const visualTarget = target.matches('.b-settings-item-group')
    ? target.querySelector<HTMLElement>(':scope > .group-title') ?? target
    : target

  highlightedSearchTarget = visualTarget
  visualTarget.dataset.settingsSearchHighlight = t('settings.search.located')
  visualTarget.classList.add('settings-search-target')
  searchTargetHighlightTimer = window.setTimeout(clearSearchTargetHighlight, 2400)
}

function isVisibleTarget(element: HTMLElement) {
  return element.getClientRects().length > 0
}

function hasClosedDetailsAncestor(element: HTMLElement, viewport: HTMLElement) {
  let ancestor = element.parentElement
  while (ancestor && ancestor !== viewport) {
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open)
      return true
    ancestor = ancestor.parentElement
  }
  return false
}

function isUsableTarget(element: HTMLElement | null, viewport: HTMLElement): element is HTMLElement {
  return Boolean(element && (isVisibleTarget(element) || hasClosedDetailsAncestor(element, viewport)))
}

function scrollToSearchTarget(
  targetKey: string | undefined,
  expectedTitle: string | undefined,
  fallbackTargetKey: string | undefined,
  navigationId: number,
  attempts = 0,
) {
  if ((!targetKey && !expectedTitle) || navigationId !== searchNavigationId || attempts > 30)
    return

  const retry = () => {
    searchTargetRetryTimer = window.setTimeout(() => {
      searchTargetRetryTimer = undefined
      scrollToSearchTarget(targetKey, expectedTitle, fallbackTargetKey, navigationId, attempts + 1)
    }, 100)
  }
  const viewport = scrollViewportRef.value
  // 异步页面挂载及离场节点都会影响布局，等待过渡结束后再测量。
  if (!viewport || viewport.querySelector('.page-fade-enter-active, .page-fade-leave-active')) {
    retry()
    return
  }

  const queryByKey = (key: string) => Array.from(
    viewport.querySelectorAll<HTMLElement>(`[data-settings-key="${CSS.escape(key)}"]`),
  ).find(element => isUsableTarget(element, viewport)) ?? null
  const queryByTitle = (title: string | undefined) => title
    ? Array.from(viewport.querySelectorAll<HTMLElement>('[data-settings-title]'))
      .find(element => element.dataset.settingsTitle === title && isUsableTarget(element, viewport)) ?? null
    : null

  const keyedTarget = targetKey ? queryByKey(targetKey) : null
  const titleTarget = expectedTitle ? queryByTitle(expectedTitle) : null
  // 条件目标可能不存在；给它两轮挂载时间后落到始终可见的父项。
  const fallbackTarget = fallbackTargetKey && attempts >= 2
    ? queryByKey(fallbackTargetKey) ?? queryByTitle(t(fallbackTargetKey))
    : null
  // 未配置父项时至少把用户带到当前页面，避免点击完全无反馈。
  const pageTarget = attempts >= 10
    ? Array.from(viewport.querySelectorAll<HTMLElement>('[data-settings-title]')).find(isVisibleTarget) ?? null
    : null
  const target = keyedTarget ?? titleTarget ?? fallbackTarget ?? pageTarget
  const usedPageFallback = !keyedTarget && !titleTarget && !fallbackTarget && Boolean(pageTarget)
  if (!target) {
    retry()
    return
  }

  // 展开所有祖先分组，但不启用功能或改写配置。
  let ancestor: HTMLElement | null = target
  while (ancestor && ancestor !== viewport) {
    if (ancestor instanceof HTMLDetailsElement)
      ancestor.open = true
    ancestor = ancestor.parentElement
  }

  nextTick(() => {
    if (navigationId !== searchNavigationId)
      return
    searchTargetFrame = window.requestAnimationFrame(() => {
      searchTargetFrame = undefined
      if (navigationId !== searchNavigationId || !viewport.contains(target))
        return
      if (viewport.querySelector('.page-fade-enter-active, .page-fade-leave-active')) {
        retry()
        return
      }
      if (!target.getClientRects().length) {
        retry()
        return
      }

      const targetRect = target.getBoundingClientRect()
      const viewportRect = viewport.getBoundingClientRect()
      const headerInset = Number.parseFloat(window.getComputedStyle(viewport).paddingTop) || 0
      const centerOffset = Math.max(0, (viewport.clientHeight - headerInset - targetRect.height) / 2)
      // 只滚动设置容器，避免 scrollIntoView 连带滚动外层页面；避开固定顶栏。
      viewport.scrollTo({
        top: Math.max(0, viewport.scrollTop + targetRect.top - viewportRect.top - viewport.clientTop - headerInset - centerOffset),
        behavior: 'smooth',
      })
      // 页面级兜底只负责把用户带到正确页面，避免把“已定位”标注到无关设置上。
      if (!usedPageFallback)
        highlightSearchTarget(target)
    })
  })
}

function navigateToSearchResult(entry: SettingsSearchEntry) {
  cancelSearchNavigation()
  const navigationId = searchNavigationId
  // 页面存储值未变化时保持现有页面实例，避免无意义的整页重挂载。
  const shouldReloadContent = entry.storageValues?.some(({ key, value }) => sessionStorage.getItem(key) !== value) ?? false
  entry.storageValues?.forEach(({ key, value }) => sessionStorage.setItem(key, value))

  activatedMenuItem.value = entry.menu
  if (shouldReloadContent)
    settingsContentKey.value++
  // 结果按钮以 mousedown.prevent 保住浮层，点击后由这里收起并归还焦点。
  searchQuery.value = ''
  searchInputRef.value?.blur()
  const targetTitle = entry.targetTitleKey
    ? t(entry.targetTitleKey)
    : entry.targetTitle ?? getSearchEntryTitle(entry)
  const targetKey = entry.targetTitleKey ?? entry.titleKey
  nextTick(() => scrollToSearchTarget(targetKey, targetTitle, entry.fallbackTargetKey, navigationId))
}

watch(() => props.pendingNavigation, (request) => {
  if (!request)
    return

  // 二级页定位键直接取自 settingsMenus 的 storageKey，避免另建菜单映射表。
  const secondaryStorageKey = settingsMenus.find(menu => menu.value === request.menu)?.storageKey
  navigateToSearchResult({
    menu: request.menu as MenuType,
    targetTitleKey: request.targetTitleKey,
    storageValues: request.secondaryPage && secondaryStorageKey
      ? [{ key: secondaryStorageKey, value: request.secondaryPage }]
      : undefined,
  })
  emit('update:pendingNavigation', undefined)
}, { immediate: true })

onBeforeUnmount(() => {
  if (settingsContentFrame !== undefined)
    cancelAnimationFrame(settingsContentFrame)
  cancelSearchNavigation()
})

function handleClose() {
  emit('close')
}

// KeepAlive 关闭后组件仍保持挂载，仅在浮层激活时响应 ESC。
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (overlayActive.value && e.key === 'Escape')
    handleClose()
})

function changeMenuItem(menuItem: MenuType) {
  cancelSearchNavigation()
  activatedMenuItem.value = menuItem
}
</script>

<template>
  <div class="fixed w-full h-full top-0 left-0" data-layout-edit-control>
    <div
      class="fixed w-full h-full top-0 left-0"
      @click="handleClose"
    />
    <div
      id="settings-window"
      ref="settingsWindow"
      pos="fixed top-1/2 left-1/2" w="90%" h="90%"
      max-w-1000px max-h-900px transform="~ translate-x--1/2 translate-y--1/2 gpu"
      flex="~ justify-between items-center"
    >
      <aside
        class="settings-primary-navigation group"
        shrink-0 p="x-4"
        pos="absolute xl:left--84px left--44px" z-2
      >
        <ul
          class="settings-primary-navigation__list"
          style="
            box-shadow: var(--bew-shadow-4);
          "
          relative
          bg="$bew-content-alt group-hover:$bew-elevated dark:$bew-elevated dark-group-hover:$bew-elevated"
          overflow-hidden antialiased
        >
          <!-- frosted glass background -->
          <!-- https://github.com/BewlyBewly/BewlyBewly/issues/1162 -->
          <div
            class="settings-primary-navigation__surface"
            :style="{
              boxShadow: 'var(--bew-shadow-edge-glow-2)',
              // 对齐 1.6.9：侧栏固定用 dialog 级 glass-2
              backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-2)' : 'none',
            }"
            z--1 pointer-events-none rounded-inherit
          />

          <li
            v-for="menuItem in settingsMenuItems"
            :key="menuItem.value"
            :class="{ 'menu-section-start': menuItem.sectionStart }"
          >
            <button
              type="button"
              class="settings-primary-navigation__item"
              cursor-pointer
              :class="{ 'menu-item-activated': menuItem.value === activatedMenuItem }"
              :aria-current="menuItem.value === activatedMenuItem ? 'page' : undefined"
              @click="changeMenuItem(menuItem.value)"
            >
              <div
                v-show="menuItem.value !== activatedMenuItem"
                text="xl center" w-40px h-20px flex="~ shrink-0" justify-center
                :class="menuItem.icon"
              />
              <div
                v-show="menuItem.value === activatedMenuItem"
                text="xl center" w-40px h-20px flex="~ shrink-0" justify-center
                :class="menuItem.iconActivated"
              />
              <div flex="~ items-center gap-2" shrink-0>
                <span>{{ $t(menuItem.titleKey) }}</span>
              </div>
            </button>
          </li>
        </ul>
      </aside>

      <div
        class="settings-content"
        :style="{
          '--un-shadow': 'var(--bew-shadow-4), var(--bew-shadow-edge-glow-2)',
          'backdropFilter': settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
        }"
        relative overflow-hidden flex-1 min-w-0
        h-full
        bg="$bew-elevated-alt"
        shadow rounded="$bew-modal-radius" border="1 $bew-border-color"
      >
        <header
          class="settings-header"
          flex justify-between items-center w-full h-92px
          pos="absolute top-0 left-0" p="x-11" box-border gap-4
          z-1 rounded="t-$bew-modal-radius"
          style="
            text-shadow: 0 0 10px var(--bew-elevated-solid), 0 0 15px var(--bew-elevated-solid)
          "
        >
          <!-- Mask -->
          <div
            pos="absolute top-0 left-0" w-inherit h-inherit pointer-events-none
            :style="{
              maskImage: settings.enableFrostedGlass
                ? 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
                : 'none',
              WebkitMaskImage: settings.enableFrostedGlass
                ? 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)'
                : 'none',
              backgroundColor: settings.enableFrostedGlass ? 'transparent' : 'var(--bew-elevated-alt-solid)',
              backdropFilter: settings.enableFrostedGlass ? 'blur(3px) saturate(180%)' : 'none',
              WebkitBackdropFilter: settings.enableFrostedGlass ? 'blur(3px) saturate(180%)' : 'none',
            }"
            z--1 rounded-inherit
          />
          <nav class="settings-breadcrumb" :aria-label="$t('settings.breadcrumb')">
            <span>{{ $t('settings.title') }}</span>
            <i i-mingcute:right-line />
            <strong>{{ title }}</strong>
            <template v-if="breadcrumbDetail">
              <i i-mingcute:right-line />
              <strong>{{ breadcrumbDetail }}</strong>
            </template>
          </nav>
          <div
            ref="settingsSearchRef"
            class="settings-search"
            :class="{ 'has-query': Boolean(searchQuery) }"
            :style="{
              backgroundColor: settings.enableFrostedGlass ? 'var(--bew-content)' : 'var(--bew-content-solid)',
            }"
            @click="focusSettingsSearch"
          >
            <i i-mingcute:search-2-line />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="search"
              :placeholder="$t('settings.search.placeholder')"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="settings-search-results"
              :aria-expanded="Boolean(searchQuery)"
              :aria-activedescendant="activeSearchResultIndex >= 0 ? `settings-search-result-${activeSearchResultIndex}` : undefined"
              @keydown.esc="searchQuery = ''"
              @keydown.down="moveSearchResultSelection($event, 1)"
              @keydown.up="moveSearchResultSelection($event, -1)"
              @keydown.enter="activateSearchResult"
              @focus="() => { handleSearchFocus(); updateSearchPopoverBounds() }"
              @blur="handleSearchBlur"
            >
          </div>
          <div
            style="
              box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
            "
            :style="{
              backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
            }"
            text="!16px hover:$bew-theme-color" w="32px" h="32px"
            flex="~ items-center justify-center shrink-0"
            relative z-1
            bg="$bew-elevated dark:$bew-fill-1 hover:$bew-theme-color-30"
            rounded-8 cursor="pointer" border="1 $bew-border-color" box-border
            duration-300
            @click="handleClose"
          >
            <div i-ic-baseline-clear />
          </div>
        </header>
        <div
          ref="scrollViewportRef"
          :style="{
            maskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, transparent 0%, black 92px 30%)' : 'linear-gradient(to bottom, transparent 0%, black 55px, black 100%)',
            WebkitMaskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, transparent 0%, black 92px 30%)' : 'linear-gradient(to bottom, transparent 0%, black 55px, black 100%)',
            scrollbarGutter: 'stable',
            overflowAnchor: 'none',
            overscrollBehavior: 'contain',
            // 隔离内容控件的层叠上下文（如 .bew-segment-control__item 的 z-1），
            // 避免毛玻璃关闭时与同 z-index 的 .settings-header 落入同一上下文、
            // 因 DOM 顺序靠后而绘制到头部之上。
            isolation: 'isolate',
          }"
          h-inherit of-y-auto of-x-hidden
          style="padding-top: 92px;"
        >
          <!-- 底部留白高于右下角帮助按钮（16px 边距 + 32px），让末行内容可滚到按钮上方 -->
          <main w-full min-h="[calc(100%-92px)]" p="x-12 b-20">
            <!-- <div h-80px mt--8 /> -->

            <Transition name="page-fade">
              <SettingsCategoryLayout
                v-if="settingsContentReady && activeMenuDef.pages?.length"
                :key="`layout-${activatedMenuItem}-${settingsContentKey}`"
                :pages="visibleSecondaryPages"
                :storage-key="activeMenuDef.storageKey!"
              />
              <Component
                :is="activeMenuDef.component"
                v-else-if="settingsContentReady && activeMenuDef.component"
                :key="`page-${activatedMenuItem}-${settingsContentKey}`"
              />
            </Transition>
          </main>
        </div>

        <!-- 右下角落在内容区 x-12 内边距内，不遮挡设置项右侧控件 -->
        <Tooltip
          class="settings-usage-guide"
          :content="$t('settings.usage_guide')"
          placement="left"
          floating
          floating-z-index="var(--bew-z-settings-tooltip)"
        >
          <a
            :href="USAGE_GUIDE_URL"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="$t('settings.usage_guide')"
            :style="{
              backdropFilter: settings.enableFrostedGlass ? 'var(--bew-filter-glass-1)' : 'none',
            }"
          >
            <i i-mingcute:question-line />
          </a>
        </Tooltip>
      </div>
    </div>

    <Teleport :to="mainAppRef" :disabled="!mainAppRef">
      <Transition name="settings-search-popover">
        <div
          v-if="searchQuery && isSearchFocused"
          id="settings-search-results"
          ref="searchResultsRef"
          class="settings-search-results bew-popover-surface"
          role="listbox"
          :style="[
            searchPopoverStyle,
            {
              backgroundColor: settings.enableFrostedGlass ? 'var(--bew-elevated-alt)' : 'var(--bew-elevated-alt-solid)',
              zIndex: 'var(--bew-z-settings-popover)',
            },
          ]"
        >
          <button
            v-for="(entry, index) in searchResults"
            :id="`settings-search-result-${index}`"
            :key="`${entry.menu}-${entry.secondaryTitleKey ?? ''}-${entry.titleKey ?? entry.title}-${index}`"
            type="button"
            role="option"
            :aria-selected="index === activeSearchResultIndex"
            :class="{ active: index === activeSearchResultIndex }"
            @mouseenter="activeSearchResultIndex = index"
            @mousedown.prevent
            @click="navigateToSearchResult(entry)"
          >
            <strong>{{ getSearchEntryTitle(entry) }}</strong>
            <span>{{ getSearchEntryLocation(entry) }}</span>
          </button>
          <p v-if="searchResults.length === 0">
            {{ $t('settings.search.no_results') }}
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.menu-item-activated {
  --uno: "text-$bew-text-auto bg-$bew-theme-color-auto";
}

// Animate from the capsule's real geometric radius instead of `radius-full`.
// Interpolating from 9999px stays visually clamped until the final frames and
// makes the corners appear to snap when the rail expands.
.settings-primary-navigation__list {
  --settings-primary-nav-inset: var(--bew-space-2);
  --settings-primary-nav-item-size: 40px;
  --settings-primary-nav-expanded-item-width: 190px;

  display: flex;
  box-sizing: border-box;
  width: calc(
    var(--settings-primary-nav-item-size) + var(--settings-primary-nav-inset) + var(--settings-primary-nav-inset)
  );
  padding: var(--settings-primary-nav-inset);
  flex-direction: column;
  align-items: stretch;
  gap: var(--bew-space-2);
  border-radius: 28px; // 40px item + 8px padding on each side, divided by two.
  transition:
    width var(--bew-duration-moderate) var(--bew-ease-standard),
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-standard);

  > li {
    width: 100%;
    flex: 0 0 auto;
  }
}

.settings-primary-navigation__surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 1px solid var(--bew-border-color);
}

.settings-primary-navigation__item {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: var(--settings-primary-nav-item-size);
  align-items: center;
  overflow-x: hidden;
  border-radius: var(--bew-space-5); // Half of the collapsed 40px item.
  transition:
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover:not(.menu-item-activated) {
    background: var(--bew-fill-2);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: -2px;
  }
}

.settings-primary-navigation:hover {
  .settings-primary-navigation__list {
    width: calc(
      var(--settings-primary-nav-expanded-item-width) + var(--settings-primary-nav-inset) +
        var(--settings-primary-nav-inset)
    );
    border-radius: var(--bew-radius-2xl);
    transform: scale(1.05);
  }
}

.settings-breadcrumb {
  position: relative;
  z-index: 1;
  display: flex;
  overflow: hidden;
  gap: var(--bew-space-2);
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);

  i {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  strong {
    min-width: 0;
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-heading);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-heading);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong:last-child {
    flex: 1 1 auto;
  }
}

/* 需高于 Tooltip 根节点自带的 relative 定位 */
.settings-content .settings-usage-guide {
  position: absolute;
  right: var(--bew-space-4);
  bottom: var(--bew-space-4);
  z-index: 1;

  a {
    display: flex;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--bew-text-2);
    font-size: 16px;
    background: var(--bew-elevated);
    border: 1px solid var(--bew-border-color);
    border-radius: 50%;
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
    transition:
      color var(--bew-duration-moderate) var(--bew-ease-standard),
      background-color var(--bew-duration-moderate) var(--bew-ease-standard);
  }

  a:hover {
    color: var(--bew-theme-color);
    background: var(--bew-theme-color-30);
  }

  a:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: 2px;
  }
}

.dark .settings-content .settings-usage-guide a:not(:hover) {
  background: var(--bew-fill-1);
}

.settings-search {
  position: relative;
  display: flex;
  box-sizing: border-box;
  align-items: center;
  flex: 0 1 auto;
  width: min(320px, 38%);
  min-width: 42px;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-content);
  border: 1px solid var(--bew-border-color);
  border-radius: calc(var(--bew-control-height) / 2);
  box-shadow: var(--bew-shadow-edge-glow-1);
  transition:
    width var(--bew-duration-moderate) var(--bew-ease-standard),
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    box-shadow var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover {
    border-color: var(--bew-theme-color-40);
  }

  &:focus-within {
    border-color: var(--bew-theme-color);
    border-radius: var(--bew-radius);
    box-shadow:
      var(--bew-shadow-edge-glow-1),
      0 0 0 2px var(--bew-theme-color);
  }

  > i {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: var(--bew-text-2);
    pointer-events: none;
  }

  input {
    width: 100%;
    min-width: 0;
    margin-left: var(--bew-space-2);
    color: var(--bew-text-1);
    background: transparent;
    border: 0;
    outline: 0;
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-body);

    &:focus-visible {
      outline: 0;
    }
  }
}

.settings-search-results {
  box-sizing: border-box;
  padding: var(--bew-space-2);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: calc(var(--bew-radius) + 4px);

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--bew-space-3);
    width: 100%;
    min-height: var(--bew-control-height);
    padding: var(--bew-space-2) var(--bew-space-4);
    text-align: left;
    border-radius: var(--bew-radius);
    transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);

    &:hover {
      background: var(--bew-fill-2);
    }

    &.active {
      background: var(--bew-fill-2);
    }
  }

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span,
  p {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }

  span {
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    padding: 12px;
    text-align: center;
  }
}

.settings-search-results {
  transform-origin: top right;
}

.settings-search-popover-enter-active,
.settings-search-popover-leave-active {
  transition:
    opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-search-popover-enter-from,
.settings-search-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

:deep(.settings-search-target) {
  position: relative;
  z-index: 2;
  isolation: isolate;
  border-radius: var(--bew-panel-radius);
}

:deep(.settings-search-target > *) {
  position: relative;
  z-index: 1;
}

:deep(.settings-search-target::before) {
  position: absolute;
  inset: 0 -12px;
  z-index: 0;
  background: var(--bew-theme-color);
  border-radius: var(--bew-panel-radius);
  content: "";
  opacity: 0;
  pointer-events: none;
  animation: settings-search-target-flash 2.4s ease-in-out;
}

:deep(.settings-search-target::after) {
  position: absolute;
  top: -13px;
  right: 12px;
  z-index: 3;
  padding: var(--bew-space-1) var(--bew-space-2);
  color: white;
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  box-shadow: var(--bew-shadow-2);
  content: attr(data-settings-search-highlight);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  pointer-events: none;
  white-space: nowrap;
  animation: settings-search-target-label 2.4s ease-out;
}

@keyframes settings-search-target-flash {
  0%,
  100% {
    opacity: 0;
  }

  18%,
  48%,
  78% {
    opacity: 0.18;
  }

  33%,
  63% {
    opacity: 0;
  }
}

@keyframes settings-search-target-label {
  0% {
    opacity: 0;
    transform: translateY(5px);
  }

  14%,
  72% {
    opacity: 1;
    transform: translateY(0);
  }

  100% {
    opacity: 0;
    transform: translateY(-5px);
  }
}

@media (max-width: 1279px) {
  #settings-window {
    /* 侧栏进入布局后先维持 1000px 内容宽度，空间不足时再连续收缩。 */
    width: min(calc(1000px + 72px), calc(100% - var(--bew-space-6)));
    max-width: none;
    margin-left: calc(-1 * var(--bew-space-1));
  }

  .settings-primary-navigation {
    /* xl 以下外侧空间不足：让折叠导航占据布局宽度，展开时仍可覆盖 content。 */
    position: relative;
    left: auto !important;
    width: 72px;
    box-sizing: border-box;
    padding-inline: var(--bew-space-2);
  }
}

@media (max-width: 760px) {
  .settings-header {
    gap: var(--bew-space-2);
    padding-inline: var(--bew-space-4);
  }

  .settings-primary-navigation {
    /* 触屏窄屏不依赖 hover，保持常驻图标列。 */
    li {
      width: 100%;
    }

    button {
      justify-content: center;
    }

    button > div:last-child {
      display: none;
    }

    button > div:first-child,
    button > div:nth-child(2) {
      width: 40px;
      flex: 0 0 40px;
    }

    &:hover {
      .settings-primary-navigation__list {
        width: calc(
          var(--settings-primary-nav-item-size) + var(--settings-primary-nav-inset) + var(--settings-primary-nav-inset)
        );
        border-radius: 28px;
      }

      .settings-primary-navigation__item {
        border-radius: var(--bew-space-5);
      }
    }
  }

  .settings-search {
    width: 42px;
    flex: 0 0 42px;
    cursor: pointer;

    input {
      width: 0;
      margin-left: 0;
      opacity: 0;
      pointer-events: none;
      transition:
        width var(--bew-duration-moderate) var(--bew-ease-standard),
        margin-left var(--bew-duration-moderate) var(--bew-ease-standard),
        opacity var(--bew-duration-normal) var(--bew-ease-standard);
    }

    &:focus-within,
    &.has-query {
      position: absolute;
      right: calc(var(--bew-space-4) + 32px + var(--bew-space-2));
      left: var(--bew-space-4);
      z-index: 3;
      width: auto;

      input {
        width: 100%;
        margin-left: var(--bew-space-2);
        opacity: 1;
        pointer-events: auto;
      }
    }
  }
}

.menu-section-start {
  position: relative;
  padding-top: calc(var(--bew-space-2) + 1px);

  &::before {
    position: absolute;
    top: 0;
    right: 8px;
    left: 8px;
    height: 1px;
    background: var(--bew-border-color);
    content: "";
  }
}
</style>
