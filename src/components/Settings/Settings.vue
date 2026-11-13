<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

import type { SettingsMenu, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { useBewlyApp } from '~/composables/useAppProvider'
import { USAGE_GUIDE_URL } from '~/constants/usageGuide'
import { settings } from '~/logic'
import { shouldShowBewlyTopBar } from '~/utils/bilibiliTopBar'
import { buildSettingsPageHash } from '~/utils/settingsPage'

import SettingsSectionHeading from './components/SettingsSectionHeading.vue'
import { createPinnedChannelHistory, pinnedChannelHistoryKey } from './composables/usePinnedChannelHistory'
import { useSettingsUrlSync } from './composables/useSettingsUrlSync'
import type { SettingsSearchEntry } from './searchCatalog'
import { bewlyPagesOnlyTitleKeys, bewlyTopBarOnlyTitleKeys, settingsSearchEntries, videoPageBackgroundTitleKeys } from './searchCatalog'
import type { SettingsSecondaryPage } from './settingsMenus'
import { settingsMenus } from './settingsMenus'
import { MenuType } from './types'

const pendingNavigation = defineModel<SettingsNavigationTarget | undefined>('pendingNavigation')

const pinnedChannelHistory = createPinnedChannelHistory(computed({
  get: () => settings.value.topBarPinnedChannels,
  set: keys => settings.value.topBarPinnedChannels = keys,
}))
provide(pinnedChannelHistoryKey, pinnedChannelHistory)

const { t, tm, rt } = useI18n()
const searchQuery = ref('')

const settingsMenuStorageKey = 'bewly-settings-active-menu'
const storedMenuItem = sessionStorage.getItem(settingsMenuStorageKey) as MenuType | null
const activatedMenuItem = ref<MenuType>(
  storedMenuItem && settingsMenus.some(menu => menu.value === storedMenuItem)
    ? storedMenuItem
    : MenuType.General,
)
// 每个一级菜单各自记住当前二级页，切换回来时保持原位。
const activeSecondaryPages = reactive<Partial<Record<MenuType, string>>>(Object.fromEntries(
  settingsMenus.flatMap((menu) => {
    if (!menu.pages)
      return []
    const stored = sessionStorage.getItem(menu.storageKey!)
    return [[menu.value, menu.pages.some(page => page.value === stored) ? stored : menu.pages[0].value]]
  }),
))
// 依赖的模块关闭后，对应菜单和二级页一并隐藏。
const visibleMenus = computed(() => settingsMenus.flatMap((menu) => {
  if (menu.available && !menu.available())
    return []
  if (!menu.pages)
    return [menu]
  const pages = menu.pages.filter(page => !page.available || page.available())
  return pages.length ? [{ ...menu, pages }] : []
}))
// 当前页面被隐藏时回到通用页，用户可以在那里重新开启对应模块。
const activeMenu = computed(() => visibleMenus.value.find(menu => menu.value === activatedMenuItem.value)
  ?? visibleMenus.value.find(menu => menu.value === MenuType.General)!)
function getSecondaryPage(menu: typeof activeMenu.value) {
  return menu.pages?.find(page => page.value === activeSecondaryPages[menu.value]) ?? menu.pages?.[0]
}
const activeSecondaryPage = computed(() => getSecondaryPage(activeMenu.value))
const activeContent = computed(() => activeSecondaryPage.value?.component ?? activeMenu.value.component)
const expandedMenusStorageKey = 'bewly-settings-expanded-menus'
const defaultExpandedMenus = settingsMenus.filter(menu => menu.pages?.length).map(menu => menu.value)

function readExpandedMenus(): MenuType[] {
  try {
    const stored = JSON.parse(localStorage.getItem(expandedMenusStorageKey) ?? 'null')
    return Array.isArray(stored) ? stored : defaultExpandedMenus
  }
  catch {
    return defaultExpandedMenus
  }
}

// 展开与页面选中分别管理，浏览其他分类时保留已展开的菜单，下次打开设置页时也保持。
const expandedMenus = ref(new Set<MenuType>([...readExpandedMenus(), activatedMenuItem.value]))
watch(expandedMenus, (menus) => {
  localStorage.setItem(expandedMenusStorageKey, JSON.stringify([...menus]))
}, { deep: true })

const secondaryGroups = computed(() => new Map(visibleMenus.value.map((menu) => {
  const groups: Array<{ key: string | null, pages: SettingsSecondaryPage[] }> = []
  for (const page of menu.pages ?? []) {
    const groupKey = page.groupKey ?? null
    const lastGroup = groups[groups.length - 1]
    if (lastGroup?.key === groupKey)
      lastGroup.pages.push(page)
    else
      groups.push({ key: groupKey, pages: [page] })
  }
  return [menu.value, groups] as const
})))

function toggleMenu(menu: MenuType) {
  if (expandedMenus.value.has(menu))
    expandedMenus.value.delete(menu)
  else
    expandedMenus.value.add(menu)
}

const settingsSearchRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()
const searchPopoverStyle = ref<CSSProperties>({})
const isSearchFocused = ref(false)
const { mainAppRef } = useBewlyApp()

// 鼠标点选后焦点仍留在控件上时，之后的任意按键（包括系统快捷键）都会让浏览器
// 把它判定为键盘聚焦并显示焦点环，因此点击后释放焦点。
const POINTER_RELEASED_FOCUS_SELECTOR = 'a, button, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"]'
useEventListener(mainAppRef, 'click', (event: MouseEvent) => {
  // 键盘触发的 click 其 detail 为 0，需要保留焦点和焦点环。
  if (event.detail === 0)
    return

  const activeElement = (mainAppRef.value.getRootNode() as ShadowRoot).activeElement
  if (activeElement instanceof HTMLElement && activeElement.matches(POINTER_RELEASED_FOCUS_SELECTOR))
    activeElement.blur()
}, { capture: true })

function handleSearchBlur() {
  isSearchFocused.value = false
}

function handleSearchFocus() {
  isSearchFocused.value = true
}

function updateSearchPopoverBounds() {
  const searchElement = settingsSearchRef.value
  const contentElement = searchElement?.closest<HTMLElement>('.settings-page')
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

useEventListener(window, 'resize', () => nextTick(updateSearchPopoverBounds))

const scrollViewportRef = ref<HTMLElement>()

// 滚动时关闭搜索弹窗（保留搜索词）
useEventListener(() => scrollViewportRef.value, 'scroll', () => {
  if (isSearchFocused.value) {
    isSearchFocused.value = false
    searchInputRef.value?.blur()
  }
}, { capture: true })

watch(activatedMenuItem, (menu) => {
  sessionStorage.setItem(settingsMenuStorageKey, menu)
  expandedMenus.value.add(menu)
})
watch(activeSecondaryPages, (pages) => {
  for (const menu of settingsMenus) {
    if (menu.storageKey && pages[menu.value])
      sessionStorage.setItem(menu.storageKey, pages[menu.value]!)
  }
})
watch([activatedMenuItem, activeSecondaryPage], () => {
  scrollViewportRef.value?.scrollTo({ top: 0 })
})

const title = computed(() => t(activeMenu.value.titleKey))
const titleDetail = computed(() => activeSecondaryPage.value ? t(activeSecondaryPage.value.titleKey) : undefined)

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
function isSearchEntryVisible(entry: SettingsSearchEntry) {
  const menu = visibleMenus.value.find(item => item.value === entry.menu)
  if (!menu)
    return false
  const usedByVideoPageGlassStyle = settings.value.videoPageGlassStyle
    && entry.menu === MenuType.Appearance
    && entry.titleKey !== undefined
    && videoPageBackgroundTitleKeys.has(entry.titleKey)
  if (settings.value.useOriginalBilibiliHomepage && entry.titleKey && bewlyPagesOnlyTitleKeys.has(entry.titleKey) && !usedByVideoPageGlassStyle)
    return false
  if (entry.titleKey && bewlyTopBarOnlyTitleKeys.has(entry.titleKey)
    && !shouldShowBewlyTopBar(settings.value.enableTopBarModule, settings.value.enableTopBar, settings.value.useOriginalBilibiliTopBar)) {
    return false
  }

  const secondaryPage = entry.storageValues?.find(({ key }) => key === menu.storageKey)?.value
  return !secondaryPage || !menu.pages || menu.pages.some(page => page.value === secondaryPage)
}

const searchIndex = computed<SearchIndexEntry[]>(() => settingsSearchEntries.filter(isSearchEntryVisible).map((entry, order) => {
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
  const menuItem = settingsMenus.find(item => item.value === menu)
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
  if (!viewport) {
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
  const menu = settingsMenus.find(item => item.value === entry.menu)
  const secondaryPage = entry.storageValues?.find(({ key }) => key === menu?.storageKey)?.value
  if (secondaryPage && menu?.pages?.some(page => page.value === secondaryPage))
    activeSecondaryPages[entry.menu] = secondaryPage

  expandedMenus.value.add(entry.menu)
  activatedMenuItem.value = entry.menu
  searchQuery.value = ''
  const targetTitle = entry.targetTitleKey
    ? t(entry.targetTitleKey)
    : entry.targetTitle ?? getSearchEntryTitle(entry)
  const targetKey = entry.targetTitleKey ?? entry.titleKey
  nextTick(() => scrollToSearchTarget(targetKey, targetTitle, entry.fallbackTargetKey, navigationId))
}

function navigateToTarget(target: SettingsNavigationTarget) {
  const storageKey = settingsMenus.find(menu => menu.value === target.menu)?.storageKey
  navigateToSearchResult({
    menu: target.menu as MenuType,
    targetTitleKey: target.targetTitleKey,
    storageValues: target.secondaryPage && storageKey
      ? [{ key: storageKey, value: target.secondaryPage }]
      : undefined,
  })
}

watch(pendingNavigation, (target) => {
  if (!target)
    return

  navigateToTarget(target)
  pendingNavigation.value = undefined
}, { immediate: true })

function getMenuHref(menu: (typeof visibleMenus.value)[number], secondaryPage = getSecondaryPage(menu)?.value) {
  return buildSettingsPageHash({ menu: menu.value as SettingsMenu, secondaryPage })
}

useSettingsUrlSync(computed(() => getMenuHref(activeMenu.value)), navigateToTarget)

watchEffect(() => {
  document.title = `${titleDetail.value ?? title.value} - BewlyCat`
})

onBeforeUnmount(cancelSearchNavigation)

const brandIconUrl = browser.runtime.getURL('/assets/icon-512.png')
</script>

<template>
  <div class="settings-page">
    <aside class="settings-sidebar">
      <div class="settings-sidebar__brand">
        <img :src="brandIconUrl" alt="" width="32" height="32">
        <span>BewlyCat</span>
      </div>
      <nav class="settings-sidebar__nav" :aria-label="$t('settings.title')">
        <ul>
          <li
            v-for="menu in visibleMenus"
            :key="menu.value"
            :class="{ 'menu-section-start': menu.sectionStart }"
          >
            <div class="settings-sidebar__row">
              <a
                class="settings-sidebar__item"
                :class="{
                  'settings-sidebar__item--parent': menu.pages,
                  'is-active': menu.value === activeMenu.value && (!menu.pages || !expandedMenus.has(menu.value)),
                  'is-current': menu.value === activeMenu.value,
                }"
                :href="getMenuHref(menu)"
                :aria-current="menu.value === activeMenu.value && !menu.pages ? 'page' : undefined"
                @click="expandedMenus.add(menu.value)"
              >
                <span
                  class="settings-sidebar__icon"
                  :class="menu.value === activeMenu.value ? menu.iconActivated : menu.icon"
                />
                <span>{{ $t(menu.titleKey) }}</span>
              </a>
              <button
                v-if="menu.pages"
                type="button"
                class="settings-sidebar__toggle"
                :aria-label="$t(menu.titleKey)"
                :aria-expanded="expandedMenus.has(menu.value)"
                :aria-controls="`settings-menu-${menu.value}`"
                @click="toggleMenu(menu.value)"
              >
                <span class="settings-sidebar__chevron i-mingcute:down-line" aria-hidden="true" />
              </button>
            </div>

            <div
              v-if="menu.pages"
              :id="`settings-menu-${menu.value}`"
              class="settings-sidebar__children"
              :class="{ 'is-expanded': expandedMenus.has(menu.value) }"
              :inert="!expandedMenus.has(menu.value)"
              :aria-hidden="!expandedMenus.has(menu.value)"
            >
              <div class="settings-sidebar__children-inner">
                <ul>
                  <template v-for="(group, groupIndex) in secondaryGroups.get(menu.value)" :key="group.key ?? groupIndex">
                    <li v-if="group.key" class="settings-sidebar__group-label">
                      {{ $t(group.key) }}
                    </li>
                    <li v-for="page in group.pages" :key="page.value">
                      <a
                        class="settings-sidebar__item settings-sidebar__item--child"
                        :class="{ 'is-active': page === activeSecondaryPage }"
                        :href="getMenuHref(menu, page.value)"
                        :aria-current="page === activeSecondaryPage ? 'page' : undefined"
                      >
                        <span
                          class="settings-sidebar__icon"
                          :class="page === activeSecondaryPage ? page.iconActivated : page.icon"
                        />
                        <span>{{ $t(page.titleKey) }}</span>
                      </a>
                    </li>
                  </template>
                </ul>
              </div>
            </div>
          </li>
        </ul>
      </nav>
      <a
        class="settings-sidebar__item settings-sidebar__guide"
        :href="USAGE_GUIDE_URL"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="settings-sidebar__icon i-mingcute:question-line" />
        <span>{{ $t('settings.usage_guide') }}</span>
      </a>
    </aside>

    <div class="settings-content">
      <header class="settings-header">
        <nav class="settings-breadcrumb" :aria-label="$t('settings.breadcrumb')">
          <span>{{ $t('settings.title') }}</span>
          <i i-mingcute:right-line />
          <strong>{{ title }}</strong>
          <template v-if="titleDetail">
            <i i-mingcute:right-line />
            <strong>{{ titleDetail }}</strong>
          </template>
        </nav>
        <div
          ref="settingsSearchRef"
          class="settings-search"
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
      </header>

      <!-- 窄屏时侧栏变为横向，二级菜单在这里单独显示一行。 -->
      <nav
        v-if="activeMenu.pages"
        class="settings-subnav"
        :aria-label="$t('settings.category_navigation')"
      >
        <a
          v-for="page in activeMenu.pages"
          :key="page.value"
          class="settings-sidebar__item settings-sidebar__item--child"
          :class="{ 'is-active': page === activeSecondaryPage }"
          :href="getMenuHref(activeMenu, page.value)"
          :aria-current="page === activeSecondaryPage ? 'page' : undefined"
        >
          <span
            class="settings-sidebar__icon"
            :class="page === activeSecondaryPage ? page.iconActivated : page.icon"
          />
          <span>{{ $t(page.titleKey) }}</span>
        </a>
      </nav>

      <div ref="scrollViewportRef" class="settings-viewport">
        <!-- 按页面重建节点以重播入场动画；旧页立即移除，避免两页文字叠影。 -->
        <main
          :key="`${activeMenu.value}/${activeSecondaryPage?.value ?? ''}`"
          class="settings-main"
        >
          <SettingsSectionHeading
            v-if="activeSecondaryPage"
            :title="$t(activeSecondaryPage.titleKey)"
            :desc="activeSecondaryPage.descriptionKey ? $t(activeSecondaryPage.descriptionKey) : undefined"
            :icon="activeSecondaryPage.iconActivated"
          />
          <Component :is="activeContent" />
        </main>
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
.settings-page {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  // 设置卡片是半透明白色，需要有底色才能和页面区分。
  background: var(--bew-elevated-alt-solid);
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  min-height: 0;
  // 右侧由滚动条预留位补足，展开多个菜单出现滚动条时菜单宽度不跳动。
  padding: var(--bew-space-5) var(--bew-space-1) var(--bew-space-3) var(--bew-space-3);
  overflow: hidden auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
  background: var(--bew-content-solid);
  border-right: 1px solid var(--bew-border-color);
}

.settings-sidebar__brand {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  align-items: center;
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-display);
  font-weight: var(--bew-font-weight-bold);
  line-height: 32px;

  img {
    flex: 0 0 auto;
    border-radius: var(--bew-radius-md);
  }
}

.settings-sidebar__nav {
  flex: 1 1 auto;

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--bew-space-1);
  }
}

.settings-sidebar__row {
  position: relative;
}

.settings-sidebar__item {
  display: flex;
  box-sizing: border-box;
  gap: var(--bew-space-3);
  align-items: center;
  min-height: 40px;
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-text-1);
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-body);
  text-decoration: none;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover:not(.is-active) {
    background: var(--bew-theme-color-10);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: -2px;
  }

  &.is-current {
    font-weight: var(--bew-font-weight-semibold);
  }

  &.is-active {
    background: var(--bew-theme-color-20);
  }

  &.is-current .settings-sidebar__icon,
  &.is-active .settings-sidebar__icon {
    color: var(--bew-theme-color);
  }
}

