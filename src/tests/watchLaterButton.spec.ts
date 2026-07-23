import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addWatchLaterButton, extractVideoIds } from '~/utils/watchLaterButton'

const mocks = vi.hoisted(() => ({
  getAllWatchLaterList: vi.fn(),
  getVideoInfo: vi.fn(),
  getTopBarWatchLaterList: vi.fn(),
  removeFromWatchLater: vi.fn(),
  saveToWatchLater: vi.fn(),
}))

vi.mock('~/utils/api', () => ({
  default: {
    video: {
      getVideoInfo: mocks.getVideoInfo,
    },
    watchlater: {
      getAllWatchLaterList: mocks.getAllWatchLaterList,
      removeFromWatchLater: mocks.removeFromWatchLater,
      saveToWatchLater: mocks.saveToWatchLater,
    },
  },
}))

vi.mock('~/utils/main', () => ({
  getCSRF: () => 'csrf-token',
}))

vi.mock('~/stores/topBarStore', () => ({
  useTopBarStore: () => ({
    getAllWatchLaterList: mocks.getTopBarWatchLaterList,
  }),
}))

vi.mock('~/utils/i18n', () => ({
  i18n: {
    global: {
      t: (key: string) => ({
        'common.add_to_watch_later': '添加到稍后再看',
        'common.added_to_watch_later': '已添加到稍后再看',
        'common.remove_from_watch_later': '从稍后再看中移除',
      })[key] || key,
    },
  },
}))

function mountToolbar() {
  document.body.innerHTML = '<div class="video-toolbar"><div class="video-tool-more"></div></div>'
}

function getButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('.bewly-watch-later-btn')
  if (!button)
    throw new Error('Watch later button was not mounted')
  return button
}

describe('external watch later button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    history.replaceState({}, '', '/video/BV1Test12345')
    mountToolbar()
    mocks.getAllWatchLaterList.mockResolvedValue({
      code: 0,
      data: { count: 0, list: [] },
    })
    mocks.getVideoInfo.mockResolvedValue({ code: 0, data: { aid: 123 } })
    mocks.saveToWatchLater.mockResolvedValue({ code: 0 })
    mocks.removeFromWatchLater.mockResolvedValue({ code: 0 })
  })

  it('extracts video identifiers from paths and collection query parameters', () => {
    expect(extractVideoIds('https://www.bilibili.com/video/BV1Test12345?p=2')).toEqual({ bvid: 'BV1Test12345' })
    expect(extractVideoIds('https://www.bilibili.com/video/av12345')).toEqual({ aid: 12345 })
    expect(extractVideoIds('https://www.bilibili.com/list/ml123?bvid=BV1List12345')).toEqual({ bvid: 'BV1List12345' })
    expect(extractVideoIds('https://www.bilibili.com/list/ml123?avid=67890')).toEqual({ aid: 67890 })
    expect(extractVideoIds('https://www.bilibili.com/list/ml123?aid=54321')).toEqual({ aid: 54321 })
    expect(extractVideoIds('https://www.bilibili.com/')).toEqual({})
  })

  it('highlights an existing item and removes it when clicked', async () => {
    mocks.getAllWatchLaterList.mockResolvedValue({
      code: 0,
      data: {
        count: 1,
        list: [{ aid: 456, bvid: 'BV1Test12345' }],
      },
    })

    expect(addWatchLaterButton()).toBe(true)
    const button = getButton()

    await vi.waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'))
    expect(button.classList.contains('is-active')).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.textContent).toContain('已添加到稍后再看')

    button.click()

    await vi.waitFor(() => expect(mocks.removeFromWatchLater).toHaveBeenCalledWith({
      aid: 456,
      csrf: 'csrf-token',
    }))
    expect(button.classList.contains('is-active')).toBe(false)
    expect(button.textContent).toContain('添加到稍后再看')
  })

  it('adds an item, then resolves its aid so a second click can remove it', async () => {
    expect(addWatchLaterButton()).toBe(true)
    const button = getButton()
    await vi.waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'))

    button.click()
    await vi.waitFor(() => expect(mocks.saveToWatchLater).toHaveBeenCalledWith({
      bvid: 'BV1Test12345',
      csrf: 'csrf-token',
    }))
    expect(button.getAttribute('aria-pressed')).toBe('true')

    button.click()
    await vi.waitFor(() => expect(mocks.removeFromWatchLater).toHaveBeenCalledWith({
      aid: 123,
      csrf: 'csrf-token',
    }))
    expect(mocks.getVideoInfo).toHaveBeenCalledWith({ bvid: 'BV1Test12345' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('replaces a stale button after in-page navigation to another video', async () => {
    expect(addWatchLaterButton()).toBe(true)
    const previousButton = getButton()
    await vi.waitFor(() => expect(previousButton.getAttribute('aria-busy')).toBe('false'))

    history.replaceState({}, '', '/video/av789')
    expect(addWatchLaterButton()).toBe(true)

    const currentButton = getButton()
    expect(currentButton).not.toBe(previousButton)
    expect(previousButton.isConnected).toBe(false)
    expect(currentButton.dataset.videoKey).toBe('av789')
  })

  it('uses the current collection item when the stale button is clicked before being rebuilt', async () => {
    expect(addWatchLaterButton()).toBe(true)
    const staleButton = getButton()
    await vi.waitFor(() => expect(staleButton.getAttribute('aria-busy')).toBe('false'))

    history.replaceState({}, '', '/list/ml123?bvid=BV1Current6789')
    staleButton.click()

    await vi.waitFor(() => expect(mocks.saveToWatchLater).toHaveBeenCalledWith({
      bvid: 'BV1Current6789',
      csrf: 'csrf-token',
    }))
    expect(mocks.saveToWatchLater).not.toHaveBeenCalledWith({
      bvid: 'BV1Test12345',
      csrf: 'csrf-token',
    })

    const currentButton = getButton()
    expect(currentButton).not.toBe(staleButton)
    expect(staleButton.isConnected).toBe(false)
    expect(currentButton.dataset.videoKey).toBe('BV1Current6789')
  })
})
