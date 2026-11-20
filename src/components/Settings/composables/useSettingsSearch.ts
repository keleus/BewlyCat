import type { ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { shouldShowBewlyTopBar } from '~/utils/bilibiliTopBar'

import type { SettingsSearchEntry } from '../searchCatalog'
import { bewlyPagesOnlyTitleKeys, bewlyTopBarOnlyTitleKeys, playerShortcutTitleKeys, settingsSearchEntries, videoPageBackgroundTitleKeys } from '../searchCatalog'
import type { SearchPartMatch } from '../searchMatch'
import { getSearchPartScore } from '../searchMatch'
import type { SettingsMenuDefinition } from '../settingsMenus'
import { settingsMenus } from '../settingsMenus'
import { MenuType } from '../types'

interface SearchIndexEntry {
  entry: SettingsSearchEntry
  titleText: string
  keywordText: string
  order: number
}

export interface UseSettingsSearchOptions {
  visibleMenus: ComputedRef<SettingsMenuDefinition[]>
  menus?: SettingsMenuDefinition[]
}

/**
 * 设置壳共用的搜索状态。
 *
 * 只负责搜索索引、可见性、匹配评分和结果；搜索框、结果页或弹层等展示形式由
 * 独立设置页/设置浮层各自决定。
 */
export function useSettingsSearch(options: UseSettingsSearchOptions) {
  const { t, tm, rt } = useI18n()
  const menus = options.menus ?? settingsMenus
  const searchQuery = ref('')

  function getSearchEntryTitle(entry: SettingsSearchEntry) {
    return entry.titleKey ? t(entry.titleKey) : entry.title ?? ''
  }

  function getSearchEntryLocation(entry: SettingsSearchEntry) {
    const menu = menus.find(item => item.value === entry.menu)
    const primaryTitle = menu ? t(menu.titleKey) : t('settings.title')
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
    // 不索引 *_desc：描述文本容易让宽泛关键词命中大量设置。
    // 仅保留选项/单位和目录中显式声明的检索词。
    const inferredKeywordKeys = entry.titleKey
      ? [`${entry.titleKey}_opt`, `${entry.titleKey}_option`, `${entry.titleKey}_unit`]
      : []
    const translatedKeywords = [...inferredKeywordKeys, ...(entry.keywordKeys ?? [])]
      .flatMap(getTranslatedSearchTerms)

    // 菜单路径只用于结果定位，避免输入分类名时命中整组设置。
    return [...translatedKeywords, ...(entry.keywords ?? [])].join(' ').toLocaleLowerCase()
  }

  // 搜索文本只随 locale/目录变化重算，输入时复用，避免每次击键重复翻译全部条目。
  function isSearchEntryVisible(entry: SettingsSearchEntry) {
    const menu = options.visibleMenus.value.find(item => item.value === entry.menu)
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
    if (entry.titleKey && playerShortcutTitleKeys.has(entry.titleKey) && !settings.value.enablePlayerEnhancements)
      return false

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
      order,
    }
  }))

  function getSearchMatchScore(item: SearchIndexEntry, query: string, partMatches: SearchPartMatch[]) {
    let score = 0
    if (item.titleText === query)
      score += 200
    else if (item.titleText.includes(query))
      score += 40

    for (const partMatch of partMatches)
      score += partMatch.score

    return score
  }

  const searchResults = computed(() => {
    const query = searchQuery.value.trim().toLocaleLowerCase()
    if (!query)
      return []

    const queryParts = query.split(/\s+/).filter(Boolean)
    const matches: Array<{ item: SearchIndexEntry, score: number }> = []
    for (const item of searchIndex.value) {
      const partMatches = queryParts
        .map(part => getSearchPartScore(item, part))
        .filter((match): match is SearchPartMatch => match !== null)
      if (partMatches.length !== queryParts.length)
        continue
      matches.push({ item, score: getSearchMatchScore(item, query, partMatches) })
    }

    // 标题精确/前缀命中优先于标题包含，再到关键词命中与分隔匹配；同分保持目录顺序。
    matches.sort((a, b) => b.score - a.score || a.item.order - b.item.order)
    return matches.map(({ item }) => item.entry)
  })

  const isSearching = computed(() => searchQuery.value.trim().length > 0)

  const matchedSearchTitles = computed(() => {
    const titles = new Set<string>()
    for (const entry of searchResults.value) {
      const title = getSearchEntryTitle(entry).trim()
      if (title)
        titles.add(title)
      if (entry.fallbackTargetKey) {
        const fallbackTitle = t(entry.fallbackTargetKey).trim()
        if (fallbackTitle)
          titles.add(fallbackTitle)
      }
    }
    return titles
  })

  function getSearchEntrySecondaryPage(entry: SettingsSearchEntry) {
    const menu = menus.find(item => item.value === entry.menu)
    return entry.storageValues?.find(({ key }) => key === menu?.storageKey)?.value
  }

  const searchResultCount = computed(() => {
    const titles = new Set<string>()
    for (const entry of searchResults.value) {
      const title = getSearchEntryTitle(entry).trim()
      if (title)
        titles.add(title)
    }
    return titles.size
  })

  const searchResultsSummary = computed(() => {
    if (!isSearching.value)
      return ''
    return searchResultCount.value
      ? t('settings.search.results_count', { count: searchResultCount.value })
      : t('settings.search.no_results')
  })

  return {
    getSearchEntryLocation,
    getSearchEntrySecondaryPage,
    getSearchEntryTitle,
    isSearching,
    matchedSearchTitles,
    searchQuery,
    searchResultCount,
    searchResults,
    searchResultsSummary,
  }
}
