import { settings } from '~/logic'
import api from '~/utils/api'

// Shared reactive cache of bvid -> tag name list
const videoTagCache = reactive(new Map<string, string[]>())
// Track in-flight requests to avoid duplicate fetches
const pendingFetches = new Set<string>()

async function fetchVideoTags(bvids: string[]): Promise<void> {
  const toFetch = bvids.filter(bvid => bvid && !videoTagCache.has(bvid) && !pendingFetches.has(bvid))
  if (toFetch.length === 0)
    return

  for (const bvid of toFetch)
    pendingFetches.add(bvid)

  await Promise.allSettled(
    toFetch.map(async (bvid) => {
      try {
        const res = await api.video.getVideoTags({ bvid })
        if (res?.code === 0 && Array.isArray(res.data)) {
          videoTagCache.set(bvid, res.data.map((t: any) => t.tag_name as string))
        }
      }
      catch {
        // ignore individual fetch errors
      }
      finally {
        pendingFetches.delete(bvid)
      }
    }),
  )
}

/**
 * Given a list of video items (each having a bvid), fetch video tags in the
 * background and return a reactive filtered list that removes videos whose tags
 * match any of the blocked tag keywords once tags are known.
 *
 * Videos are shown optimistically until their tags arrive.
 */
export function useVideoTagFilter<T>(
  videoList: Ref<T[]>,
  getBvid: (item: T) => string,
) {
  // Trigger background fetches whenever the list changes
  watch(
    videoList,
    (items: T[]) => {
      if (!settings.value.enableFilterByTag)
        return
      const bvids: string[] = [...new Set(items.map(getBvid).filter(b => !!b))]
      if (bvids.length > 0)
        fetchVideoTags(bvids)
    },
    { immediate: true },
  )

  const filteredList = computed<T[]>(() => {
    if (!settings.value.enableFilterByTag || settings.value.filterByTag.length === 0)
      return videoList.value

    // Pre-build match predicates from blocked keyword list
    const stringKeywords: string[] = []
    const regexKeywords: RegExp[] = []
    for (const entry of settings.value.filterByTag) {
      const kw = entry.keyword
      if (kw.startsWith('/') && kw.endsWith('/')) {
        regexKeywords.push(new RegExp(kw.slice(1, -1), 'i'))
      }
      else {
        stringKeywords.push(kw.toUpperCase())
      }
    }

    return videoList.value.filter((item) => {
      const bvid = getBvid(item)
      if (!bvid)
        return true // non-bvid items pass through
      const tags = videoTagCache.get(bvid)
      if (!tags)
        return true // not yet fetched — show optimistically

      // Block if ANY tag matches ANY blocked keyword
      const blocked = tags.some(tag =>
        stringKeywords.some(kw => tag.toUpperCase().includes(kw))
        || regexKeywords.some(rx => rx.test(tag)),
      )
      return !blocked
    })
  })

  return { filteredList }
}
