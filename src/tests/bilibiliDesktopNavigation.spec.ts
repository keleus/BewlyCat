import { describe, expect, it } from 'vitest'

import {
  isBilibiliWwwUrl,
  isPreventMobileRedirectEnabled,
} from '~/utils/bilibiliDesktopNavigation'

describe('bilibili desktop navigation', () => {
  it('only recognizes www navigation URLs', () => {
    expect(isBilibiliWwwUrl('https://www.bilibili.com/video/BV1xx')).toBe(true)
    expect(isBilibiliWwwUrl('https://m.bilibili.com/video/BV1xx')).toBe(false)
    expect(isBilibiliWwwUrl('https://space.bilibili.com/1')).toBe(false)
    expect(isBilibiliWwwUrl('not-a-url')).toBe(false)
  })

  it('keeps the compatibility setting disabled by default', () => {
    expect(isPreventMobileRedirectEnabled(undefined)).toBe(false)
    expect(isPreventMobileRedirectEnabled({})).toBe(false)
    expect(isPreventMobileRedirectEnabled({ preventMobileRedirect: false })).toBe(false)
    expect(isPreventMobileRedirectEnabled({ preventMobileRedirect: true })).toBe(true)
    expect(isPreventMobileRedirectEnabled('{"preventMobileRedirect":true}')).toBe(true)
  })
})
