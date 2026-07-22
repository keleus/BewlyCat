import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setUselessFeedCardBlockerEnabled } from '~/contentScripts/features/blockUselessFeedCards'

const BLOCKED_FEED_CARD_CLASS = 'bewly-blocked-feed-card'

async function flushCardUpdates() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useless homepage feed card blocker', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    document.body.replaceChildren()
  })

  afterEach(() => {
    setUselessFeedCardBlockerEnabled(false)
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('marks the outer feed card when recommendation classes are attached asynchronously', async () => {
    const feedCard = document.createElement('div')
    feedCard.className = 'feed-card'

    const videoCard = document.createElement('div')
    videoCard.className = 'bili-video-card'
    feedCard.append(videoCard)
    document.body.append(feedCard)

    setUselessFeedCardBlockerEnabled(true)
    expect(feedCard.classList.contains(BLOCKED_FEED_CARD_CLASS)).toBe(false)

    videoCard.classList.add('is-rcmd')
    await flushCardUpdates()

    expect(feedCard.classList.contains(BLOCKED_FEED_CARD_CLASS)).toBe(true)
  })

  it('removes the outer marker when a card stops matching', async () => {
    const feedCard = document.createElement('div')
    feedCard.className = 'feed-card'

    const videoCard = document.createElement('div')
    videoCard.className = 'bili-video-card is-rcmd'
    feedCard.append(videoCard)
    document.body.append(feedCard)

    setUselessFeedCardBlockerEnabled(true)
    expect(feedCard.classList.contains(BLOCKED_FEED_CARD_CLASS)).toBe(true)

    videoCard.classList.add('enable-no-interest')
    await flushCardUpdates()

    expect(feedCard.classList.contains(BLOCKED_FEED_CARD_CLASS)).toBe(false)
  })
})
