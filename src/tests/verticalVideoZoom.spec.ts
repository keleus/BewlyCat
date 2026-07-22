import { afterEach, describe, expect, it, vi } from 'vitest'

import { initVerticalVideoZoom, resetVerticalVideoZoom } from '~/utils/verticalVideoZoom'

vi.mock('~/utils/main', () => ({
  injectCSS: (css: string, element: HTMLElement | ShadowRoot = document.documentElement) => {
    const style = document.createElement('style')
    style.textContent = css
    element.appendChild(style)
    return style
  },
}))

vi.mock('~/utils/player', () => ({
  getVideoElement: () => null,
}))

const ZOOM_BUTTON_CLASS = 'bewly-vertical-video-zoom-button'

describe('vertical video zoom controls', () => {
  afterEach(() => {
    resetVerticalVideoZoom()
    vi.useRealTimers()

    document.querySelectorAll('style').forEach((style) => {
      if (style.textContent?.includes(ZOOM_BUTTON_CLASS))
        style.remove()
    })
  })

  it('anchors the button in the top-left corner to keep the native close button clear', () => {
    vi.useFakeTimers()
    initVerticalVideoZoom()

    const style = Array.from(document.querySelectorAll('style'))
      .find(element => element.textContent?.includes(ZOOM_BUTTON_CLASS))

    expect(style?.textContent).toMatch(
      new RegExp(`\\.${ZOOM_BUTTON_CLASS} \\{[\\s\\S]*?top: 12px !important;[\\s\\S]*?left: 12px !important;[\\s\\S]*?right: auto !important;`),
    )
  })
})
