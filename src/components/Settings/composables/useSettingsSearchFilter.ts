import type { ComputedRef, InjectionKey, Ref } from 'vue'
import { computed, inject, onScopeDispose, provide, shallowReactive } from 'vue'

export interface SettingsSearchFilter {
  /** 搜索框是否有有效的筛选关键词。 */
  active: ComputedRef<boolean>
  /** 全站搜索结果对应的设置标题。 */
  matchedTitles: ComputedRef<Set<string>>
}

export const settingsSearchFilterKey: InjectionKey<SettingsSearchFilter> = Symbol('settings-search-filter')

interface SettingsSearchNode extends SettingsSearchFilter {
  /** 祖先命中标题时，子项应一并保留，避免只显示标题而丢失控件。 */
  forceVisible: ComputedRef<boolean>
  registerChild: (visible: Ref<boolean>) => void
  unregisterChild: (visible: Ref<boolean>) => void
}

export const settingsSearchNodeKey: InjectionKey<SettingsSearchNode> = Symbol('settings-search-node')

export function provideSettingsSearchFilter(
  active: ComputedRef<boolean>,
  matchedTitles: ComputedRef<Set<string>>,
) {
  provide(settingsSearchFilterKey, { active, matchedTitles })
}

/**
 * 可搜索节点。自身标题命中时整项保留并强制显示所有子控件；
 * 自身未命中但存在命中的子节点时，保留父级结构用于承载匹配结果。
 */
export function useSettingsSearchNode(
  title: () => string | undefined,
  options: { searchable?: boolean } = {},
) {
  const searchable = options.searchable ?? true
  const filter = inject(settingsSearchFilterKey, null)
  const parent = inject(settingsSearchNodeKey, null)

  if (!filter || !searchable)
    return { visible: computed(() => true), selfMatch: computed(() => false) }

  const children = shallowReactive(new Set<Ref<boolean>>())
  const hasVisibleChild = computed(() => {
    for (const child of children) {
      if (child.value)
        return true
    }
    return false
  })
  const inheritedForceVisible = parent?.forceVisible ?? computed(() => false)
  const normalizedTitle = computed(() => title()?.trim() ?? '')
  const selfMatch = computed(() =>
    filter.active.value
    && normalizedTitle.value.length > 0
    && filter.matchedTitles.value.has(normalizedTitle.value),
  )
  const forceVisible = computed(() => inheritedForceVisible.value || selfMatch.value)
  const visible = computed(() => !filter.active.value || forceVisible.value || hasVisibleChild.value)

  if (parent) {
    parent.registerChild(visible)
    onScopeDispose(() => parent.unregisterChild(visible))
  }

  provide(settingsSearchNodeKey, {
    ...filter,
    forceVisible,
    registerChild: visibleRef => children.add(visibleRef),
    unregisterChild: visibleRef => children.delete(visibleRef),
  })

  return { visible, selfMatch }
}
