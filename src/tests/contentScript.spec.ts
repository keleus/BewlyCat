import { describe, expect, it } from 'vitest'

import { CONTENT_SCRIPT_MATCHES, isContentScriptTargetUrl } from '~/constants/contentScript'

describe('content script configuration', () => {
  it('keeps the generated manifest matches aligned with supported hosts', () => {
    expect(CONTENT_SCRIPT_MATCHES).toEqual([
      '*://www.bilibili.com/*',
      '*://search.bilibili.com/*',
      '*://t.bilibili.com/*',
      '*://space.bilibili.com/*',
      '*://message.bilibili.com/*',
      '*://member.bilibili.com/*',
      '*://account.bilibili.com/*',
      '*://www.hdslb.com/*',
      '*://passport.bilibili.com/*',
      '*://music.bilibili.com/*',
    ])
  })

  it('accepts URLs covered by the manifest content scripts', () => {
    expect(isContentScriptTargetUrl('https://www.bilibili.com/')).toBe(true)
    expect(isContentScriptTargetUrl('http://search.bilibili.com/all?keyword=test')).toBe(true)
    expect(isContentScriptTargetUrl('https://space.bilibili.com/123')).toBe(true)
  })

  it('rejects excluded, unrelated, and invalid URLs', () => {
    expect(isContentScriptTargetUrl('https://www.bilibili.com/match/game/123')).toBe(false)
    expect(isContentScriptTargetUrl('https://www.bilibili.com/toy/foo')).toBe(false)
    expect(isContentScriptTargetUrl('https://manga.bilibili.com/detail/123')).toBe(false)
    expect(isContentScriptTargetUrl('https://www.bilibili.com.example.com/')).toBe(false)
    expect(isContentScriptTargetUrl('ftp://www.bilibili.com/')).toBe(false)
    expect(isContentScriptTargetUrl('not a url')).toBe(false)
  })
})
