import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { SettingsNavigationTarget } from '~/composables/useAppProvider'

import type { SettingsSearchEntry } from '../searchCatalog'

export interface UseSettingsSearchNavigationOptions {
  /** 设置内容滚动容器。独立页和浮层各自提供自己的容器。 */
  scrollViewportRef: Ref<HTMLElement | undefined>
  /** 当前搜索词；跳转后由共享逻辑清空。 */
  searchQuery: Ref<string>
  getSearchEntryTitle: (entry: SettingsSearchEntry) => string
  getSearchEntrySecondaryPage: (entry: SettingsSearchEntry) => string | undefined
  /** 由壳层负责把目标同步到自己的菜单/二级页状态。 */
  activateSettingsTarget: (target: SettingsNavigationTarget) => void
}

/**
 * 设置壳共用的搜索跳转与定位逻辑。
 *
 * 搜索结果点击后：清理旧的定位任务 -> 清空搜索 -> 切换到目标设置页 ->
 * 等待目标渲染 -> 滚动到设置项并高亮。滚动容器和页面切换由调用方注入。
 */
export function useSettingsSearchNavigation(options: UseSettingsSearchNavigationOptions) {
  const { t } = useI18n()

  let highlightedSearchTarget: HTMLElement | undefined
  let searchTargetHighlightTimer: number | undefined
  let searchNavigationId = 0
  let searchTargetRetryTimer: number | undefined
  let searchTargetFrame: number | undefined

  function cancelSearchNavigation() {
    searchNavigationId++
    if (searchTargetRetryTimer !== undefined) window.clearTimeout(searchTargetRetryTimer)
    if (searchTargetFrame !== undefined) window.cancelAnimationFrame(searchTargetFrame)
    searchTargetRetryTimer = undefined
    searchTargetFrame = undefined
    clearSearchTargetHighlight()
  }

  function clearSearchTargetHighlight() {
    if (searchTargetHighlightTimer) window.clearTimeout(searchTargetHighlightTimer)

    highlightedSearchTarget?.classList.remove('settings-search-target')
    highlightedSearchTarget?.removeAttribute('data-settings-search-highlight')
    highlightedSearchTarget = undefined
    searchTargetHighlightTimer = undefined
  }

  function highlightSearchTarget(target: HTMLElement) {
    clearSearchTargetHighlight()
    const visualTarget = target.matches('.b-settings-item-group')
      ? (target.querySelector<HTMLElement>(':scope > .group-title') ?? target)
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
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open) return true
      ancestor = ancestor.parentElement
    }
    return false
  }

  function isUsableTarget(
    element: HTMLElement | null,
    viewport: HTMLElement,
  ): element is HTMLElement {
    return Boolean(
      element && (isVisibleTarget(element) || hasClosedDetailsAncestor(element, viewport)),
    )
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
        scrollToSearchTarget(
          targetKey,
          expectedTitle,
          fallbackTargetKey,
          navigationId,
          attempts + 1,
        )
      }, 100)
    }
    const viewport = options.scrollViewportRef.value
    // 异步页面挂载及离场节点都会影响布局，等待过渡结束后再测量。
    if (!viewport || viewport.querySelector('.page-fade-enter-active, .page-fade-leave-active')) {
      retry()
      return
    }

    const queryByKey = (key: string) =>
      Array.from(
        viewport.querySelectorAll<HTMLElement>(`[data-settings-key="${CSS.escape(key)}"]`),
      ).find((element) => isUsableTarget(element, viewport)) ?? null
    const queryByTitle = (title: string | undefined) =>
      title
        ? (Array.from(viewport.querySelectorAll<HTMLElement>('[data-settings-title]')).find(
            (element) =>
              element.dataset.settingsTitle === title && isUsableTarget(element, viewport),
          ) ?? null)
        : null

    const keyedTarget = targetKey ? queryByKey(targetKey) : null
    const titleTarget = expectedTitle ? queryByTitle(expectedTitle) : null
    // 条件目标可能不存在；给它两轮挂载时间后落到始终可见的父项。
    const fallbackTarget =
      fallbackTargetKey && attempts >= 2
        ? (queryByKey(fallbackTargetKey) ?? queryByTitle(t(fallbackTargetKey)))
        : null
    // 未配置父项时至少把用户带到当前页面，避免点击完全无反馈。
    const pageTarget =
      attempts >= 10
        ? (Array.from(viewport.querySelectorAll<HTMLElement>('[data-settings-title]')).find(
            isVisibleTarget,
          ) ?? null)
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
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true
      ancestor = ancestor.parentElement
    }

    nextTick(() => {
      if (navigationId !== searchNavigationId) return
      searchTargetFrame = window.requestAnimationFrame(() => {
        searchTargetFrame = undefined
        if (navigationId !== searchNavigationId || !viewport.contains(target)) return
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
        const centerOffset = Math.max(
          0,
          (viewport.clientHeight - headerInset - targetRect.height) / 2,
        )
        // 只滚动设置容器，避免 scrollIntoView 连带滚动外层页面；避开固定顶栏。
        viewport.scrollTo({
          top: Math.max(
            0,
            viewport.scrollTop +
              targetRect.top -
              viewportRect.top -
              viewport.clientTop -
              headerInset -
              centerOffset,
          ),
          behavior: 'smooth',
        })
        // 页面级兜底只负责把用户带到正确页面，避免把“已定位”标注到无关设置上。
        if (!usedPageFallback) highlightSearchTarget(target)
      })
    })
  }

  function navigateToSearchResult(entry: SettingsSearchEntry) {
    cancelSearchNavigation()
    const navigationId = searchNavigationId
    options.searchQuery.value = ''
    options.activateSettingsTarget({
      menu: entry.menu,
      secondaryPage: options.getSearchEntrySecondaryPage(entry),
      targetTitleKey: entry.targetTitleKey,
    })
    const targetTitle = entry.targetTitleKey
      ? t(entry.targetTitleKey)
      : (entry.targetTitle ?? options.getSearchEntryTitle(entry))
    const targetKey = entry.targetTitleKey ?? entry.titleKey
    nextTick(() =>
      scrollToSearchTarget(targetKey, targetTitle, entry.fallbackTargetKey, navigationId),
    )
  }

  onScopeDispose(cancelSearchNavigation)

  return {
    cancelSearchNavigation,
    clearSearchTargetHighlight,
    navigateToSearchResult,
    scrollToSearchTarget,
  }
}
