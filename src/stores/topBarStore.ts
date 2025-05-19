import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'

import {
  ACCOUNT_URL,
  BANGUMI_PLAY_URL,
  CHANNEL_PAGE_URL,
  CREATOR_PLATFORM_URL,
  MOMENTS_URL,
  READ_HOME_URL,
  READ_PREVIEW_URL,
  SEARCH_PAGE_URL,
  SPACE_URL,
  VIDEO_LIST_URL,
  VIDEO_PAGE_URL,
} from '~/components/TopBar/constants/urls'
import { updateInterval } from '~/components/TopBar/notify'
import type { UnReadDm, UnReadMessage, UserInfo } from '~/components/TopBar/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import api from '~/utils/api'
import { getCSRF, isHomePage, isInIframe } from '~/utils/main'

export const useTopBarStore = defineStore('topBar', () => {
  const isLogin = ref<boolean>(true)
  const userInfo = reactive<UserInfo>({} as UserInfo)

  const unReadMessage = reactive<UnReadMessage>({} as UnReadMessage)
  const unReadDm = reactive<UnReadDm>({} as UnReadDm)

  const unReadMessageCount = computed((): number => {
    let result = 0

    // 计算 unReadMessage 中的未读消息
    Object.entries(unReadMessage).forEach(([key, value]) => {
      if (key !== 'up' && key !== 'recv_reply' && key !== 'recv_like') {
        if (typeof value === 'number')
          result += value
      }
    })

    // 计算 unReadDm 中的未读消息
    if (typeof unReadDm.follow_unread === 'number')
      result += unReadDm.follow_unread
    if (typeof unReadDm.unfollow_unread === 'number')
      result += unReadDm.unfollow_unread

    return result
  })

  // Moments State
  const newMomentsCount = ref<number>(0)
  // 添加 Moments 相关状态
  const moments = reactive<any[]>([])
  const addedWatchLaterList = reactive<number[]>([])
  const isLoadingMoments = ref<boolean>(false)
  const noMoreMomentsContent = ref<boolean>(false)
  const livePage = ref<number>(1)
  const momentUpdateBaseline = ref<string>('')
  const momentOffset = ref<string>('')

  // UI State
  const drawerVisible = reactive({
    notifications: false,
  })
  const notificationsDrawerUrl = ref<string>('https://message.bilibili.com/')
  const popupVisible = reactive({
    channels: false,
    userPanel: false,
    notifications: false,
    moments: false,
    favorites: false,
    history: false,
    watchLater: false,
    upload: false,
    more: false,
  })

  // 从 useTopBarReactive 整合的状态
  const { activatedPage, reachTop } = useBewlyApp()

  // 从 useTopBarReactive 整合的计算属性
  const isSearchPage = computed((): boolean => {
    return SEARCH_PAGE_URL.test(location.href)
  })

  const forceWhiteIcon = computed((): boolean => {
    if (!settings.value)
      return false

    if (
      (isHomePage() && settings.value.useOriginalBilibiliHomepage)
      || (isInIframe() && isHomePage())
      || (CHANNEL_PAGE_URL.test(location.href) && !VIDEO_PAGE_URL.test(location.href))
      || SPACE_URL.test(location.href)
      || ACCOUNT_URL.test(location.href)
    ) {
      return true
    }

    if (!isHomePage())
      return false

    // 确保 activatedPage.value 存在
    if (!activatedPage?.value)
      return false

    if (activatedPage.value === AppPage.Search) {
      if (settings.value.individuallySetSearchPageWallpaper) {
        if (settings.value.searchPageWallpaper)
          return true
        return false
      }
      return !!settings.value.wallpaper
    }
    else {
      if (settings.value.wallpaper)
        return true

      if (settings.value.useSearchPageModeOnHomePage) {
        if (settings.value.individuallySetSearchPageWallpaper && !!settings.value.searchPageWallpaper)
          return true
        else if (settings.value.wallpaper)
          return true
      }
    }
    return false
  })

  const showSearchBar = computed((): boolean => {
    if (isHomePage()) {
      if (settings.value.useOriginalBilibiliHomepage)
        return true
      if (activatedPage.value === AppPage.Search)
        return false
      if (settings.value.useSearchPageModeOnHomePage && activatedPage.value === AppPage.Home && reachTop.value)
        return false
    }
    else {
      if (isSearchPage.value)
        return false
    }
    return true
  })

  const isTopBarFixed = computed((): boolean => {
    if (
      isHomePage()
      || VIDEO_LIST_URL.test(location.href)
      || BANGUMI_PLAY_URL.test(location.href)
      || MOMENTS_URL.test(location.href)
      || CHANNEL_PAGE_URL.test(location.href)
      || READ_HOME_URL.test(location.href)
      || ACCOUNT_URL.test(location.href)
    ) {
      return true
    }

    return false
  })

  const showTopBar = computed((): boolean => {
    if (
      CREATOR_PLATFORM_URL.test(location.href)
      || READ_PREVIEW_URL.test(location.href)
    ) {
      return false
    }

    if (settings.value.showTopBar)
      return true
    return false
  })

  // User Methods
  async function getUserInfo() {
    try {
      const res = await api.user.getUserInfo()
      if (res.code === 0) {
        isLogin.value = true
        Object.assign(userInfo, res.data)
      }
      else if (res.code === -101) {
        isLogin.value = false
      }
    }
    catch (error) {
      isLogin.value = false
      console.error(error)
    }
  }

  // Notification Methods
  async function getUnreadMessageCount() {
    if (!isLogin.value)
      return

    try {
      let res = await api.notification.getUnreadMsg()
      if (res.code === 0) {
        Object.assign(unReadMessage, res.data)
      }

      res = await api.notification.getUnreadDm()
      if (res.code === 0) {
        Object.assign(unReadDm, res.data)
      }
    }
    catch (error) {
      console.error(error)
    }
  }

  // Moments Methods
  async function getTopBarNewMomentsCount(selectedType: string = 'video') {
    if (!isLogin.value || isLoadingMoments.value)
      return

    try {
      isLoadingMoments.value = true

      const res = await api.moment.getMomentsUpdate({
        type: selectedType,
        update_baseline: '0',
      })

      if (res.code === 0 && res.data) {
        newMomentsCount.value = res.data.update_num
      }
    }
    catch (error) {
      console.error(error)
    }
    finally {
      isLoadingMoments.value = false
    }
  }

  function initMomentsData(selectedType: string) {
    // 重置所有相关状态
    moments.length = 0
    momentUpdateBaseline.value = ''
    momentOffset.value = ''
    // newMomentsCount.value = 0
    livePage.value = 1
    noMoreMomentsContent.value = false

    // 获取初始数据
    getMomentsData(selectedType)
  }

  function getMomentsData(selectedType: string) {
    if (selectedType !== 'live')
      getTopBarMoments(selectedType)
    else
      getTopBarLiveMoments()
  }

  function getTopBarMoments(selectedType: string) {
    if (isLoadingMoments.value || noMoreMomentsContent.value)
      return

    isLoadingMoments.value = true
    api.moment.getTopBarMoments({
      type: selectedType,
      update_baseline: momentUpdateBaseline.value || undefined,
      offset: momentOffset.value || undefined,
    })
      .then((res: any) => {
        if (res.code === 0) {
          const { has_more, items, offset, update_baseline } = res.data

          if (!has_more) {
            noMoreMomentsContent.value = true
            return
          }

          // 更新状态
          // newMomentsCount.value = update_num
          momentUpdateBaseline.value = update_baseline
          momentOffset.value = offset

          // 添加新内容
          if (items?.length) {
            moments.push(
              ...items.map((item: any) => ({
                type: selectedType,
                title: item.title,
                author: item.author.name,
                authorFace: item.author.face,
                authorJumpUrl: item.author.jump_url,
                pubTime: item.pub_time,
                cover: item.cover,
                link: item.jump_url,
                rid: item.rid,
              })),
            )
          }
        }
      })
      .catch(error => console.error(error))
      .finally(() => isLoadingMoments.value = false)
  }

  function getTopBarLiveMoments() {
    if (isLoadingMoments.value)
      return
    if (noMoreMomentsContent.value)
      return

    isLoadingMoments.value = true
    const pageSize = 10
    api.moment.getTopBarLiveMoments({
      page: livePage.value,
      pagesize: pageSize,
    })
      .then((res: any) => {
        if (res.code === 0) {
          const { list } = res.data

          // if the length of this list is less then the pageSize, it means that it have no more contents
          if (list.length < pageSize) {
            noMoreMomentsContent.value = true
          }

          // if the length of this list is equal to the pageSize, this means that it may have the next page.
          if (list.length === pageSize)
            livePage.value++

          moments.push(
            ...list.map((item: any) => ({
              type: 'live',
              title: item.title,
              author: item.uname,
              authorFace: item.face,
              cover: item.pic,
              link: item.link,
            }),
            ),
          )
        }
      })
      .finally(() => isLoadingMoments.value = false)
  }

  function isNewMoment(index: number) {
    return index < newMomentsCount.value
  }

  function toggleWatchLater(aid: number) {
    const isInWatchLater = addedWatchLaterList.includes(aid)

    if (!isInWatchLater) {
      api.watchlater.saveToWatchLater({
        aid,
        csrf: getCSRF(),
      })
        .then((res: any) => {
          if (res.code === 0)
            addedWatchLaterList.push(aid)
        })
    }
    else {
      api.watchlater.removeFromWatchLater({
        aid,
        csrf: getCSRF(),
      })
        .then((res: any) => {
          if (res.code === 0) {
            addedWatchLaterList.length = 0
            Object.assign(addedWatchLaterList, addedWatchLaterList.filter(item => item !== aid))
          }
        })
    }
  }

  function handleNotificationsItemClick(item: { name: string, url: string, unreadCount: number, icon: string }) {
    if (settings.value.openNotificationsPageAsDrawer) {
      drawerVisible.notifications = true
      notificationsDrawerUrl.value = item.url
    }
  }

  function closeAllPopups(exceptionKey?: string) {
    Object.keys(popupVisible).forEach((key) => {
      if (key !== exceptionKey)
        popupVisible[key as keyof typeof popupVisible] = false
    })
  }

  let updateTimer: ReturnType<typeof setInterval> | null = null

  function initData() {
    getUserInfo()
    getUnreadMessageCount()
    getTopBarNewMomentsCount()
  }

  function startUpdateTimer() {
    if (updateTimer) {
      clearInterval(updateTimer)
      updateTimer = null
    }
    updateTimer = setInterval(() => {
      if (isLogin.value) {
        getUnreadMessageCount()
        // 只有在弹窗未显示时才更新计数，避免与 watch 重复调用
        if (!popupVisible.moments)
          getTopBarNewMomentsCount()
      }
    }, updateInterval)
  }
  function stopUpdateTimer() {
    if (updateTimer) {
      clearInterval(updateTimer)
      updateTimer = null
    }
  }

  function cleanup() {
    stopUpdateTimer()

    Object.keys(unReadMessage).forEach((key) => {
      unReadMessage[key as keyof UnReadMessage] = 0
    })
    Object.keys(unReadDm).forEach((key) => {
      unReadDm[key as keyof UnReadDm] = 0
    })
    newMomentsCount.value = 0

    closeAllPopups()
    drawerVisible.notifications = false
  }

  // 添加鼠标状态跟踪
  const isMouseOverPopup = reactive<Record<string, boolean>>({})

  // 设置鼠标是否在弹窗上
  function setMouseOverPopup(key: string, value: boolean) {
    isMouseOverPopup[key] = value
  }

  // 获取鼠标是否在弹窗上
  function getMouseOverPopup(key: string) {
    return isMouseOverPopup[key] || false
  }

  return {
    isLogin,
    userInfo,
    unReadMessage,
    unReadDm,
    unReadMessageCount,
    newMomentsCount,
    drawerVisible,
    notificationsDrawerUrl,
    popupVisible,

    isSearchPage,
    forceWhiteIcon,
    showSearchBar,
    isTopBarFixed,
    showTopBar,

    getUserInfo,
    getUnreadMessageCount,
    getTopBarNewMomentsCount,
    handleNotificationsItemClick,
    closeAllPopups,
    initData,
    cleanup,
    isMouseOverPopup,
    setMouseOverPopup,
    getMouseOverPopup,
    startUpdateTimer,
    stopUpdateTimer,

    moments,
    addedWatchLaterList,
    isLoadingMoments,
    noMoreMomentsContent,
    livePage,
    momentUpdateBaseline,
    momentOffset,

    getTopBarMoments,
    initMomentsData,
    getMomentsData,
    isNewMoment,
    toggleWatchLater,
  }
})
