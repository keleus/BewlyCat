import { settings } from '~/logic'
import api from '~/utils/api'

interface UpInfo {
  fans: number
  level: number
}

// Shared reactive cache of mid -> UpInfo
const upInfoCache = reactive(new Map<number, UpInfo>())
// Track in-flight requests to avoid duplicate fetches
const pendingFetches = new Set<number>()

async function fetchUpInfo(mids: number[]): Promise<void> {
  const toFetch = mids.filter(mid => mid > 0 && !upInfoCache.has(mid) && !pendingFetches.has(mid))
  if (toFetch.length === 0)
    return

  for (const mid of toFetch)
    pendingFetches.add(mid)

  // Fetch individually — bilibili card API does not support batch for other users
  await Promise.allSettled(
    toFetch.map(async (mid) => {
      try {
        const res = await api.user.getUpCardInfo({ mid })
        if (res?.code === 0 && res.data?.card) {
          upInfoCache.set(mid, {
            fans: res.data.follower ?? res.data.card?.fans ?? 0,
            level: res.data.card?.level_info?.current_level ?? 0,
          })
        }
      }
      catch {
        // ignore individual fetch errors
      }
      finally {
        pendingFetches.delete(mid)
      }
    }),
  )
}

/**
 * Given a list of video items (each having owner.mid), fetch UP info in the
 * background and return a reactive filtered list that removes videos whose UP's
 * fans count is below the threshold once UP info is known.
 */
export function useUpInfoFilter<T>(
  videoList: Ref<T[]>,
  getMid: (item: T) => number,
) {
  // Trigger background fetches whenever the list changes
  watch(
    videoList,
    (items: T[]) => {
      if (!settings.value.enableFilterByUpFansCount)
        return
      const mids: number[] = [...new Set(items.map(getMid).filter(m => m > 0))]
      if (mids.length > 0)
        fetchUpInfo(mids)
    },
    { immediate: true },
  )

  const filteredList = computed<T[]>(() => {
    if (!settings.value.enableFilterByUpFansCount)
      return videoList.value

    const threshold = settings.value.filterByUpFansCount
    return videoList.value.filter((item) => {
      const mid = getMid(item)
      if (mid <= 0)
        return true // non-user items pass through
      const info = upInfoCache.get(mid)
      if (!info)
        return true // not yet fetched — show optimistically
      return info.fans >= threshold
    })
  })

  return { filteredList }
}
