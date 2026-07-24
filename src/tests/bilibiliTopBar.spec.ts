import { beforeEach, describe, expect, it } from 'vitest'

import { captureOriginalBilibiliTopBar, ensureOriginalBilibiliTopBarAppended, setOriginalBilibiliTopBarScrolled } from '~/utils/bilibiliTopBar'

describe('b 站原版顶栏滚动状态', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <header class="bili-header">
        <div class="bili-header__bar">
          <ul class="left-entry">
            <li>
              <a class="entry-title">
                <svg class="zhuzhan-icon"></svg>
                <span>首页</span>
              </a>
            </li>
          </ul>
        </div>
        <div class="bili-header__banner">
          <a class="inner-logo"><img src="//example.com/bilibili-logo.png"></a>
        </div>
        <div class="bili-header__channel" style="display: none"></div>
      </header>
      <div class="header-channel" style="display: none">
        <div class="header-channel-fixed">
          <div class="header-channel-fixed-left"></div>
          <div class="header-channel-fixed-right">
            <a class="header-channel-fixed-right-item">番剧</a>
          </div>
          <button class="header-channel-fixed-arrow"></button>
        </div>
      </div>
    `
    captureOriginalBilibiliTopBar(document)
  })

  it('捕获后保留顶部状态并准备完整下拉结构', () => {
    expect(document.querySelector('.bili-header')?.classList.contains('bewly-original-top-bar-scrolled')).toBe(false)
    expect(document.querySelector('.bili-header__bar')?.classList.contains('slide-down')).toBe(false)
    expect(document.querySelector<HTMLImageElement>('.bewly-bili-logo-entry img')?.src).toContain('bilibili-logo.png')
    expect(document.querySelector('.entry-title .bewly-home-entry-arrow')).not.toBeNull()
    expect(document.querySelectorAll('.bewly-bili-channel-panel .channel-panel__column')).toHaveLength(5)
    expect(document.querySelectorAll('.bewly-bili-channel-panel .channel-panel__icon').length).toBeGreaterThan(0)
    expect(document.querySelector('body > .header-channel')).not.toBeNull()
    expect(document.querySelector('.bili-header > .header-channel')).toBeNull()
  })

  it('在 B 站脚本移除下拉类名后自动恢复', async () => {
    const bar = document.querySelector('.bili-header__bar')
    setOriginalBilibiliTopBarScrolled(document, true)
    bar?.classList.remove('slide-down')
    await Promise.resolve()

    expect(bar?.classList.contains('slide-down')).toBe(true)
  })

  it('跟随 BewlyCat 滚动位置切换下拉样式', () => {
    const header = document.querySelector('.bili-header')
    const bar = document.querySelector('.bili-header__bar')

    setOriginalBilibiliTopBarScrolled(document, true)
    expect(header?.classList.contains('bewly-original-top-bar-scrolled')).toBe(true)
    expect(bar?.classList.contains('slide-down')).toBe(true)
    expect(document.querySelector('.header-channel')?.classList.contains('bewly-original-fixed-channel-visible')).toBe(true)

    setOriginalBilibiliTopBarScrolled(document, false)
    expect(header?.classList.contains('bewly-original-top-bar-scrolled')).toBe(false)
    expect(bar?.classList.contains('slide-down')).toBe(false)
    expect(document.querySelector('.header-channel')?.classList.contains('bewly-original-fixed-channel-visible')).toBe(false)
  })

  it('保留原版顶栏的分区面板供悬浮样式控制', () => {
    ensureOriginalBilibiliTopBarAppended(document)

    expect(document.querySelector<HTMLElement>('.bili-header__banner')?.style.display).toBe('none')
    expect(document.querySelector<HTMLElement>('.bili-header__channel')?.style.display).toBe('')
  })

  it('由兼容层控制下拉后的分区面板展开', () => {
    ensureOriginalBilibiliTopBarAppended(document)
    const header = document.querySelector('.bili-header')
    const nativePopover = document.createElement('div')
    nativePopover.className = 'v-popover is-bottom-start'
    nativePopover.innerHTML = '<div class="bili-header-channel-panel"></div>'
    header?.appendChild(nativePopover)
    const home = document.createElement('a')
    home.className = 'entry-title'
    header?.querySelector('.bili-header__bar')?.appendChild(home)

    setOriginalBilibiliTopBarScrolled(document, true)
    home.dispatchEvent(new Event('pointerover', { bubbles: true }))

    expect(header?.classList.contains('bewly-original-channel-open')).toBe(true)
    expect(nativePopover.classList.contains('bewly-original-native-channel-open')).toBe(true)
    expect(header?.querySelector('.bewly-home-entry-arrow')?.classList.contains('arrow-up')).toBe(true)

    setOriginalBilibiliTopBarScrolled(document, false)
    expect(header?.classList.contains('bewly-original-channel-open')).toBe(false)
    expect(nativePopover.classList.contains('bewly-original-native-channel-open')).toBe(false)
    expect(header?.querySelector('.bewly-home-entry-arrow')?.classList.contains('arrow-up')).toBe(false)
  })

  it('下滑状态下恢复被 B 站脚本隐藏的第一行顶栏', async () => {
    const header = document.querySelector<HTMLElement>('.bili-header')
    const bar = document.querySelector<HTMLElement>('.bili-header__bar')
    setOriginalBilibiliTopBarScrolled(document, true)

    header!.style.display = 'none'
    bar!.style.visibility = 'hidden'
    bar!.style.opacity = '0'
    await Promise.resolve()

    expect(header?.style.display).toBe('')
    expect(bar?.style.visibility).toBe('')
    expect(bar?.style.opacity).toBe('')
    expect(bar?.classList.contains('slide-down')).toBe(true)
  })

  it('原版顶栏始终保留在 Vue 管理的父节点中', () => {
    const header = document.querySelector('.bili-header')
    const originalParent = header?.parentElement

    ensureOriginalBilibiliTopBarAppended(document)

    expect(header?.parentElement).toBe(originalParent)
  })

  it('b 站替换顶栏节点后恢复当前滚动状态', async () => {
    setOriginalBilibiliTopBarScrolled(document, true)
    const oldHeader = document.querySelector<HTMLElement>('.bili-header')
    const newHeader = oldHeader?.cloneNode(true) as HTMLElement
    newHeader.classList.remove('bewly-original-top-bar-scrolled')
    newHeader.querySelector('.bili-header__bar')?.classList.remove('slide-down')
    oldHeader?.replaceWith(newHeader)
    await Promise.resolve()

    expect(newHeader.classList.contains('bewly-original-top-bar-scrolled')).toBe(true)
    expect(newHeader.querySelector('.bili-header__bar')?.classList.contains('slide-down')).toBe(true)
  })
})
