import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/logic', () => ({
  settings: { value: { collectedSeasonPlayAllMode: 'latest' } },
}))

vi.mock('~/utils/main', () => ({
  openLinkToNewTab: vi.fn(),
}))

vi.mock('~/utils/favoriteSeason', () => ({
  resolveFavoriteSeasonPlayAllUrl: vi.fn(async () => ({
    url: 'https://www.bilibili.com/video/BV1Latest/',
    usedFallback: false,
    reason: 'resolved',
  })),
}))

describe('nativeFavoriteSeasonPlayAll', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
  })

  it('detects collected season favlist urls', async () => {
    const {
      isCollectedSeasonFavlistUrl,
      getSeasonIdFromFavlistUrl,
    } = await import('~/utils/nativeFavoriteSeasonPlayAll')

    expect(isCollectedSeasonFavlistUrl(
      'https://space.bilibili.com/3691001111644519/favlist?fid=4052670&ftype=collect&ctype=21',
    )).toBe(true)

    expect(isCollectedSeasonFavlistUrl(
      'https://space.bilibili.com/123/favlist?fid=1&ftype=create',
    )).toBe(false)

    expect(isCollectedSeasonFavlistUrl(
      'https://www.bilibili.com/video/BV1xx',
    )).toBe(false)

    expect(getSeasonIdFromFavlistUrl(
      'https://space.bilibili.com/1/favlist?fid=4052670&ftype=collect&ctype=21',
    )).toBe(4052670)

    expect(getSeasonIdFromFavlistUrl(
      'https://space.bilibili.com/1/favlist?ftype=collect',
    )).toBeNull()
  })

  it('recognizes collection play-all button targets', async () => {
    const { isNativeSeasonPlayAllTarget } = await import('~/utils/nativeFavoriteSeasonPlayAll')

    document.body.innerHTML = `
      <div class="favInfo-box">
        <div class="collection-details">
          <a class="collection-btn" href="https://www.bilibili.com/video/BV1mvKU6NE8S">播放全部</a>
        </div>
        <div class="favInfo-details">
          <div class="fav-options">
            <a class="fav-play" href="#">播放全部</a>
          </div>
        </div>
      </div>
    `

    const seasonBtn = document.querySelector('.collection-btn')!
    const folderBtn = document.querySelector('.fav-play')!

    expect(isNativeSeasonPlayAllTarget(seasonBtn)).toBe(true)
    expect(isNativeSeasonPlayAllTarget(folderBtn)).toBe(false)
  })
})
