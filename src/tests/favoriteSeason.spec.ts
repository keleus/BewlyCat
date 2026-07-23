import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildFavoriteSeasonEntryUrl,
  buildFavoriteSeasonListPlayUrl,
  resolveFavoriteSeasonPlayAllUrl,
} from '~/utils/favoriteSeason'

const mocks = vi.hoisted(() => ({
  getFavoriteSeasonResources: vi.fn(),
}))

vi.mock('~/utils/api', () => ({
  default: {
    favorite: {
      getFavoriteSeasonResources: mocks.getFavoriteSeasonResources,
    },
  },
}))

describe('favoriteSeason utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds entry urls from bilibili deep links or season fallback', () => {
    expect(buildFavoriteSeasonEntryUrl(123)).toBe('https://www.bilibili.com/list/season/123')
    expect(buildFavoriteSeasonEntryUrl(123, 'bilibili://video/456789')).toBe('https://www.bilibili.com/video/av456789')
    expect(buildFavoriteSeasonEntryUrl(123, 'bilibili://video/456789?from=fav')).toBe('https://www.bilibili.com/video/av456789?from=fav')
  })

  it('builds list play urls with bvid and optional oid', () => {
    expect(buildFavoriteSeasonListPlayUrl(99, 'BV1Latest')).toBe('https://www.bilibili.com/list/season/99?bvid=BV1Latest')
    expect(buildFavoriteSeasonListPlayUrl(99, 'BV1Latest', 888)).toBe('https://www.bilibili.com/list/season/99?bvid=BV1Latest&oid=888')
  })

  it('resolves play-all to the last media when playFromLatest is enabled', async () => {
    mocks.getFavoriteSeasonResources
      .mockResolvedValueOnce({
        code: 0,
        data: {
          info: { media_count: 3 },
          medias: [
            { id: 1, bvid: 'BV1Old', title: 'old' },
            { id: 2, bvid: 'BV1Mid', title: 'mid' },
          ],
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          info: { media_count: 3 },
          medias: [
            { id: 3, bvid: 'BV1Latest', title: 'latest' },
          ],
        },
      })

    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      playFromLatest: true,
    })).resolves.toBe('https://www.bilibili.com/list/season/42?bvid=BV1Latest&oid=3')

    expect(mocks.getFavoriteSeasonResources).toHaveBeenCalledTimes(2)
  })

  it('falls back to entry url when pagination fails mid-way instead of using a partial last item', async () => {
    mocks.getFavoriteSeasonResources
      .mockResolvedValueOnce({
        code: 0,
        data: {
          info: { media_count: 80 },
          medias: Array.from({ length: 40 }, (_, index) => ({
            id: index + 1,
            bvid: `BV1Page1_${index}`,
            title: `p1-${index}`,
          })),
        },
      })
      .mockResolvedValueOnce({
        code: -1,
        data: null,
      })

    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      playFromLatest: true,
    })).resolves.toBe('https://www.bilibili.com/video/av100')
  })

  it('keeps the default entry url when playFromLatest is disabled', async () => {
    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      playFromLatest: false,
    })).resolves.toBe('https://www.bilibili.com/video/av100')

    expect(mocks.getFavoriteSeasonResources).not.toHaveBeenCalled()
  })
})
