import { computed, shallowRef } from 'vue'

import { settings } from '~/logic'

import { allChannelConfigs } from '../constants/channels'

const knownKeys = new Set(allChannelConfigs.map(channel => channel.key))

export const validPinnedChannelKeys = computed(() => [...new Set(settings.value.topBarPinnedChannels ?? [])]
  .filter(key => knownKeys.has(key)))

// Runtime layout only: resizing must never change the saved selection/order.
export const pinnedChannelLayout = shallowRef<{
  visibleKeys: string[]
  overflowKeys: string[]
  collapsed: boolean
} | null>(null)

export function getPinnedVisibleCount(width: number, itemWidths: number[], moreWidths: number[], gap: number, inset: number, previousCount: number): number {
  const fits = (count: number) => {
    const hidden = itemWidths.length - count
    const slots = count + (hidden > 0 ? 1 : 0)
    const required = inset + itemWidths.slice(0, count).reduce((sum, item) => sum + item, 0)
      + (hidden > 0 ? moreWidths[hidden] : 0) + Math.max(0, slots - 1) * gap
    return required + (count > previousCount ? 4 : 0) <= width
  }
  for (let count = itemWidths.length; count > 0; count--) {
    if (fits(count))
      return count
  }
  return 0
}
