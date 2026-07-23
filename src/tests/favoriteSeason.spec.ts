import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Business } from '~/models/history/history'
import {
  buildFavoriteSeasonEntryUrl,
  buildFavoriteSeasonVideoUrl,
  FAVORITE_SEASON_PAGE_SIZE,
  mergeFavoriteSeasonPage,
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
    vi.resetAllMocks()
  })

  it('builds entry urls from bilibili deep links or video bvid', () => {
    expect(buildFavoriteSeasonEntryUrl(123)).toBe('https://www.bilibili.com/list/season/123')
    expect(buildFavoriteSeasonEntryUrl(123, 'bilibili://video/456789')).toBe('https://www.bilibili.com/video/av456789')
    expect(buildFavoriteSeasonEntryUrl(123, 'bilibili://video/456789?from=fav')).toBe('https://www.bilibili.com/video/av456789?from=fav')
    expect(buildFavoriteSeasonEntryUrl(123, undefined, 'BV1Entry')).toBe('https://www.bilibili.com/video/BV1Entry/')
  })

  it('builds play urls as normal video pages', () => {
    expect(buildFavoriteSeasonVideoUrl('BV1Latest')).toBe('https://www.bilibili.com/video/BV1Latest/')
  })

  it('mergeFavoriteSeasonPage stops when API returns a full dump', () => {
    const pageMedias = Array.from({ length: 80 }, (_, index) => ({
      id: index + 1,
      bvid: `BV${index}`,
      title: `${index}`,
      cover: '',
      duration: 1,
      pubtime: index,
      upper: { mid: 1, name: '' },
      cnt_info: { collect: 0, play: 0, danmaku: 0, vt: 0 },
      enable_vt: 0,
      vt_display: '',
      is_self_view: false,
    }))

    const merged = mergeFavoriteSeasonPage({
      pn: 1,
      pageMedias,
      mediaCount: 80,
      previousMedias: [],
      pageSize: FAVORITE_SEASON_PAGE_SIZE,
    })

    expect(merged.hasMore).toBe(false)
    expect(merged.medias).toHaveLength(80)
  })

  it('resolves latest mode to the last media', async () => {
    mocks.getFavoriteSeasonResources
      .mockResolvedValueOnce({
        code: 0,
        data: {
          info: { media_count: 42 },
          medias: Array.from({ length: 40 }, (_, index) => ({
            id: index + 1,
            bvid: `BV1Page1_${index}`,
            title: `p1-${index}`,
          })),
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          info: { media_count: 42 },
          medias: [
            { id: 41, bvid: 'BV1Almost', title: 'almost' },
            { id: 42, bvid: 'BV1Latest', title: 'latest' },
          ],
        },
      })

    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      mode: 'latest',
    })).resolves.toEqual({
      url: 'https://www.bilibili.com/video/BV1Latest/',
      usedFallback: false,
      reason: 'resolved',
    })

    expect(mocks.getFavoriteSeasonResources).toHaveBeenCalledTimes(2)
    expect(mocks.getHistoryList).not.toHaveBeenCalled()
  })

  it('stops after one request when API ignores ps and returns the full season every page', async () => {
    const fullList = Array.from({ length: 80 }, (_, index) => ({
      id: index + 1,
      bvid: `BV1Full_${index}`,
      title: `full-${index}`,
    }))
    mocks.getFavoriteSeasonResources.mockResolvedValue({
      code: 0,
      data: {
        info: { media_count: 80 },
        medias: fullList,
      },
    })

    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      mode: 'latest',
    })).resolves.toMatchObject({
      url: 'https://www.bilibili.com/video/BV1Full_79/',
      usedFallback: false,
    })

    expect(mocks.getFavoriteSeasonResources).toHaveBeenCalledTimes(1)
  })

  it('reuses preloaded medias when count matches even if complete flag is false', async () => {
    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      mode: 'latest',
      preloaded: {
        complete: false,
        expectedCount: 2,
        medias: [
          { id: 1, bvid: 'BV1Old', title: 'old' } as any,
          { id: 2, bvid: 'BV1Latest', title: 'latest' } as any,
        ],
      },
    })).resolves.toMatchObject({
      url: 'https://www.bilibili.com/video/BV1Latest/',
      usedFallback: false,
    })

    expect(mocks.getFavoriteSeasonResources).not.toHaveBeenCalled()
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
    })).resolves.toMatchObject({
      url: 'https://www.bilibili.com/video/BV1Watched/',
      usedFallback: false,
    })
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
    })).resolves.toEqual({
      url: 'https://www.bilibili.com/video/av100',
      usedFallback: true,
      reason: 'incomplete',
    })
  })

  it('keeps the default entry url for beginning mode', async () => {
    await expect(resolveFavoriteSeasonPlayAllUrl({
      seasonId: 42,
      link: 'bilibili://video/100',
      mode: 'beginning',
    })).resolves.toEqual({
      url: 'https://www.bilibili.com/video/av100',
      usedFallback: false,
      reason: 'beginning',
    })

    expect(mocks.getFavoriteSeasonResources).not.toHaveBeenCalled()
  })
})
