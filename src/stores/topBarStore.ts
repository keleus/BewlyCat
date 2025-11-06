import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { useToast } from 'vue-toastification'

import {
  ACCOUNT_URL,
  BANGUMI_PLAY_URL,
  CHANNEL_PAGE_URL,
  CREATOR_PLATFORM_URL,
  MOMENTS_URL,
  READ_HOME_URL,
  READ_PREVIEW_URL,
  SEARCH_PAGE_URL,
  VIDEO_LIST_URL,
} from '~/components/TopBar/constants/urls'
import { updateInterval } from '~/components/TopBar/notify'
import type { PrivilegeInfo, UnReadDm, UnReadMessage, UserInfo } from '~/components/TopBar/types'
import { settings } from '~/logic'
import type { List as VideoItem } from '~/models/video/watchLater'
import api from '~/utils/api'
import { getCSRF, isHomePage } from '~/utils/main'

export const useTopBarStore = defineStore('topBar', () => {
  const toast = useToast()
  const isLogin = ref<boolean>(true)
  const userInfo = reactive<UserInfo>({} as UserInfo)

  const unReadMessage = reactive<UnReadMessage>({} as UnReadMessage)
  const unReadDm = reactive<UnReadDm>({} as UnReadDm)

  const MESSAGE_KEYS_TO_COUNT: Array<keyof UnReadMessage> = ['reply', 'at', 'chat', 'sys_msg']

  const unReadMessageCount = computed((): number => {
    let result = 0

    // 只统计需要在顶栏展示的消息类型，过滤掉点赞等提醒
    MESSAGE_KEYS_TO_COUNT.forEach((key) => {
      const value = unReadMessage[key]
      if (typeof value === 'number')
        result += value
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
  // 添加稍后再看计数
  const watchLaterCount = ref<number>(0)
  // 添加稍后再看列表
  const watchLaterList = reactive<VideoItem[]>([])
  const isLoadingWatchLater = ref<boolean>(false)
  // 添加 Moments 相关状态
  const moments = reactive<any[]>([])
  const addedWatchLaterList = reactive<number[]>([])
  const isLoadingMoments = ref<boolean>(false)
  const noMoreMomentsContent = ref<boolean>(false)
  const livePage = ref<number>(1)
  const momentUpdateBaseline = ref<string>('')
  const momentOffset = ref<string>('')

  // B币领取状态
  const privilegeInfo = reactive<PrivilegeInfo>({} as PrivilegeInfo)
  const hasBCoinToReceive = ref<boolean>(false)
  const bCoinAlreadyReceived = ref<boolean>(false) // 记录B币是否已经领取

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

  // TopBar visibility state
  const topBarVisible = ref<boolean>(true)
  const searchKeyword = ref<string>('')

  // TopBar switcher button visibility state
  const isSwitcherButtonVisible = ref<boolean>(false)

  // 从 useTopBarReactive 整合的计算属性
  const isSearchPage = computed((): boolean => {
    return SEARCH_PAGE_URL.test(location.href)
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
  async function getUserInfo(retryCount = 0) {
    const maxRetries = 2 // 最多重试2次
    const retryDelay = (retryCount + 1) * 1000 // 递增延迟: 1s, 2s

    try {
      const res = await api.user.getUserInfo()

      if (res.code === 0) {
        const wasLoggedIn = isLogin.value
        const previousMid = userInfo.mid

        isLogin.value = true
        Object.assign(userInfo, res.data)

        // 如果是新登录或者切换了账号，重置B币领取状态
        if (!wasLoggedIn || previousMid !== userInfo.mid) {
          bCoinAlreadyReceived.value = false
          hasBCoinToReceive.value = false
        }
      }
      else if (res.code === -101) {
        isLogin.value = false
        // 登出时重置状态
        bCoinAlreadyReceived.value = false
        hasBCoinToReceive.value = false
      }
      else {
        // 其他错误码
        // 对于非未登录的错误，如果还有重试机会，则重试
        if (retryCount < maxRetries) {
          setTimeout(() => {
            getUserInfo(retryCount + 1)
          }, retryDelay)
          return
        }

        isLogin.value = false
        bCoinAlreadyReceived.value = false
        hasBCoinToReceive.value = false
      }
    }
    catch {
      // 如果还有重试机会，则重试
      if (retryCount < maxRetries) {
        setTimeout(() => {
          getUserInfo(retryCount + 1)
        }, retryDelay)
        return
      }

      // 重试次数用尽，标记为未登录
      isLogin.value = false
      bCoinAlreadyReceived.value = false
      hasBCoinToReceive.value = false
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

  // B币领取状态检查
  async function checkBCoinReceiveStatus() {
    if (!isLogin.value || userInfo.vip?.status !== 1 || !settings.value.showBCoinReceiveReminder)
      return

    // 如果已经记录为已领取，则不再请求
    if (bCoinAlreadyReceived.value) {
      return
    }

    try {
      const res = await api.user.getPrivilegeInfo()
      if (res.code === 0) {
        Object.assign(privilegeInfo, res.data)
        if (privilegeInfo.vip_type < 2) {
          return
        }
        // 检查B币兑换状态 (type: 1)
        const bCoinItem = privilegeInfo.list?.find(item => item.type === 1)
        if (bCoinItem) {
          if (bCoinItem.state === 1) {
            // 如果已经领取，记录状态并设置为false
            bCoinAlreadyReceived.value = true
            hasBCoinToReceive.value = false
          }
          else {
            // 如果有权限领取且未领取
            hasBCoinToReceive.value = bCoinItem.state === 0 && bCoinItem.next_receive_days > 0

            // 如果开启了自动领取，则自动领取B币
            if (hasBCoinToReceive.value && settings.value.autoReceiveBCoinCoupon) {
              await autoReceiveBCoin()
            }
          }
        }
        else {
          hasBCoinToReceive.value = false
        }
      }
    }
    catch (error) {
      console.error('Failed to check B-coin receive status:', error)
      hasBCoinToReceive.value = false
    }
  }

  // 自动领取B币
  async function autoReceiveBCoin() {
    if (!isLogin.value || !hasBCoinToReceive.value) {
      return
    }

    try {
      const res = await api.user.exchangeCoupon({
        type: '1',
        csrf: getCSRF(),
      })

      if (res.code === 0) {
        // 领取成功，更新状态
        bCoinAlreadyReceived.value = true
        hasBCoinToReceive.value = false
        toast.success('B币券自动领取成功')
      }
      else {
        toast.error(`B币券自动领取失败: ${res.message}`)
      }
    }
    catch {
      toast.error('B币券自动领取失败，请稍后重试')
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

  // 获取稍后再看列表数量
  async function getWatchLaterCount() {
    if (!isLogin.value)
      return

    try {
      const res = await api.watchlater.getWatchLaterListByPage({
        pn: 1,
        ps: 10,
      })
      if (res.code === 0) {
        watchLaterCount.value = res.data.count
        Object.assign(watchLaterList, res.data.list)
      }
    }
    catch (error) {
      console.error(error)
    }
  }

  // 获取稍后再看列表
  async function getAllWatchLaterList() {
    if (!isLogin.value)
      return

    isLoadingWatchLater.value = true

    try {
      const res = await api.watchlater.getWatchLaterListByPage({
        pn: 1,
        ps: 10,
      })
      if (res.code === 0) {
        watchLaterCount.value = res.data.count
        Object.assign(watchLaterList, res.data.list)
      }
    }
    catch (error) {
      console.error(error)
    }
    finally {
      isLoadingWatchLater.value = false
    }
  }

  // 加载更多稍后再看列表
  async function loadMoreWatchLaterList() {
    if (!isLogin.value || isLoadingWatchLater.value)
      return

    const currentPage = Math.floor(watchLaterList.length / 10) + 1
    const totalPages = Math.ceil(watchLaterCount.value / 10)

    if (currentPage > totalPages)
      return

    isLoadingWatchLater.value = true

    try {
      const res = await api.watchlater.getWatchLaterListByPage({
        pn: currentPage,
        ps: 10,
      })
      if (res.code === 0) {
        watchLaterList.push(...res.data.list)
      }
    }
    catch (error) {
      console.error(error)
    }
    finally {
      isLoadingWatchLater.value = false
    }
  }

  // 删除稍后再看项目
  async function deleteWatchLaterItem(index: number, aid: number) {
    try {
      const res = await api.watchlater.removeFromWatchLater({
        aid,
        csrf: getCSRF(),
      })
      if (res.code === 0) {
        watchLaterList.splice(index, 1)
        watchLaterCount.value = watchLaterList.length
      }
    }
    catch (error) {
      console.error(error)
    }
  }

  function initMomentsData(selectedType: string) {
    // 重置所有相关状态
    moments.splice(0) // 使用 splice 正确清空响应式数组
    momentUpdateBaseline.value = ''
    momentOffset.value = ''
    // newMomentsCount.value = 0
    livePage.value = 1
    noMoreMomentsContent.value = false
    isLoadingMoments.value = false // 重置加载状态,防止卡住

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
    getUserInfo().then(() => {
      checkBCoinReceiveStatus()
    })
    getUnreadMessageCount()
    getTopBarNewMomentsCount()
    getAllWatchLaterList()
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
        if (!popupVisible.watchLater)
          getWatchLaterCount()
        checkBCoinReceiveStatus()
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
    watchLaterCount.value = 0

    closeAllPopups()
    drawerVisible.notifications = false
    hasBCoinToReceive.value = false
    bCoinAlreadyReceived.value = false
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

  // 设置TopBar可见状态
  function setTopBarVisible(visible: boolean) {
    topBarVisible.value = visible
  }

  // 设置切换器按钮可见性状态
  function setSwitcherButtonVisible(visible: boolean) {
    isSwitcherButtonVisible.value = visible
  }

  return {
    isLogin,
    userInfo,
    unReadMessage,
    unReadDm,
    unReadMessageCount,
    newMomentsCount,
    watchLaterCount,
    watchLaterList,
    isLoadingWatchLater,
    drawerVisible,
    notificationsDrawerUrl,
    popupVisible,

    isSearchPage,
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
    checkBCoinReceiveStatus,
    autoReceiveBCoin,

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

    getWatchLaterCount,
    getAllWatchLaterList,
    loadMoreWatchLaterList,
    deleteWatchLaterItem,

    privilegeInfo,
    hasBCoinToReceive,
    bCoinAlreadyReceived,

    topBarVisible,
    searchKeyword,
    setTopBarVisible,
    isSwitcherButtonVisible,
    setSwitcherButtonVisible,
  }
})
