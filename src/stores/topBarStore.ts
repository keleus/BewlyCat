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

  function getLikeUnreadCount(): number {
    const likeCount = typeof unReadMessage.like === 'number' ? unReadMessage.like : 0
    const recvLike = (unReadMessage as UnReadMessage & { recv_like?: number }).recv_like
    const recvLikeCount = typeof recvLike === 'number' ? recvLike : 0

    return Math.max(likeCount, recvLikeCount)
  }

  const unReadMessageCount = computed((): number => {
    let result = 0

    // 统计顶栏默认展示的消息类型
    MESSAGE_KEYS_TO_COUNT.forEach((key) => {
      const value = unReadMessage[key]
      if (typeof value === 'number')
        result += value
    })

    // 可选地将点赞提醒计入顶栏通知角标
    if (settings.value.showLikeNotificationReminder)
      result += getLikeUnreadCount()

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
  const collaborativeVideoMap = new Map<string, { item: any, moment?: any }>()

  // B币领取状态
  const privilegeInfo = reactive<PrivilegeInfo>({} as PrivilegeInfo)
  const hasBCoinToReceive = ref<boolean>(false)
  const bCoinAlreadyReceived = ref<boolean>(false) // 记录B币是否已经领取

  // 大会员经验领取状态
  const vipExpAlreadyReceived = ref<boolean>(false) // 记录大会员经验是否已经领取

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
          vipExpAlreadyReceived.value = false
        }
      }
      else if (res.code === -101) {
        isLogin.value = false
        // 登出时重置状态
        bCoinAlreadyReceived.value = false
        hasBCoinToReceive.value = false
        vipExpAlreadyReceived.value = false
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
        vipExpAlreadyReceived.value = false
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
      vipExpAlreadyReceived.value = false
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

  // 自动领取大会员经验
  async function autoReceiveVipExp() {
    if (!isLogin.value || userInfo.vip?.status !== 1 || !settings.value.autoReceiveVipExp) {
      return
    }

    // 如果已经记录为已领取，则不再请求
    if (vipExpAlreadyReceived.value) {
      return
    }

    try {
      const res = await api.user.receiveVipExp({
        csrf: getCSRF(),
      })

      if (res.code === 0) {
        // 领取成功，更新状态并显示消息
        vipExpAlreadyReceived.value = true
        toast.success('大会员经验自动领取成功', { timeout: 1500 })
      }
      else if (res.code === 69198) {
        // 经验已领取，静默更新状态
        vipExpAlreadyReceived.value = true
      }
      // 其他错误码不处理，下次继续尝试
    }
    catch {
      // 请求失败不处理，下次继续尝试
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
    collaborativeVideoMap.clear()

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
            // 根据 selectedType 和设置过滤数据
            // type: 8 是视频，type: 64 是专栏
            let filteredItems = items

            // 如果是视频类型，根据设置决定是否过滤专栏
            if (selectedType === 'video') {
              if (settings.value.filterArticlesInMoments) {
                // 开启过滤专栏：只保留视频（type: 8）
                filteredItems = items.filter((item: any) => item.type === 8)
              }
              else {
                // 关闭过滤专栏：保留视频和专栏（type: 8 或 64）
                filteredItems = items.filter((item: any) => item.type === 8 || item.type === 64)
              }
            }

            // 合并联合投稿视频 - 只对视频类型进行合并
            let processedItems = filteredItems
            if (selectedType === 'video') {
              // 只合并视频，不合并专栏
              const videos = filteredItems.filter((item: any) => item.type === 8)
              const articles = filteredItems.filter((item: any) => item.type === 64)
              const mergedVideos = mergeCollaborativeVideos(videos)
              // 将合并后的视频和专栏合并到一起
              processedItems = [...mergedVideos, ...articles]
            }

            // 如果是第一次加载（offset为空），需要根据过滤和合并后的实际数量调整 newMomentsCount
            // 因为过滤专栏和合并联合投稿会导致显示的条目数量少于原始的 update_num
            if (!momentOffset.value && selectedType === 'video') {
              // 计算过滤前有多少新内容
              const originalNewCount = newMomentsCount.value
              // 计算过滤和合并后的实际条目数
              const actualNewCount = Math.min(originalNewCount, processedItems.length)
              // 更新为实际的新内容数量
              newMomentsCount.value = actualNewCount
            }

            processedItems.forEach((item: any) => {
              const momentItem = {
                type: selectedType,
                title: item.title,
                author: item.authors ? item.authors.map((a: any) => a.name).join(' / ') : item.author.name,
                authorFace: item.author.face,
                authorJumpUrl: item.author.jump_url,
                pubTime: item.pub_time,
                cover: item.cover,
                link: item.jump_url,
                rid: item.rid,
                isCollaborative: !!item.authors,
                authors: item.authors,
              }

              moments.push(momentItem)

              if (selectedType === 'video' && item.type === 8) {
                const bvid = extractBvid(item)
                if (!bvid)
                  return
                const entry = collaborativeVideoMap.get(bvid)
                if (!entry)
                  return
                entry.moment = momentItem
                updateMomentCollaborative(momentItem, entry.item)
              }
            })
          }
        }
      })
      .catch(error => console.error(error))
      .finally(() => isLoadingMoments.value = false)
  }

  function extractBvid(item: any): string | null {
    const jumpUrl = typeof item.jump_url === 'string' ? item.jump_url : ''
    const bvMatch = jumpUrl.match(/\/(BV\w+)/)
    if (bvMatch?.[1])
      return bvMatch[1]

    const directBvid = item?.bvid || item?.modules?.module_dynamic?.major?.archive?.bvid
    return typeof directBvid === 'string' && directBvid ? directBvid : null
  }

  function normalizeAuthor(author: any) {
    return {
      name: author?.name,
      face: author?.face,
      jump_url: author?.jump_url,
    }
  }

  function collectAuthors(item: any): any[] {
    if (Array.isArray(item.authors) && item.authors.length > 0)
      return item.authors.map(normalizeAuthor)
    if (item.author)
      return [normalizeAuthor(item.author)]
    return []
  }

  function mergeAuthors(targetItem: any, incomingItem: any) {
    const incomingAuthors = collectAuthors(incomingItem)
    if (incomingAuthors.length === 0)
      return

    const targetAuthors = Array.isArray(targetItem.authors)
      ? targetItem.authors
      : collectAuthors(targetItem)

    incomingAuthors.forEach((author) => {
      const authorKey = author.jump_url || author.name
      const exists = targetAuthors.some((a: any) => (a.jump_url || a.name) === authorKey)
      if (!exists)
        targetAuthors.push(author)
    })

    if (targetAuthors.length > 1)
      targetItem.authors = targetAuthors
  }

  function updateMomentCollaborative(moment: any, item: any) {
    if (!Array.isArray(item.authors) || item.authors.length <= 1)
      return

    moment.isCollaborative = true
    moment.authors = item.authors
    moment.author = item.authors.map((a: any) => a.name).join(' / ')
  }

  // 合并联合投稿视频的辅助函数（跨页合并）
  function mergeCollaborativeVideos(items: any[]) {
    const newItems: any[] = []

    items.forEach((item: any) => {
      const bvid = extractBvid(item)
      if (!bvid) {
        newItems.push(item)
        return
      }

      const existingEntry = collaborativeVideoMap.get(bvid)
      if (!existingEntry) {
        const storedItem = { ...item }
        collaborativeVideoMap.set(bvid, { item: storedItem })
        newItems.push(storedItem)
        return
      }

      mergeAuthors(existingEntry.item, item)
      if (existingEntry.moment)
        updateMomentCollaborative(existingEntry.moment, existingEntry.item)
    })

    return newItems
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

  async function initData() {
    await getUserInfo()

    // 只有在登录状态下才调用这些需要登录的API
    if (isLogin.value) {
      checkBCoinReceiveStatus()
      autoReceiveVipExp()
      getUnreadMessageCount()
      getTopBarNewMomentsCount()
      getAllWatchLaterList()
    }
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
        autoReceiveVipExp()
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
    vipExpAlreadyReceived.value = false
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
    autoReceiveVipExp,

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
