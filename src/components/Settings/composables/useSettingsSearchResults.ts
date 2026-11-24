import type { Component, ComputedRef } from 'vue'

import type { SettingsSearchEntry } from '../searchCatalog'
import type { SettingsMenuDefinition, SettingsSecondaryPage } from '../settingsMenus'

export interface SearchResultSection {
  key: string
  menuTitleKey: string
  page?: SettingsSecondaryPage
  component: Component
}

export interface UseSettingsSearchResultsOptions {
  visibleMenus: ComputedRef<SettingsMenuDefinition[]>
  isSearching: ComputedRef<boolean>
  searchResults: ComputedRef<SettingsSearchEntry[]>
  getSearchEntrySecondaryPage: (entry: SettingsSearchEntry) => string | undefined
}

/**
 * 设置搜索命中结果对应的页面分组。
 *
 * 独立设置页和设置浮层共用：只按命中的菜单/二级页分组，具体渲染交给
 * `SettingsSearchResults.vue`，避免两套搜索壳各写一份分组逻辑。
 */
export function useSettingsSearchResults(options: UseSettingsSearchResultsOptions) {
  const searchResultPageKeys = computed(() => {
    const keys = new Set<string>()
    for (const entry of options.searchResults.value) {
      const secondaryPage = options.getSearchEntrySecondaryPage(entry)
      keys.add(secondaryPage ? `${entry.menu}:${secondaryPage}` : entry.menu)
    }
    return keys
  })

  // 搜索结果已按匹配度排序，取每个页面首次出现的位置作为结果页的分组顺序。
  const searchResultSectionOrder = computed(() => {
    const order = new Map<string, number>()
    for (const entry of options.searchResults.value) {
      const secondaryPage = options.getSearchEntrySecondaryPage(entry)
      const key = secondaryPage ? `${entry.menu}:${secondaryPage}` : entry.menu
      if (!order.has(key)) order.set(key, order.size)
    }
    return order
  })

  const searchResultSections = computed<SearchResultSection[]>(() => {
    if (!options.isSearching.value) return []

    const sections: SearchResultSection[] = []
    for (const menu of options.visibleMenus.value) {
      if (!menu.pages) {
        if (menu.component && searchResultPageKeys.value.has(menu.value))
          sections.push({ key: menu.value, menuTitleKey: menu.titleKey, component: menu.component })
        continue
      }

      for (const page of menu.pages) {
        const key = `${menu.value}:${page.value}`
        if (page.component && searchResultPageKeys.value.has(key))
          sections.push({ key, menuTitleKey: menu.titleKey, page, component: page.component })
      }
    }

    return sections.sort(
      (a, b) =>
        (searchResultSectionOrder.value.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
        (searchResultSectionOrder.value.get(b.key) ?? Number.MAX_SAFE_INTEGER),
    )
  })

  return {
    searchResultSections,
  }
}
