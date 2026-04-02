const MAX_PREVIEW_VIDEO_CACHE = 3

interface VideoPreviewCacheEntry {
  active: boolean
  release: () => void
}

const videoPreviewCacheEntries = new Map<symbol, VideoPreviewCacheEntry>()

function moveVideoPreviewCacheEntryToRecent(key: symbol, entry: VideoPreviewCacheEntry) {
  videoPreviewCacheEntries.delete(key)
  videoPreviewCacheEntries.set(key, entry)
}

function trimVideoPreviewCache() {
  while (videoPreviewCacheEntries.size > MAX_PREVIEW_VIDEO_CACHE) {
    const oldestInactiveEntry = Array.from(videoPreviewCacheEntries.entries()).find(([, entry]) => !entry.active)
    const nextEntry = oldestInactiveEntry ?? videoPreviewCacheEntries.entries().next().value as [symbol, VideoPreviewCacheEntry] | undefined

    if (!nextEntry)
      return

    const [key, entry] = nextEntry
    videoPreviewCacheEntries.delete(key)
    entry.release()
  }
}

export function retainVideoPreviewCacheEntry(key: symbol, release: () => void, active: boolean) {
  moveVideoPreviewCacheEntryToRecent(key, { release, active })
  trimVideoPreviewCache()
}

export function releaseVideoPreviewCacheEntry(key: symbol) {
  videoPreviewCacheEntries.delete(key)
}
