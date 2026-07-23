import { beforeEach, describe, expect, it, vi } from 'vitest'

import { enrichFavoriteSeasonMediaFaces } from '~/utils/favoriteSeason'

const mocks = vi.hoisted(() => ({
  getUserCard: vi.fn(),
}))

vi.mock('~/utils/api', () => ({
  default: {
    favorite: {
      getFavoriteSeasonResources: vi.fn(),
    },
    history: {
      getHistoryList: vi.fn(),
    },
    user: {
      getUserCard: mocks.getUserCard,
    },
  },
}))

describe('enrichFavoriteSeasonMediaFaces', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('fills missing upper.face by mid via user card api and caches', async () => {
    mocks.getUserCard.mockResolvedValue({
      code: 0,
      data: {
        card: {
          mid: '1',
          name: 'UP',
          face: 'https://i0.hdslb.com/bfs/face/demo.jpg',
        },
      },
    })

    const medias = [
      {
        id: 1,
        title: 'a',
        cover: '',
        duration: 1,
        pubtime: 1,
        bvid: 'BV1a',
        upper: { mid: 1, name: 'UP' },
        cnt_info: { collect: 0, play: 0, danmaku: 0, vt: 0 },
        enable_vt: 0,
        vt_display: '',
        is_self_view: false,
      },
      {
        id: 2,
        title: 'b',
        cover: '',
        duration: 1,
        pubtime: 1,
        bvid: 'BV1b',
        upper: { mid: 1, name: 'UP' },
        cnt_info: { collect: 0, play: 0, danmaku: 0, vt: 0 },
        enable_vt: 0,
        vt_display: '',
        is_self_view: false,
      },
    ]

    const enriched = await enrichFavoriteSeasonMediaFaces(medias)
    expect(enriched.every(item => item.upper.face === 'https://i0.hdslb.com/bfs/face/demo.jpg')).toBe(true)
    expect(mocks.getUserCard).toHaveBeenCalledTimes(1)

    // 缓存命中，不再请求
    await enrichFavoriteSeasonMediaFaces(medias)
    expect(mocks.getUserCard).toHaveBeenCalledTimes(1)
  })
})
