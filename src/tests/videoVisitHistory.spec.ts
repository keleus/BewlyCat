import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getVideoIdentityFromUrl,
  pruneVideoVisitHistory,
  recordVideoVisitFromUrl,
  VIDEO_VISIT_HISTORY_MAX_ENTRIES,
  VIDEO_VISIT_HISTORY_RETENTION_MS,
  wasVideoVisitedRecently,
} from '~/utils/videoVisitHistory'

const mocks = vi.hoisted(() => ({
  storage: {
    value: {} as Record<string, number>,
  },
}))

vi.mock('~/composables/useStorageLocal', () => ({
  useStorageLocal: (_key: string, _initialValue: unknown, options?: { onReady?: (value: Record<string, number>) => void }) => {
    options?.onReady?.(mocks.storage.value)
    return mocks.storage
  },
}))

describe('video visit history', () => {
  beforeEach(() => {
    mocks.storage.value = {}
  })

  it('extracts video identifiers from playback URLs', () => {
    expect(getVideoIdentityFromUrl('https://www.bilibili.com/video/BV1TestVideo')).toEqual({
      bvid: 'BV1TestVideo',
    })
    expect(getVideoIdentityFromUrl('https://www.bilibili.com/video/av123')).toEqual({
      aid: 123,
      id: 123,
    })
    expect(getVideoIdentityFromUrl('https://www.bilibili.com/list/ml456?bvid=BV1ListVideo')).toEqual({
      bvid: 'BV1ListVideo',
    })
    expect(getVideoIdentityFromUrl('https://www.bilibili.com/video/av123?bvid=BV1Preferred')).toEqual({
      bvid: 'BV1Preferred',
    })
    expect(getVideoIdentityFromUrl('https://www.bilibili.com/bangumi/play/ep789')).toBeUndefined()
    expect(getVideoIdentityFromUrl('https://example.com/video/BV1TestVideo')).toBeUndefined()
  })

  it('records a visit after reaching a video URL', () => {
    const visitedAt = 1_800_000_000_000

    expect(recordVideoVisitFromUrl('https://www.bilibili.com/video/BV1TestVideo', visitedAt)).toBe(true)
    expect(mocks.storage.value).toEqual({
      'bv:bv1testvideo': visitedAt,
    })
    expect(wasVideoVisitedRecently({ id: 123, bvid: 'BV1TestVideo' }, visitedAt)).toBe(true)
  })

  it('expires and removes records older than one month', () => {
    const now = 1_800_000_000_000
    const expiredAt = now - VIDEO_VISIT_HISTORY_RETENTION_MS - 1
    mocks.storage.value = {
      'av:1': expiredAt,
      'av:2': now,
    }

    expect(wasVideoVisitedRecently({ id: 1, aid: 1 }, now)).toBe(false)
    expect(pruneVideoVisitHistory(mocks.storage.value, now)).toEqual({
      'av:2': now,
    })
  })

  it('keeps only the 1000 most recent visits', () => {
    const now = 1_800_000_000_000
    const history = Object.fromEntries(
      Array.from({ length: VIDEO_VISIT_HISTORY_MAX_ENTRIES + 2 }, (_, index) => [
        `av:${index + 1}`,
        now - index,
      ]),
    )

    const prunedHistory = pruneVideoVisitHistory(history, now)

    expect(Object.keys(prunedHistory)).toHaveLength(VIDEO_VISIT_HISTORY_MAX_ENTRIES)
    expect(prunedHistory['av:1']).toBe(now)
    expect(prunedHistory[`av:${VIDEO_VISIT_HISTORY_MAX_ENTRIES + 2}`]).toBeUndefined()
  })
})
