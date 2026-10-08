import type { ListenVideoHost } from '~/contentScripts/listenVideoControl'
import type { VideoInfo } from '~/models/video/videoInfo'

export function createListenVideoMode(host: ListenVideoHost, onChange: () => void) {
  const LISTENING_CLASS = 'bewly-player-listening'
  const OVERLAY_CLASS = 'bewly-listen-video-overlay'
  const PLAYER_ROOT_SELECTOR = '.bpx-player-container, .bilibili-player, #bilibili-player, .squirtle-video-wrap'
  // 与 touchPlayerGestures 保持一致的视频区域选择器，兼容新旧播放器。
  const VIDEO_AREA_SELECTOR = '.bpx-player-video-area, .bilibili-player-video-wrap, .squirtle-video-wrap'
  const COVER_SIZE_SUFFIX = '@672w_378h_1c_!web-home-common-cover'
  // 与播放器工具 _videoClassTag.danmuBtn 保持一致的弹幕开关选择器
  const DANMAKU_SWITCH_SELECTOR = '.bilibili-player-video-danmaku-switch > input[type=checkbox],.bpx-player-dm-switch input[type=checkbox]'

  // 占位音符与控制栏图标同为 88 网格面性图形，通过 currentColor 跟随文字颜色
  const musicNoteIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" style="width: 100%; height: 100%;">
    <path d="M30 18 66 14v12L30 30Zm0 8h8v30h-8Zm28-4h8v34h-8Z" fill="currentColor"/>
    <ellipse cx="30" cy="58" rx="13" ry="9" transform="rotate(-18 30 58)" fill="currentColor"/>
    <ellipse cx="58" cy="58" rx="13" ry="9" transform="rotate(-18 58 58)" fill="currentColor"/>
  </svg>`

  // 仅存于内存：同一标签页内的 SPA 跳转保持听视频状态，刷新页面后回到正常模式。
  let listenActive = false
  let disposed = false
  let metaRequestId = 0
  // 进入听视频前弹幕是否开启；退出时据此恢复，进入前本就关闭则保持关闭。
  let danmakuWasEnabled: boolean | null = null
  let lastMetaKey = ''
  let lastMetaOverlay: HTMLElement | null = null

  function translate(key: string): string {
    return host.translate(key)
  }

  function isListenVideoModeActive(): boolean {
    return listenActive
  }

  function findPlayerRoot(): HTMLElement | null {
    const area = findVideoArea()
    return area?.closest<HTMLElement>(PLAYER_ROOT_SELECTOR) ?? area
  }

  function findVideoArea(): HTMLElement | null {
    return document.querySelector<HTMLElement>(VIDEO_AREA_SELECTOR)
  }

  function findOverlay(): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.${OVERLAY_CLASS}`)
  }

  function createOverlay(): HTMLElement {
    const overlay = document.createElement('div')
    overlay.className = OVERLAY_CLASS

    const album = document.createElement('div')
    album.className = 'bewly-listen-video-album'
    album.classList.add('bewly-listen-video-cover-missing')

    const cover = document.createElement('img')
    cover.className = 'bewly-listen-video-cover'
    cover.alt = ''
    cover.decoding = 'async'
    cover.addEventListener('error', () => album.classList.add('bewly-listen-video-cover-missing'))

    const fallback = document.createElement('div')
    fallback.className = 'bewly-listen-video-cover-fallback'
    fallback.innerHTML = musicNoteIcon

    album.append(cover, fallback)

    const info = document.createElement('div')
    info.className = 'bewly-listen-video-info'

    const title = document.createElement('div')
    title.className = 'bewly-listen-video-title'

    const owner = document.createElement('div')
    owner.className = 'bewly-listen-video-owner'

    const badge = document.createElement('div')
    badge.className = 'bewly-listen-video-badge'

    const equalizer = document.createElement('span')
    equalizer.className = 'bewly-listen-video-equalizer'
    equalizer.setAttribute('aria-hidden', 'true')
    equalizer.innerHTML = '<i></i><i></i><i></i>'

    const badgeText = document.createElement('span')
    badgeText.className = 'bewly-listen-video-badge-text'
    badgeText.textContent = translate('player_listen.listening')

    badge.append(equalizer, badgeText)
    info.append(title, owner, badge)
    overlay.append(album, info)
    return overlay
  }

  function readDomTitle(): string {
    const heading = document.querySelector<HTMLElement>('.video-info-title, h1.video-title')
    const headingText = heading?.textContent?.trim()
    if (headingText)
      return headingText

    // 番剧等页面没有 h1 标题节点，退回 document.title 并去掉站点后缀
    return document.title.replace(/_哔哩哔哩.*$/, '').trim()
  }

  function parseBvidFromLocation(): string {
    const fromPath = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)
    if (fromPath?.[1])
      return fromPath[1]

    return new URLSearchParams(location.search).get('bvid') ?? ''
  }

  function applyTitleText(title: HTMLElement, text: string) {
    title.textContent = text
  }

  function findDanmakuSwitch(): HTMLInputElement | null {
    return document.querySelector<HTMLInputElement>(DANMAKU_SWITCH_SELECTOR)
  }

  // 与 applyDefaultDanmakuState 相同的切换方式：优先点击原生开关，保持 B 站自身的弹幕状态持久化
  function setDanmakuEnabled(enabled: boolean): boolean {
    const danmakuSwitch = findDanmakuSwitch()
    if (!danmakuSwitch)
      return false

    if (danmakuSwitch.checked === enabled)
      return true

    const clickableParent = danmakuSwitch.closest('label')
      || (danmakuSwitch.parentElement instanceof HTMLElement ? danmakuSwitch.parentElement : null)
    if (clickableParent)
      clickableParent.click()
    else
      danmakuSwitch.click()

    if (danmakuSwitch.checked !== enabled) {
      danmakuSwitch.checked = enabled
      danmakuSwitch.dispatchEvent(new Event('change', { bubbles: true }))
    }

    return danmakuSwitch.checked === enabled
  }

  // 进入听视频时真正关闭弹幕（而非仅遮挡）；开关不存在时交由 CSS 隐藏兜底
  function pauseDanmakuForListenMode() {
    const danmakuSwitch = findDanmakuSwitch()
    if (!danmakuSwitch)
      return

    danmakuWasEnabled ??= danmakuSwitch.checked
    setDanmakuEnabled(false)
  }

  function restoreDanmakuAfterListenMode() {
    if (danmakuWasEnabled !== null)
      setDanmakuEnabled(danmakuWasEnabled)
    danmakuWasEnabled = null
  }

  function updateListenVideoMeta() {
    const overlay = findOverlay()
    if (!overlay)
      return

    const key = `${location.href}:${host.getSettings().language}`
    if (lastMetaKey === key && lastMetaOverlay === overlay)
      return
    lastMetaKey = key
    lastMetaOverlay = overlay
    const requestId = ++metaRequestId
    const album = overlay.querySelector<HTMLElement>('.bewly-listen-video-album')
    const cover = overlay.querySelector<HTMLImageElement>('.bewly-listen-video-cover')
    const title = overlay.querySelector<HTMLElement>('.bewly-listen-video-title')
    const owner = overlay.querySelector<HTMLElement>('.bewly-listen-video-owner')

    // 同步部分：先用页面 DOM 标题占位，接口返回后再补全封面、UP 主与准确标题。
    if (title)
      applyTitleText(title, readDomTitle())

    if (owner)
      owner.textContent = ''
    album?.classList.add('bewly-listen-video-cover-missing')
    cover?.removeAttribute('src')
    const badge = overlay.querySelector<HTMLElement>('.bewly-listen-video-badge-text')
    if (badge)
      badge.textContent = translate('player_listen.listening')
    const bvid = parseBvidFromLocation()
    if (!bvid || !album || !cover || !title || !owner)
      return

    host.getVideoInfo(bvid).then((res: VideoInfo) => {
      // 过期响应（已切换视频或退出听视频）不再应用
      if (requestId !== metaRequestId || !overlay.isConnected || res.code !== 0)
        return

      const data = res.data
      if (!data?.title)
        return

      applyTitleText(title, data.title)
      owner.textContent = data.owner?.name ?? ''
      if (data.pic) {
        album.classList.remove('bewly-listen-video-cover-missing')
        cover.src = `${data.pic.replace(/^https?:/, '')}${COVER_SIZE_SUFFIX}`
      }
      else {
        album.classList.add('bewly-listen-video-cover-missing')
      }
    }).catch(() => {
      // 拉取失败时保留 DOM 标题与音符占位图
    })
  }

  function applyListenMode(): boolean {
    const area = findVideoArea()
    if (!area)
      return false

    const playerRoot = area.closest<HTMLElement>(PLAYER_ROOT_SELECTOR) ?? findPlayerRoot()
    playerRoot?.classList.add(LISTENING_CLASS)

    const existingOverlay = findOverlay()
    if (existingOverlay?.parentElement !== area) {
      existingOverlay?.remove()
      area.appendChild(createOverlay())
    }

    updateListenVideoMeta()
    return true
  }

  function exitListenMode() {
    document.querySelectorAll(`.${LISTENING_CLASS}`).forEach(root => root.classList.remove(LISTENING_CLASS))
    document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach(overlay => overlay.remove())
  }

  function dispatchListenChange() {
    onChange()
  }

  function toggleListenVideoMode() {
    if (disposed)
      return
    if (listenActive) {
      listenActive = false
      metaRequestId++
      lastMetaKey = ''
      lastMetaOverlay = null
      exitListenMode()
      restoreDanmakuAfterListenMode()
    }
    else {
      if (!host.getSettings().enableListenVideo || !host.isPlaybackPage())
        return
      // 原生画中画只显示 video 帧，先回到页面播放器再展示听视频界面。
      if (document.pictureInPictureElement) {
        void document.exitPictureInPicture().then(() => {
          if (!listenActive && host.getSettings().enableListenVideo)
            toggleListenVideoMode()
        }).catch(() => {})
        return
      }
      // 播放器尚未就绪（如快捷键误触）时不进入听视频状态
      listenActive = applyListenMode()
      if (listenActive)
        pauseDanmakuForListenMode()
    }
    dispatchListenChange()
  }

  // SPA 跳转或播放器重建后，把内存中的听视频状态重新同步到当前播放器 DOM。
  function ensureListenVideoModeSynced() {
    if (!listenActive)
      return

    applyListenMode()
    pauseDanmakuForListenMode()
  }

  function dispose() {
    if (listenActive)
      toggleListenVideoMode()
    metaRequestId++
    disposed = true
  }

  return {
    isActive: isListenVideoModeActive,
    toggle: toggleListenVideoMode,
    sync: ensureListenVideoModeSynced,
    needsSync: () => listenActive && (findDanmakuSwitch()?.checked
      || !findPlayerRoot()?.classList.contains(LISTENING_CLASS)),
    refreshMeta: () => {
      lastMetaKey = ''
      ensureListenVideoModeSynced()
    },
    dispose,
  }
}
