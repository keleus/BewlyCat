import { describe, expect, it } from 'vitest'

import { isHomePage } from '~/utils/main'

describe('main utils', () => {
  describe('isHomePage', () => {
    it('treats Bilibili root and index.html as homepage', () => {
      expect(isHomePage('https://www.bilibili.com/')).toBe(true)
      expect(isHomePage('https://www.bilibili.com')).toBe(true)
      expect(isHomePage('https://www.bilibili.com/index.html')).toBe(true)
    })

    it('keeps index.html homepage matching when query or hash is present', () => {
      expect(isHomePage('https://www.bilibili.com/index.html?spm_id_from=333.1007')).toBe(true)
      expect(isHomePage('https://www.bilibili.com/index.html#/')).toBe(true)
    })

    it('does not treat non-home Bilibili pages as homepage', () => {
      expect(isHomePage('https://www.bilibili.com/video/BV123')).toBe(false)
      expect(isHomePage('https://search.bilibili.com/all?keyword=test')).toBe(false)
      expect(isHomePage('ftp://www.bilibili.com/')).toBe(false)
    })
  })
})
