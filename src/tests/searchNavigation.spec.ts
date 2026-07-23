import { describe, expect, it } from 'vitest'

import { getPluginSearchResultsUrl } from '~/utils/searchNavigation'

describe('native search navigation', () => {
  it('routes native all-search links to the built-in results page', () => {
    expect(getPluginSearchResultsUrl('https://search.bilibili.com/all?keyword=%E7%8C%AB%E5%92%AA'))
      .toBe('https://www.bilibili.com/?page=SearchResults&keyword=%E7%8C%AB%E5%92%AA')
  })

  it('routes links with extra tracking parameters without carrying them over', () => {
    expect(getPluginSearchResultsUrl('https://search.bilibili.com/all?keyword=tag&from_source=video_tag'))
      .toBe('https://www.bilibili.com/?page=SearchResults&keyword=tag')
  })

  it('preserves a supported native search category', () => {
    expect(getPluginSearchResultsUrl('https://search.bilibili.com/video?keyword=Vue'))
      .toBe('https://www.bilibili.com/?page=SearchResults&keyword=Vue&category=video')
    expect(getPluginSearchResultsUrl('https://search.bilibili.com/upuser?keyword=BewlyCat'))
      .toBe('https://www.bilibili.com/?page=SearchResults&keyword=BewlyCat&category=user')
  })

  it('ignores keyword-less, unrelated, and malformed URLs', () => {
    expect(getPluginSearchResultsUrl('https://search.bilibili.com/all')).toBeNull()
    expect(getPluginSearchResultsUrl('https://www.bilibili.com/?keyword=test')).toBeNull()
    expect(getPluginSearchResultsUrl('not a url')).toBeNull()
  })
})