.settings-sidebar__item--parent {
  padding-right: calc(var(--bew-space-8) + var(--bew-space-2));
}

.settings-sidebar__item--child {
  gap: var(--bew-space-2);
  min-height: 36px;
  padding-block: var(--bew-space-1);
}

.settings-sidebar__children {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--bew-duration-normal) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard);

  &.is-expanded {
    grid-template-rows: 1fr;
    opacity: 1;
  }
}

.settings-sidebar__children-inner {
  min-height: 0;
  overflow: hidden;

  > ul {
    padding: var(--bew-space-1) 0 var(--bew-space-1) var(--bew-space-4);
  }
}

.settings-sidebar__group-label {
  padding: var(--bew-space-1) var(--bew-space-3) 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.settings-sidebar__icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  font-size: var(--bew-icon-size-md);
}

.settings-sidebar__toggle {
  position: absolute;
  top: 50%;
  right: var(--bew-space-1);
  display: grid;
  place-items: center;
  width: var(--bew-space-8);
  height: var(--bew-space-8);
  color: var(--bew-text-2);
  border-radius: var(--bew-interactive-radius);
  transform: translateY(-50%);
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-theme-color-10);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: -2px;
  }
}

.settings-sidebar__chevron {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  transform: rotate(-90deg);
  transition: transform var(--bew-duration-normal) var(--bew-ease-standard);
}

