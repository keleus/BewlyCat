import { watch } from 'vue'

import { settings } from '~/logic'
import api from '~/utils/api'
import { i18n } from '~/utils/i18n'
import { isVideoOrBangumiPage, isVideoPlaybackPage } from '~/utils/main'

import type { ListenVideoController } from './listenVideoControl'
import { schedulePlayerControlFit } from './playerControlFit'

let controller: ListenVideoController | undefined
let pending: Promise<ListenVideoController | undefined> | undefined
let revision = 0
let initialized = false

function isPlaybackPage() {
  return isVideoPlaybackPage() || isVideoOrBangumiPage()
}

function canLoad() {
  return settings.value.enableListenVideo && isPlaybackPage()
}

function loadController() {
  if (!canLoad())
    return Promise.resolve(undefined)
  if (controller)
    return Promise.resolve(controller)
  if (pending)
    return pending

  const currentRevision = revision
  // 独立 ESM 入口：IIFE 中的普通动态 import 会被内联，无法做到关闭时不加载。
  const moduleUrl = browser.runtime.getURL('dist/contentScripts/listenVideoControl.js')
  const request = import(/* @vite-ignore */ moduleUrl).then((module: typeof import('./listenVideoControl')) => {
    if (currentRevision !== revision || !canLoad())
      return undefined
    controller = module.initListenVideoControl({
      getSettings: () => settings.value,
      translate: key => String(i18n.global.t(key, settings.value.language)),
      getVideoInfo: bvid => api.video.getVideoInfo({ bvid }),
      isPlaybackPage,
      schedulePlayerControlFit,
    })
    return controller
  }).catch((error) => {
    console.error('[BewlyCat] 听视频模块加载失败:', error)
    return undefined
  }).finally(() => {
    if (pending === request)
      pending = undefined
  })
  pending = request
  return request
}

function stopController() {
  revision++
  pending = undefined
  controller?.dispose()
  controller = undefined
}

function syncPage() {
  // history 通知在 URL 更新前触发。
  queueMicrotask(() => {
    if (canLoad())
      void loadController()
    else
      stopController()
  })
}

const pageEvents = ['pushstate', 'replacestate', 'popstate', 'hashchange', 'pageshow'] as const

export function initListenVideoFeature() {
  if (initialized || location.hostname === 'live.bilibili.com')
    return
  initialized = true
  watch(() => settings.value.enableListenVideo, (enabled) => {
    pageEvents.forEach(event => window.removeEventListener(event, syncPage))
    window.removeEventListener('pagehide', stopController)
    if (enabled) {
      pageEvents.forEach(event => window.addEventListener(event, syncPage))
      window.addEventListener('pagehide', stopController)
      syncPage()
    }
    else {
      stopController()
    }
  }, { immediate: true, flush: 'sync' })
  watch([() => settings.value.showListenVideoButton, () => settings.value.language], () => {
    controller?.refresh()
  })
}

export async function toggleListenVideo() {
  if (!canLoad())
    return
  const loaded = await loadController()
  if (loaded === controller && canLoad())
    loaded?.toggle()
}
