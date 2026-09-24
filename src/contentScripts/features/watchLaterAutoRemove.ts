import { settings } from '~/logic'
import { markWatchLater } from '~/logic/watchLaterState'
import type { VideoInfo } from '~/models/video/videoInfo'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'
import { getVideoElement, isPlayerShowingAdvertisement, isWatchLaterVideo } from '~/utils/player'
import { extractVideoIds } from '~/utils/watchLaterButton'

export function setupWatchLaterAutoRemove() {
  const pending = new Set<string>()
  const handled = new WeakMap<HTMLVideoElement, string>()

  // 同一媒体节点可被播放器复用于下一集，也可重新播放刚移除后又添加的视频。
  window.addEventListener('playing', (event) => {
    const video = getVideoElement()
    if (video && event.target === video && !video.ended)
      handled.delete(video)
  }, true)

  window.addEventListener('ended', (event) => {
    const video = getVideoElement()
    if (!settings.value.autoRemoveWatchLaterOnEnd
      || !isWatchLaterVideo()
      || !video
      || event.target !== video
      || !video.ended
      || video.seeking
      || !Number.isFinite(video.duration)
      || video.duration <= 0
      || video.currentTime < video.duration - 1
      || isPlayerShowingAdvertisement()) {
      return
    }

    // 在 window 捕获阶段固定视频标识，早于原生连播和自定义顺序切集；
    // 异步查询返回后不能再从 URL 取 ID，否则可能删除正在播放的下一条。
    const url = new URL(location.href)
    const ids = extractVideoIds(url.href)
    const accountId = getUserID()
    const csrf = getCSRF()
    if ((!ids.bvid && !ids.aid) || !accountId || !csrf)
      return

    const page = Number(url.searchParams.get('p') || 1)
    const cid = Number(url.searchParams.get('cid') || 0)
    const duration = video.duration
    const key = `${accountId}:${ids.bvid || ids.aid}:${page}:${cid}:${video.currentSrc}`
    if (pending.has(key) || handled.get(video) === key)
      return

    pending.add(key)
    handled.set(video, key)

    const canRemove = () => settings.value.autoRemoveWatchLaterOnEnd
      && getUserID() === accountId && getCSRF() === csrf

    async function removeFinishedVideo() {
      try {
        const result: VideoInfo = await api.video.getVideoInfo({
          bvid: ids.bvid,
          aid: ids.aid ? String(ids.aid) : undefined,
        })
        if (result.code !== 0)
          throw new Error(result.message || String(result.code))

        const info = result.data
        if (!canRemove()
          || !Number.isSafeInteger(info?.aid) || info.aid <= 0
          || (ids.bvid && info.bvid !== ids.bvid)
          || (ids.aid && info.aid !== ids.aid)) {
          return
        }

        const pages = info.pages
        const lastPage = pages?.at(-1)
        // 无法确认分 P 信息时不移除。时长校验也会排除贴片广告或试看结束。
        if (!lastPage || pages.length !== info.videos
          || (cid ? cid !== lastPage.cid : page !== lastPage.page)
          || Math.abs(lastPage.duration - duration) > 2) {
          return
        }

        const removed = await api.watchlater.removeFromWatchLater({ aid: info.aid, csrf })
        if (removed.code !== 0)
          throw new Error(removed.message || String(removed.code))

        if (getUserID() !== accountId)
          return

        markWatchLater({ aid: info.aid, bvid: info.bvid }, false)
        // 删除接口存在短暂的最终一致性，稍后刷新顶栏列表及跨标签页计数。
        window.setTimeout(() => {
          if (getUserID() === accountId) {
            void useTopBarStore().syncWatchLaterState(true).catch((error) => {
              console.error('刷新稍后再看列表失败:', error)
            })
          }
        }, 1000)
      }
      catch (error) {
        if (handled.get(video!) === key)
          handled.delete(video!)
        console.error('播放结束自动移除稍后再看失败:', error)
      }
      finally {
        pending.delete(key)
      }
    }

    void removeFinishedVideo()
  }, true)
}
