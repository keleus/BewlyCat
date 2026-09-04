import type { InjectionKey, Ref } from 'vue'
import { inject, onBeforeUnmount, provide, reactive, ref } from 'vue'

type TabSnapshot = Record<string, unknown>

/** The cache owns JSON data only, never component instances, refs or DOM nodes. */
export function createHomeTabCache() {
  const snapshots = new Map<string, TabSnapshot>()
  let generation = 0
  return {
    get generation() { return generation },
    take(key: string) {
      const snapshot = snapshots.get(key)
      snapshots.delete(key)
      return snapshot
    },
    save(key: string, snapshot: TabSnapshot, version: number) {
      if (version === generation)
        snapshots.set(key, JSON.parse(JSON.stringify(snapshot)))
    },
    clear() {
      generation++
      snapshots.clear()
    },
  }
}

interface HomeTabCacheContext {
  cache: ReturnType<typeof createHomeTabCache>
  activeKey: () => string
  restoreScroll: () => void
}

const homeTabCacheKey: InjectionKey<HomeTabCacheContext> = Symbol('home-tab-data-cache')

export function provideHomeTabCache(activeKey: () => string, restoreScroll: () => void) {
  const cache = createHomeTabCache()
  provide(homeTabCacheKey, { cache, activeKey, restoreScroll })
  return cache
}

const homeTabStateKey: InjectionKey<HomeTabState> = Symbol('home-tab-state')

/** Register only durable data. Loading flags, requests, timers and DOM refs stay local. */
export function useHomeTabState() {
  const context = inject(homeTabCacheKey, undefined)
  const ownerKey = context?.activeKey() ?? ''
  const generation = context?.cache.generation ?? 0
  const snapshot = context?.cache.take(ownerKey)
  const fields = new Map<string, () => unknown>()
  let disposed = false

  function read<T>(key: string, initial: T): T {
    return snapshot && Object.hasOwn(snapshot, key) ? snapshot[key] as T : initial
  }
  function capture(key: string, getValue: () => unknown) {
    fields.set(key, getValue)
    return () => {
      if (disposed || fields.get(key) !== getValue)
        return
      const value = JSON.parse(JSON.stringify({ value: getValue() })).value
      fields.set(key, () => value)
    }
  }
  function isActiveTab() {
    return !context || (context.activeKey() === ownerKey && context.cache.generation === generation)
  }
  function isCurrent() {
    return !disposed && isActiveTab()
  }

  const state = {
    enabled: !!context,
    restored: !!snapshot,
    read,
    take<T>(key: string, initial: T): T {
      const value = read(key, initial)
      if (snapshot)
        delete snapshot[key]
      return value
    },
    capture,
    isCurrent,
    isActiveTab,
    ref<T>(key: string, initial: T): Ref<T> {
      const value = ref(read(key, initial)) as Ref<T>
      capture(key, () => value.value)
      return value
    },
    reactive<T extends object>(key: string, initial: T): T {
      const value = reactive(read(key, initial)) as T
      capture(key, () => value)
      return value
    },
    restoreScroll() {
      if (isCurrent())
        context?.restoreScroll()
    },
  }
  provide(homeTabStateKey, state)
  onBeforeUnmount(() => {
    disposed = true
    if (context)
      context.cache.save(ownerKey, Object.fromEntries([...fields].map(([key, getValue]) => [key, getValue()])), generation)
    fields.clear()
  })
  return state
}

export type HomeTabState = ReturnType<typeof useHomeTabState>

/** Grids contribute only measured sizes and data-only interaction state. */
export function useHomeTabViewState() {
  return inject(homeTabStateKey, undefined)
}
