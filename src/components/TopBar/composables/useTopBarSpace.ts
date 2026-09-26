import { useMutationObserver, useResizeObserver } from '@vueuse/core'
import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { isComponentVisible } from '~/utils/topBarBadge'

import { validPinnedChannelKeys } from './usePinnedChannels'

export function useTopBarSpace(header: Ref<HTMLElement | null>, searchActive: Ref<boolean>, editing: Ref<boolean>) {
  const { locale } = useI18n()
  const pinnedWidth = ref(0)
  const compact = ref(false)
  const compactSearch = ref(false)
  const fixed = ref<HTMLElement | null>(null)
  const right = ref<HTMLElement | null>(null)
  let frame = 0
  let disposed = false
  function schedule() {
    if (disposed)
      return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }
  function measure() {
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
    const logoGap = Number.parseFloat(getComputedStyle(fixed.value.parentElement!).columnGap) || 0
    const fixedWidth = fixed.value.getBoundingClientRect().width
    const rightWidth = right.value.getBoundingClientRect().width
    const naturalSwitcher = el.querySelector<HTMLElement>('[data-top-bar-switcher-natural]')?.getBoundingClientRect().width ?? 0
    const compactSwitcher = el.querySelector<HTMLElement>('[data-top-bar-switcher-compact]')?.getBoundingClientRect().width ?? 0
    const groups = Array.from(el.querySelectorAll<HTMLElement>('[data-top-bar-expanded]'))
    const rightGap = Number.parseFloat(getComputedStyle(right.value.querySelector('.others')!).columnGap) || 0
    const moreWidth = el.querySelector<HTMLElement>('[data-top-bar-more]')?.getBoundingClientRect().width ?? 0
    const naturalFixed = fixedWidth + (compactSwitcher ? naturalSwitcher - compactSwitcher : 0)
    const login = el.querySelector<HTMLElement>('[data-top-bar-login-natural]')
    const loginExtra = compact.value && login ? login.getBoundingClientRect().width + loginPadding * 2 - controlHeight : 0
    const naturalRight = rightWidth + loginExtra + (compact.value
      ? groups.reduce((sum, group) => sum + group.getBoundingClientRect().width + rightGap, 0) - (moreWidth ? moreWidth + rightGap : 0)
      : 0)
    const normalRoom = width - naturalFixed - naturalRight - gap * 2 - (hasPinned ? collapsedWidth + logoGap : 0)
    const shouldCompact = normalRoom < (searchActive.value ? minimum : 0) + (compact.value ? 4 : 0)
    if (compact.value !== shouldCompact) {
      compact.value = shouldCompact
      void nextTick(schedule)
      return
    }
    const remaining = width - fixedWidth - rightWidth - gap * 2 - (hasPinned ? logoGap : 0)
    const minPinned = hasPinned ? (compact.value ? controlHeight : collapsedWidth) : 0
    compactSearch.value = searchActive.value && remaining - minPinned < minimum
    pinnedWidth.value = hasPinned
      ? Math.max(0, remaining - (searchActive.value ? preferred : 0))
      : 0
  }
  function refreshTargets() {
    fixed.value = header.value?.querySelector('[data-top-bar-fixed]') ?? null
    right.value = header.value?.querySelector('.right-side') ?? null
    schedule()
  }
  useResizeObserver(header, schedule)
  useResizeObserver(fixed, schedule)
  useResizeObserver(right, schedule)
  useMutationObserver(header, refreshTargets, { childList: true, subtree: true })
  watch([locale, searchActive, editing, validPinnedChannelKeys, () => settings.value.topBarComponentsConfig], schedule, { deep: true })
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
