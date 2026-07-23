import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Business } from '~/models/history/history'
import {
  buildFavoriteSeasonEntryUrl,
  buildFavoriteSeasonListPlayUrl,
  resolveFavoriteSeasonPlayAllUrl,
} from '~/utils/favoriteSeason'

const mocks = vi.hoisted(() => ({
  getFavoriteSeasonResources: vi.fn(),
  getHistoryList: vi.fn(),
}))

vi.mock('~/utils/api', () => ({
  default: {
    favorite: {
      getFavoriteSeasonResources: mocks.getFavoriteSeasonResources,
    },
    history: {
      getHistoryList: mocks.getHistoryList,
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

  it('resolves latest mode to the last media', async () => {
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
      mode: 'latest',
    })).resolves.toBe('https://www.bilibili.com/list/season/42?bvid=BV1Latest&oid=3')

    expect(mocks.getFavoriteSeasonResources).toHaveBeenCalledTimes(2)
    expect(mocks.getHistoryList).not.toHaveBeenCalled()
  })

  it('resolves lastWatched mode from recent archive history', async () => {
    mocks.getFavoriteSeasonResources.mockResolvedValueOnce({
      code: 0,
      data: {
        info: { media_count: 2 },
        medias: [
          { id: 1, bvid: 'BV1Old', title: 'old' },
          { id: 2, bvid: 'BV1Watched', title: 'watched' },
        ],
      },
    })
    mocks.getHistoryList.mockResolvedValueOnce({
      code: 0,
      data: {
        list: [
          {
            view_at: 200,
            history: { business: Business.ARCHIVE, bvid: 'BV1Other', oid: 999 },
          },
          {
            view_at: 100,
            history: { business: Business.ARCHIVE, bvid: 'BV1Watched', oid: 2 },
          },
        ],
      },
    })

    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      mode: 'lastWatched',
    })).resolves.toBe('https://www.bilibili.com/list/season/42?bvid=BV1Watched&oid=2')
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
      mode: 'latest',
    })).resolves.toBe('https://www.bilibili.com/video/av100')
  })

  it('keeps the default entry url for beginning mode', async () => {
    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      mode: 'beginning',
    })).resolves.toBe('https://www.bilibili.com/video/av100')

    expect(mocks.getFavoriteSeasonResources).not.toHaveBeenCalled()
  })
})
