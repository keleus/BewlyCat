import { useMutationObserver, useResizeObserver } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { isComponentVisible } from '~/utils/topBarBadge'

import { pinnedChannelMinimumWidth, validPinnedChannelKeys } from './usePinnedChannels'

const layoutTargetSelector = '[data-top-bar-switcher-natural], [data-top-bar-switcher-compact], [data-top-bar-expanded], [data-top-bar-more], [data-top-bar-login-natural]'

export function useTopBarSpace(header: Ref<HTMLElement | null>, searchActive: Ref<boolean>, editing: Ref<boolean>) {
  const { locale } = useI18n()
  const pinnedWidth = ref(0)
  const compact = ref(false)
  const compactSearch = ref(false)
  const fixed = ref<HTMLElement | null>(null)
  const right = ref<HTMLElement | null>(null)
  const measuredTargets = shallowRef<HTMLElement[]>([])
  let others: HTMLElement | null = null
  let naturalSwitcher: HTMLElement | null = null
  let compactSwitcher: HTMLElement | null = null
  let groups: HTMLElement[] = []
  let more: HTMLElement | null = null
  let login: HTMLElement | null = null
  let frame = 0
  let disposed = false
  function schedule() {
    if (disposed || frame)
      return
    frame = requestAnimationFrame(measure)
  }
  function measure() {
    frame = 0
    const el = header.value
    if (!el || !fixed.value || !right.value)
      return
    const style = getComputedStyle(el)
    const width = el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
    const gap = Number.parseFloat(style.columnGap) || 0
    const preferred = Number.parseFloat(style.getPropertyValue('--bew-top-bar-search-preferred-width')) || 320
    const minimum = Number.parseFloat(style.getPropertyValue('--bew-top-bar-search-min-width')) || 240
    const collapsedWidth = Number.parseFloat(style.getPropertyValue('--bew-top-bar-pinned-collapsed-width')) || 96
    const controlHeight = Number.parseFloat(style.getPropertyValue('--bew-control-height')) || 34
    const loginPadding = Number.parseFloat(style.getPropertyValue('--bew-space-4')) || 16
    const hasPinned = editing.value || (isComponentVisible('pinnedChannels') && validPinnedChannelKeys.value.length > 0)
    const normalPinnedWidth = hasPinned ? (pinnedChannelMinimumWidth.value ?? collapsedWidth) : 0
    const logoGap = Number.parseFloat(getComputedStyle(fixed.value.parentElement!).columnGap) || 0
    const fixedWidth = fixed.value.getBoundingClientRect().width
    const rightWidth = right.value.getBoundingClientRect().width
    const naturalSwitcherWidth = naturalSwitcher?.getBoundingClientRect().width ?? 0
    const compactSwitcherWidth = compactSwitcher?.getBoundingClientRect().width ?? 0
    const rightGap = others ? Number.parseFloat(getComputedStyle(others).columnGap) || 0 : 0
    const moreWidth = more?.getBoundingClientRect().width ?? 0
    const naturalFixed = fixedWidth + (compactSwitcherWidth ? naturalSwitcherWidth - compactSwitcherWidth : 0)
    const loginExtra = compact.value && login ? login.getBoundingClientRect().width + loginPadding * 2 - controlHeight : 0
    // Editing exposes every action in a separate wrapping row.
    const naturalRight = editing.value
      ? 0
      : rightWidth + loginExtra + (compact.value
        ? groups.reduce((sum, group) => sum + group.getBoundingClientRect().width + rightGap, 0) - (moreWidth ? moreWidth + rightGap : 0)
        : 0)
    const columnGaps = gap * (editing.value ? 1 : 2)
    const normalRoom = width - naturalFixed - naturalRight - columnGaps - normalPinnedWidth - (hasPinned ? logoGap : 0)
    const shouldCompact = normalRoom < (searchActive.value ? minimum : 0) + (compact.value ? 4 : 0)
    if (compact.value !== shouldCompact) {
      compact.value = shouldCompact
      void nextTick(schedule)
      return
    }
    const remaining = width - fixedWidth - (editing.value ? 0 : rightWidth) - columnGaps - (hasPinned ? logoGap : 0)
    const minPinned = hasPinned ? (compact.value ? controlHeight : normalPinnedWidth) : 0
    compactSearch.value = searchActive.value && remaining - minPinned < minimum
    pinnedWidth.value = hasPinned
      ? Math.max(minPinned, remaining - (searchActive.value ? preferred : 0))
      : 0
  }
  function refreshTargets() {
    fixed.value = header.value?.querySelector('[data-top-bar-fixed]') ?? null
    right.value = header.value?.querySelector('.right-side') ?? null
    others = right.value?.querySelector('.others') ?? null
    naturalSwitcher = fixed.value?.querySelector('[data-top-bar-switcher-natural]') ?? null
    compactSwitcher = fixed.value?.querySelector('[data-top-bar-switcher-compact]') ?? null
    groups = Array.from(right.value?.querySelectorAll<HTMLElement>('[data-top-bar-expanded]') ?? [])
    more = right.value?.querySelector('[data-top-bar-more]') ?? null
    login = right.value?.querySelector('[data-top-bar-login-natural]') ?? null
    measuredTargets.value = [naturalSwitcher, compactSwitcher, ...groups, more, login].filter((el): el is HTMLElement => !!el)
    schedule()
  }
  useResizeObserver(header, schedule)
  useResizeObserver(fixed, schedule)
  useResizeObserver(right, schedule)
  // Hidden natural-size groups can resize without changing their parent.
  useResizeObserver(measuredTargets, schedule)
  useMutationObserver(computed(() => [fixed.value, right.value]), (records) => {
    // Popovers, badge text and search suggestions do not change layout targets.
    const changed = records.some((record) => {
      if (record.target instanceof Element && record.target.closest('.bew-popover'))
        return false
      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node =>
        node instanceof Element && !node.matches('.bew-popover')
        && (node.matches(layoutTargetSelector) || node.querySelector(layoutTargetSelector)),
      )
    })
    if (changed)
      refreshTargets()
  }, { childList: true, subtree: true })
  watch([locale, searchActive, editing, () => validPinnedChannelKeys.value.length, pinnedChannelMinimumWidth, () => isComponentVisible('pinnedChannels')], schedule)
  onMounted(() => {
    refreshTargets()
    void document.fonts.ready.then(schedule)
    document.fonts.addEventListener('loadingdone', schedule)
  })
  onBeforeUnmount(() => {
    disposed = true
    cancelAnimationFrame(frame)
    document.fonts.removeEventListener('loadingdone', schedule)
  })
  return { pinnedWidth, compact, compactSearch }
}