.settings-sidebar__toggle[aria-expanded="true"] .settings-sidebar__chevron {
  transform: none;
}

.settings-sidebar__guide {
  flex: 0 0 auto;
  color: var(--bew-text-2);
}

.settings-subnav {
  display: none;
}

.menu-section-start {
  position: relative;
  margin-top: var(--bew-space-1);
  padding-top: var(--bew-space-2);

  &::before {
    position: absolute;
    top: 0;
    right: var(--bew-space-3);
    left: var(--bew-space-3);
    height: 1px;
    background: var(--bew-border-color);
    content: "";
  }
}

.settings-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.settings-header {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-4);
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 64px;
  padding: 0 var(--bew-space-8);
  border-bottom: 1px solid var(--bew-border-color);
}

.settings-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden auto;
  overflow-anchor: none;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  // 隔离内容控件的层叠上下文，避免滚动内容盖住搜索结果。
  isolation: isolate;
}

.settings-main {
  box-sizing: border-box;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--bew-space-6) var(--bew-space-8) var(--bew-space-12);
  animation: settings-page-enter var(--bew-duration-normal) var(--bew-ease-standard);
}

// 从半透明开始而不是全透明：切换时内容立即可见，只是平滑地变实，不会出现整屏空白。
@keyframes settings-page-enter {
  from {
    opacity: 0.4;
    transform: translateY(var(--bew-space-1));
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

.settings-search {
  position: relative;
  display: flex;
  box-sizing: border-box;
  align-items: center;
  flex: 0 1 auto;
  width: clamp(180px, 20vw, 320px);
  min-width: 42px;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-content-solid);
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

@media (max-width: 900px) {
  .settings-page {
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-sidebar {
    flex-direction: row;
    padding: var(--bew-space-2) var(--bew-space-3);
    overflow: auto hidden;
    scrollbar-width: none;
    scrollbar-gutter: auto;
    border-right: 0;
    border-bottom: 1px solid var(--bew-border-color);
  }

  .settings-sidebar__brand,
  .settings-sidebar__guide,
  .settings-sidebar__toggle {
    display: none;
  }

  .settings-sidebar__nav ul {
    flex-direction: row;
  }

  .settings-sidebar__nav .settings-sidebar__children {
    display: none;
  }

  .settings-sidebar__item {
    white-space: nowrap;

    &.is-current {
      background: var(--bew-theme-color-20);
    }
  }

  .settings-sidebar__item--parent {
    padding-right: var(--bew-space-3);
  }

  .settings-subnav {
    display: flex;
    flex: 0 0 auto;
    gap: var(--bew-space-1);
    padding: var(--bew-space-2) var(--bew-space-3);
    overflow: auto hidden;
    scrollbar-width: none;
    background: var(--bew-content-solid);
    border-bottom: 1px solid var(--bew-border-color);
  }

  .menu-section-start {
    margin-top: 0;
    padding-top: 0;

    &::before {
      display: none;
    }
  }
}

@media (max-width: 760px) {
  .settings-header {
    height: 56px;
    padding: 0 var(--bew-space-4);
  }

  .settings-breadcrumb {
    display: none;
  }

  .settings-search {
    flex: 1 1 auto;
    width: auto;
  }

  .settings-main {
    // 设置卡片向两侧外扩 16px，留出 24px 才不会贴住窗口边缘。
    padding: var(--bew-space-4) var(--bew-space-6) var(--bew-space-10);
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-sidebar__item,
  .settings-sidebar__toggle,
  .settings-sidebar__chevron,
  .settings-sidebar__children {
    transition: none;
  }

  .settings-main {
    animation: none;
  }
}
</style>
