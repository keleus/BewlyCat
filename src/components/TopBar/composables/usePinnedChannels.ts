import { computed, shallowRef } from 'vue'

import { settings } from '~/logic'

import { allChannelConfigs } from '../constants/channels'

const knownKeys = new Set(allChannelConfigs.map(channel => channel.key))

export const validPinnedChannelKeys = computed(() => [...new Set(settings.value.topBarPinnedChannels ?? [])]
  .filter(key => knownKeys.has(key)))

// Measured by the channel strip; null until mounted (or while hidden).
export const pinnedChannelMinimumWidth = shallowRef<number | null>(null)

// Runtime layout only: resizing must never change the saved selection/order.
export const pinnedChannelLayout = shallowRef<{
  visibleKeys: string[]
  overflowKeys: string[]
  collapsed: boolean
} | null>(null)

export function getPinnedVisibleCount(width: number, itemWidths: number[], moreWidths: number[], gap: number, inset: number, previousCount: number): number {
  let prefixWidth = itemWidths.reduce((sum, item) => sum + item, 0)
  for (let count = itemWidths.length; count > 0; count--) {
    const hidden = itemWidths.length - count
    const slots = count + (hidden > 0 ? 1 : 0)
    const required = inset + prefixWidth
      + (hidden > 0 ? moreWidths[hidden] : 0) + Math.max(0, slots - 1) * gap
    if (required + (count > previousCount ? 4 : 0) <= width)
      return count
    prefixWidth -= itemWidths[count - 1]
  }
  return 0
}
