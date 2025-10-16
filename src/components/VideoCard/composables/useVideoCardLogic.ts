import type { CSSProperties } from 'vue'
import { useToast } from 'vue-toastification'

import { useBewlyApp } from '~/composables/useAppProvider'
import { appAuthTokens, settings } from '~/logic'
import type { VideoInfo } from '~/models/video/videoInfo'
import type { VideoPreviewResult } from '~/models/video/videoPreview'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getTvSign, TVAppKey } from '~/utils/authProvider'
import { calcCurrentTime, numFormatter, parseStatNumber } from '~/utils/dataFormatter'
import { getCSRF, removeHttpFromUrl } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'

import type { Video } from '../types'
import { getCurrentTime, getCurrentVideoUrl } from '../utils'

interface VideoCardProps {
  skeleton?: boolean
  video?: Video
  type?: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'
  showWatcherLater?: boolean
  horizontal?: boolean
  showPreview?: boolean
  moreBtn?: boolean
}

export function useVideoCardLogic(props: VideoCardProps) {
  const toast = useToast()
  const { openIframeDrawer } = useBewlyApp()
  const topBarStore = useTopBarStore()

  // Refs
  const showVideoOptions = ref<boolean>(false)
  const videoOptionsFloatingStyles = ref<CSSProperties>({})
  const removed = ref<boolean>(false)
  const moreBtnRef = ref<HTMLDivElement | null>(null)
  const contextMenuRef = ref<HTMLDivElement | null>(null)
  const selectedDislikeOpt = ref<{ dislikeReasonId: number }>()
  const videoCurrentTime = ref<number | null>(null)
  const isInWatchLater = ref<boolean>(false)
  const isHover = ref<boolean>(false)
  const mouseEnterTimeOut = ref<number | null>(null)
  const mouseLeaveTimeOut = ref<number | null>(null)
  const previewVideoUrl = ref<string>('')
  const contentVisibility = ref<'auto' | 'visible'>('auto')
  const videoElement = ref<HTMLVideoElement | null>(null)
  const cardRootRef = ref<HTMLElement | null>(null)
  const cardWidth = ref<number>(0)
  let cardResizeObserver: ResizeObserver | null = null

  // Computed
  const videoUrl = computed(() => {
    if (removed.value || !props.video)
      return undefined

    let url = ''
    if (props.video.url)
      url = props.video.url
    else if (props.video.bvid || props.video.aid)
      url = getCurrentVideoUrl(props.video, videoCurrentTime)
    else if (props.video.epid)
      url = `https://www.bilibili.com/bangumi/play/ep${props.video.epid}/`
    else if (props.video.roomid)
      url = `https://live.bilibili.com/${props.video.roomid}/`
    else
      return ''

    try {
      const urlObj = new URL(url)
      if (!urlObj.pathname.endsWith('/')) {
        urlObj.pathname += '/'
      }
      return urlObj.toString()
    }
    catch {
      return url
    }
  })

  const videoStatNumbers = computed(() => {
    if (!props.video) {
      return {
        view: undefined,
        danmaku: undefined,
        like: undefined,
      }
    }

    const { view, viewStr, danmaku, danmakuStr, like, likeStr } = props.video

    return {
      view: parseStatNumber(view ?? viewStr),
      danmaku: parseStatNumber(danmaku ?? danmakuStr),
      like: parseStatNumber(like ?? likeStr),
    }
  })

  const shouldHideOverlayElements = computed(() =>
    props.showPreview
    && settings.value.enableVideoPreview
    && isHover.value
    && previewVideoUrl.value
    && topBarStore.isLogin,
  )

  // Lifecycle
  onMounted(() => {
    const el = cardRootRef.value
    if (!el)
      return
    const initialRect = el.getBoundingClientRect()
    if (initialRect.width) {
      const width = Math.round(initialRect.width)
      cardWidth.value = width
      el.style.setProperty('--bew-card-width', `${width}px`)
    }
    cardResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        el.style.setProperty('--bew-card-width', `${Math.round(width)}px`)
        cardWidth.value = Math.round(width)
      }
    })
    cardResizeObserver.observe(el)
  })

  onBeforeUnmount(() => {
    cardResizeObserver?.disconnect()
    cardResizeObserver = null
  })

  // Watch
  watch(() => isHover.value, async (newValue) => {
    if (!props.video || !newValue)
      return

    if (props.showPreview && settings.value.enableVideoPreview
      && !previewVideoUrl.value && (props.video.aid || props.video.bvid)) {
      // 检查登录状态，未登录不允许视频预览
      if (!topBarStore.isLogin)
        return

      let cid = props.video.cid
      if (!cid) {
        try {
          const res: VideoInfo = await api.video.getVideoInfo({
            bvid: props.video.bvid,
          })
          if (res.code === 0)
            cid = res.data.cid
        }
        catch {
          // Ignore error
        }
      }
      api.video.getVideoPreview({
        bvid: props.video.bvid,
        cid,
      }).then((res: VideoPreviewResult) => {
        if (res.code === 0 && res.data.durl && res.data.durl.length > 0)
          previewVideoUrl.value = res.data.durl[0].url
      })
    }
  })

  // Methods
  function toggleWatchLater() {
    if (!props.video)
      return

    if (!isInWatchLater.value) {
      const params: { bvid?: string, aid?: number, csrf: string } = {
        csrf: getCSRF(),
      }

      // 优先使用bvid，如果没有则使用aid
      if (props.video.bvid) {
        params.bvid = props.video.bvid
      }
      else {
        params.aid = props.video.id
      }

      api.watchlater.saveToWatchLater(params)
        .then((res) => {
          if (res.code === 0) {
            isInWatchLater.value = true
            // 延时1秒后获取稍后再看列表（add成功后居然不是立即生效的）
            setTimeout(() => {
              topBarStore.getAllWatchLaterList()
            }, 1000)
          }
          else {
            toast.error(res.message)
          }
        })
    }
    else {
      api.watchlater.removeFromWatchLater({
        aid: props.video.id,
        csrf: getCSRF(),
      })
        .then((res) => {
          if (res.code === 0) {
            isInWatchLater.value = false
            // 延时1秒后获取稍后再看列表（add成功后居然不是立即生效的）
            setTimeout(() => {
              topBarStore.getAllWatchLaterList()
            }, 1000)
          }
          else {
            toast.error(res.message)
          }
        })
    }
  }

  function handleMouseEnter() {
    // Cancel any pending leave timeout
    if (mouseLeaveTimeOut.value) {
      clearTimeout(mouseLeaveTimeOut.value)
      mouseLeaveTimeOut.value = null
    }

    // fix #789
    contentVisibility.value = 'visible'
    if (mouseEnterTimeOut.value)
      clearTimeout(mouseEnterTimeOut.value)
    const delay = settings.value.hoverVideoCardDelayed ? 1200 : 500
    mouseEnterTimeOut.value = window.setTimeout(() => {
      mouseEnterTimeOut.value = null
      isHover.value = true
    }, delay)
  }

  function handelMouseLeave() {
    // Cancel any pending enter timeout
    if (mouseEnterTimeOut.value) {
      clearTimeout(mouseEnterTimeOut.value)
      mouseEnterTimeOut.value = null
    }

    // Delay hiding to prevent flicker when mouse hovers near boundaries
    if (mouseLeaveTimeOut.value)
      clearTimeout(mouseLeaveTimeOut.value)

    mouseLeaveTimeOut.value = window.setTimeout(() => {
      mouseLeaveTimeOut.value = null
      contentVisibility.value = 'auto'
      isHover.value = false
    }, 100) // Short delay to debounce boundary hover
  }

  function handleClick(event: MouseEvent) {
    videoCurrentTime.value = getCurrentTime(videoElement)
    if (settings.value.videoCardLinkOpenMode === 'background' && videoUrl.value && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      openLinkInBackground(videoUrl.value)
    }
    if (settings.value.videoCardLinkOpenMode === 'drawer' && videoUrl.value && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      openIframeDrawer(videoUrl.value)
    }
  }

  function handleMoreBtnClick(event: MouseEvent) {
    if (!moreBtnRef.value)
      return
    const { height } = moreBtnRef.value.getBoundingClientRect()

    /**
     * 计算菜单位置，确保在视口内可见
     * 如果底部空间不足，则向上偏移，但不超出顶部
     */
    const menuHeight = Math.min(406, window.innerHeight * 0.8) // 菜单最大高度为视口的80%或406px
    const topSpace = event.y
    const bottomSpace = window.innerHeight - event.y

    // 如果底部空间足够，则向下展开；否则向上展开
    const offsetTop = bottomSpace > menuHeight ? 0 : -menuHeight - height

    // 确保不会超出顶部
    const finalOffsetTop = Math.max(offsetTop, -topSpace + 10)

    showVideoOptions.value = false
    videoOptionsFloatingStyles.value = {
      position: 'absolute',
      top: 0,
      left: 0,
      transform: `translate(${event.x}px, ${event.y + finalOffsetTop}px)`,
    }
    showVideoOptions.value = true
  }

  function handleUndo() {
    if (props.type === 'appRcmd') {
      const params = {
        access_key: appAuthTokens.value.accessToken,
        goto: props.video?.goto,
        id: props.video?.id,
        idx: Number((Date.now() / 1000).toFixed(0)),
        reason_id: selectedDislikeOpt.value?.dislikeReasonId,
        build: 74800100,
        device: 'pad',
        mobi_app: 'iphone',
        appkey: TVAppKey.appkey,
      }

      api.video.undoDislikeVideo({
        ...params,
        sign: getTvSign(params),
      }).then((res) => {
        if (res.code === 0) {
          removed.value = false
        }
        else {
          toast.error(res.message)
        }
      })
    }
    else {
      removed.value = false
    }
  }

  function handleRemoved(selectedOpt?: { dislikeReasonId: number }) {
    selectedDislikeOpt.value = selectedOpt
    removed.value = true
  }

  return {
    // Refs
    showVideoOptions,
    videoOptionsFloatingStyles,
    removed,
    moreBtnRef,
    contextMenuRef,
    videoCurrentTime,
    isInWatchLater,
    isHover,
    previewVideoUrl,
    contentVisibility,
    videoElement,
    cardRootRef,
    cardWidth,

    // Computed
    videoUrl,
    videoStatNumbers,
    shouldHideOverlayElements,

    // Methods
    toggleWatchLater,
    handleMouseEnter,
    handelMouseLeave,
    handleClick,
    handleMoreBtnClick,
    handleUndo,
    handleRemoved,
    removeHttpFromUrl,
    calcCurrentTime,
    numFormatter,
  }
}
