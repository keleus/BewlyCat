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
import type {
  TopBarFavoritesChanged,
  TopBarRefreshClaim,
  TopBarSharedState,
  TopBarStateClaim,
  TopBarStateInvalidate,
  TopBarStatePublish,
  TopBarStateRelease,
} from '~/constants/topBarState'
import {
  TOP_BAR_STATE_MESSAGE,
} from '~/constants/topBarState'
import { settings } from '~/logic'
import { checkLoginStatus, LoginStatus, parseDedeUserID } from '~/logic/loginStatus'
import { parseTopBarPublicationTime, recordUploaderLatestVideoTimes } from '~/logic/uploaderLatestVideoTimes'
import type { List as VideoItem } from '~/models/video/watchLater'
import api from '~/utils/api'
import { getCSRF, isHomePage } from '~/utils/main'
import { isExtensionContextInvalidatedError, onMessage, sendMessage } from '~/utils/messaging'

export const LOGIN_RECHECK_INTERVAL = 1000 * 60 // 已登录但 userInfo 未填充时重查的间隔

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

function getNextReceiveAt(nextReceiveDays?: number, periodEndUnix?: number): number | null {
  if (Number.isFinite(periodEndUnix) && periodEndUnix! > 0)
    return periodEndUnix! * 1000

  if (Number.isFinite(nextReceiveDays) && nextReceiveDays! > 0)
    return Date.now() + nextReceiveDays! * DAY_MILLISECONDS

  return null
}

function isBeforeNextReceiveAt(nextReceiveAt: number | null): boolean {
  return nextReceiveAt !== null && nextReceiveAt > Date.now()
}

export const useTopBarStore = defineStore('topBar', () => {
  const toast = useToast()
  // 登录态是本地事实而非网络推导：初始值取 DedeUserID 存在性（同步、零请求），
  // 之后只有 -101 或本地 Cookie 清除才能翻转为未登录，瞬态失败永不翻转。
  // 否则刷新时的一次风控窗口会把已登录用户误判为未登录（见 issue #921）。
  const isLogin = ref<boolean>(getLocalLoginMid() !== undefined)
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
  const favoriteStateVersion = ref(0)
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
  const bCoinNextReceiveAt = ref<number | null>(null)

  // 大会员经验领取状态
  const vipExpAlreadyReceived = ref<boolean>(false) // 记录大会员经验是否已经领取
  const vipExpNextReceiveAt = ref<number | null>(null)

  // 登录态请求和定时器都可能跨越账号切换、登出或组件卸载；generation 用于
  // 忽略这些生命周期边界之前启动的异步结果。
  let loginStateGeneration = 0
  let lastLoggedOutMid: number | undefined

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

  function resetReceiveStates() {
    bCoinAlreadyReceived.value = false
    hasBCoinToReceive.value = false
    bCoinNextReceiveAt.value = null
    vipExpAlreadyReceived.value = false
    vipExpNextReceiveAt.value = null
  }

  function resetAccountScopedState() {
    Object.keys(unReadMessage).forEach((key) => {
      unReadMessage[key as keyof UnReadMessage] = 0
    })
    Object.keys(unReadDm).forEach((key) => {
      unReadDm[key as keyof UnReadDm] = 0
    })

    newMomentsCount.value = 0
    watchLaterCount.value = 0
    watchLaterList.splice(0)
    addedWatchLaterList.splice(0)
    moments.splice(0)
    livePage.value = 1
    momentUpdateBaseline.value = ''
    momentOffset.value = ''
    noMoreMomentsContent.value = false
    isLoadingMoments.value = false
    isLoadingWatchLater.value = false
    collaborativeVideoMap.clear()
    Object.keys(privilegeInfo).forEach(key => Reflect.deleteProperty(privilegeInfo, key))
    resetReceiveStates()
  }

  // 登录态的本地事实源：读取 DedeUserID（非 HttpOnly，content script 可读）
  function getLocalLoginMid(): number | undefined {
    return parseDedeUserID(document.cookie)
  }

  function isCurrentAccount(accountId: number | undefined): accountId is number {
    return accountId !== undefined && isLogin.value && userInfo.mid === accountId
  }

  function clearUserInfo() {
    Object.keys(userInfo).forEach(key => Reflect.deleteProperty(userInfo, key))
  }

  // User Methods
  async function getUserInfo(
    retryCount = 0,
    requestGeneration = loginStateGeneration,
    requestLocalMid = getLocalLoginMid(),
  ): Promise<LoginStatus> {
    if (requestGeneration !== loginStateGeneration)
      return LoginStatus.TransientError

    // 本地无会话 Cookie 且已知未登录时，nav 只会返回 -101，跳过无意义的请求
    if (getLocalLoginMid() !== requestLocalMid)
      return LoginStatus.TransientError

    if (!isLogin.value && requestLocalMid === undefined) {
      lastLoggedOutMid = undefined
      return LoginStatus.LoggedOut
    }

    const maxRetries = 2 // 最多重试2次
    const retryDelay = (retryCount + 1) * 1000 // 递增延迟: 1s, 2s

    const result = await checkLoginStatus<UserInfo>(() => api.user.getUserInfo())

    if (requestGeneration !== loginStateGeneration || getLocalLoginMid() !== requestLocalMid)
      return LoginStatus.TransientError

    if (result.status === LoginStatus.LoggedIn) {
      const wasLoggedIn = isLogin.value
      const previousMid = userInfo.mid

      isLogin.value = true
      Object.assign(userInfo, result.data)
      lastLoggedOutMid = undefined

      // 如果是新登录或者切换了账号，清理旧账号的所有本地状态
      if (!wasLoggedIn || previousMid !== userInfo.mid)
        resetAccountScopedState()
      return result.status
    }

    if (result.status === LoginStatus.LoggedOut) {
      lastLoggedOutMid = requestLocalMid
      isLogin.value = false
      clearUserInfo()
      resetAccountScopedState()
      stopUpdateTimer()
      return result.status
    }

    // 瞬态失败（风控/限流/网络错误）：不切换登录态，稍后重试
    if (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return getUserInfo(retryCount + 1, requestGeneration, requestLocalMid)
    }
    return result.status
  }

  // 登录/登出会先后触发多个 Cookie 事件，reconcile 会被密集调用；
  // 拉取进行中时复用同一 Promise，避免重复请求 nav
  let fetchUserInfoPromise: Promise<LoginStatus> | null = null
  let fetchUserInfoGeneration = -1
  let fetchUserInfoLocalMid: number | undefined
  function fetchUserInfoOnce(): Promise<LoginStatus> {
    const requestGeneration = loginStateGeneration
    const requestLocalMid = getLocalLoginMid()
    if (
      fetchUserInfoPromise
      && fetchUserInfoGeneration === requestGeneration
      && fetchUserInfoLocalMid === requestLocalMid
    ) {
      return fetchUserInfoPromise
    }

    if (fetchUserInfoPromise)
      invalidateLoginStateRequests()

    const currentGeneration = loginStateGeneration
    const request = getUserInfo(0, currentGeneration, requestLocalMid)
      .catch(() => LoginStatus.TransientError)
      .finally(() => {
        if (fetchUserInfoPromise === request) {
          fetchUserInfoPromise = null
          fetchUserInfoGeneration = -1
          fetchUserInfoLocalMid = undefined
        }
      })
    fetchUserInfoPromise = request
    fetchUserInfoGeneration = currentGeneration
    fetchUserInfoLocalMid = requestLocalMid
    return fetchUserInfoPromise
  }

  function invalidateLoginStateRequests() {
    loginStateGeneration++
    fetchUserInfoPromise = null
    fetchUserInfoGeneration = -1
    fetchUserInfoLocalMid = undefined
  }

  function handleReconciledLoginStatus(status: LoginStatus, requestGeneration: number) {
    if (requestGeneration !== loginStateGeneration)
      return

    if (status === LoginStatus.LoggedIn) {
      startUpdateTimer()
      void syncSharedData({ force: true }).catch((error) => {
        console.error('登录态变化后同步顶栏共享状态失败:', error)
      })
    }
    else if (status === LoginStatus.LoggedOut) {
      stopUpdateTimer()
    }
    else if (isLogin.value) {
      // 已登录但资料尚未填充时，保留定时器做退避重试
      startUpdateTimer()
    }
  }

  // 用本地事实校正登录态：页面重新可见或收到会话 Cookie 变化广播时调用。
  // - 本地无 DedeUserID 且当前已登录：交由 nav 裁决（-101 才翻转，见 getUserInfo）
  // - 本地有 DedeUserID 且当前未登录：拉取 userInfo，成功后再切换为已登录；
  //   但如果是新 mid，仍先显示登录态以避免 Cookie 已更新而 UI 长时间滞后
  // - 已登录但 userInfo 未填充，或 mid 不一致：补拉或换号重拉（会重置 B 币领取状态）
  function reconcileLocalLoginState() {
    const localMid = getLocalLoginMid()

    // Cookie 中的 mid 已经切换时，立即丢弃旧账号状态和旧请求；否则旧请求
    // 可能在新账号 userInfo 返回前继续写入旧账号的角标/列表。
    if (localMid !== undefined && isLogin.value && userInfo.mid && userInfo.mid !== localMid) {
      stopUpdateTimer()
      invalidateLoginStateRequests()
      lastLoggedOutMid = undefined
      clearUserInfo()
      resetAccountScopedState()
    }

    const fetchAndHandleLoginStatus = () => {
      const request = fetchUserInfoOnce()
      const requestGeneration = loginStateGeneration
      void request.then(status => handleReconciledLoginStatus(status, requestGeneration))
    }

    if (localMid === undefined) {
      lastLoggedOutMid = undefined
      if (isLogin.value)
        fetchAndHandleLoginStatus()
      else
        stopUpdateTimer()
      return
    }

    if (!isLogin.value) {
      if (lastLoggedOutMid !== localMid)
        isLogin.value = true
      // 旧 mid 被判定为失效时不再乐观显示，先让 nav 确认是否真的重新登录
      fetchAndHandleLoginStatus()
      return
    }

    // 已登录但 userInfo 未填充（初始化时撞风控），或本地 mid 变化
    // （他处切换账号）：重新拉取（会重置 B 币领取状态）
    if (!userInfo.mid || userInfo.mid !== localMid)
      fetchAndHandleLoginStatus()
  }

  // Notification Methods
  async function getUnreadMessageCount() {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId))
      return

    try {
      let res = await api.notification.getUnreadMsg()
      if (res.code === 0 && isCurrentAccount(accountId)) {
        Object.assign(unReadMessage, res.data)
      }

      res = await api.notification.getUnreadDm()
      if (res.code === 0 && isCurrentAccount(accountId)) {
        Object.assign(unReadDm, res.data)
      }
    }
    catch (error) {
      console.error(error)
    }
  }

  // B币和大会员经验领取状态检查
  async function refreshVipRewardStatus() {
    const accountId = userInfo.mid
    const shouldCheckBCoin = settings.value.showBCoinReceiveReminder
    const shouldCheckVipExp = settings.value.autoReceiveVipExp
    if (!isCurrentAccount(accountId) || userInfo.vip?.status !== 1 || (!shouldCheckBCoin && !shouldCheckVipExp))
      return

    const shouldFetchBCoin = shouldCheckBCoin
      && !(bCoinAlreadyReceived.value && isBeforeNextReceiveAt(bCoinNextReceiveAt.value))
    const shouldFetchVipExp = shouldCheckVipExp
      && !(vipExpAlreadyReceived.value && isBeforeNextReceiveAt(vipExpNextReceiveAt.value))
    if (!shouldFetchBCoin && !shouldFetchVipExp)
      return

    try {
      const res = await api.user.getPrivilegeInfo()
      if (res.code === 0 && isCurrentAccount(accountId)) {
        Object.assign(privilegeInfo, res.data)

        const rewardRequests: Promise<void>[] = []

        if (shouldCheckBCoin) {
          if (privilegeInfo.vip_type < 2) {
            bCoinAlreadyReceived.value = false
            hasBCoinToReceive.value = false
            bCoinNextReceiveAt.value = null
          }

          // 检查B币兑换状态 (type: 1)
          const bCoinItem = privilegeInfo.vip_type >= 2
            ? privilegeInfo.list?.find(item => item.type === 1)
            : undefined
          if (bCoinItem) {
            const nextReceiveAt = getNextReceiveAt(bCoinItem.next_receive_days, bCoinItem.period_end_unix)
            bCoinAlreadyReceived.value = bCoinItem.state === 1
            bCoinNextReceiveAt.value = bCoinAlreadyReceived.value ? nextReceiveAt : null
            if (bCoinAlreadyReceived.value) {
              hasBCoinToReceive.value = false
            }
            else {
              // 如果有权限领取且未领取
              hasBCoinToReceive.value = bCoinItem.state === 0 && bCoinItem.next_receive_days > 0

              // 如果开启了自动领取，则自动领取B币
              if (hasBCoinToReceive.value && settings.value.autoReceiveBCoinCoupon)
                rewardRequests.push(autoReceiveBCoin(accountId, nextReceiveAt))
            }
          }
          else {
            bCoinAlreadyReceived.value = false
            hasBCoinToReceive.value = false
            bCoinNextReceiveAt.value = null
          }
        }

        if (shouldCheckVipExp) {
          // 每日 10 经验对应 type=9，状态和下一轮领取时间与 B 币一致。
          const vipExpItem = privilegeInfo.list?.find(item => item.type === 9)
          if (vipExpItem) {
            const nextReceiveAt = getNextReceiveAt(vipExpItem.next_receive_days, vipExpItem.period_end_unix)
            vipExpAlreadyReceived.value = vipExpItem.state === 1
            vipExpNextReceiveAt.value = vipExpAlreadyReceived.value ? nextReceiveAt : null

            if (vipExpItem.state === 0 && vipExpItem.next_receive_days > 0)
              rewardRequests.push(autoReceiveVipExp(accountId, nextReceiveAt))
          }
          else {
            vipExpAlreadyReceived.value = false
            vipExpNextReceiveAt.value = null
          }
        }

        await Promise.all(rewardRequests)
      }
    }
    catch (error) {
      console.error('Failed to check VIP reward status:', error)
      if (isCurrentAccount(accountId))
        hasBCoinToReceive.value = false
    }
  }

  // 自动领取B币
  async function autoReceiveBCoin(accountId = userInfo.mid, nextReceiveAt: number | null = null) {
    if (!isCurrentAccount(accountId) || !hasBCoinToReceive.value) {
      return
    }

    try {
      const res = await api.user.exchangeCoupon({
        type: '1',
        csrf: getCSRF(),
      })

      if (!isCurrentAccount(accountId))
        return

      if (res.code === 0) {
        // 领取成功，更新状态
        bCoinAlreadyReceived.value = true
        hasBCoinToReceive.value = false
        bCoinNextReceiveAt.value = nextReceiveAt
        toast.success('B币券自动领取成功')
      }
      else {
        toast.error(`B币券自动领取失败: ${res.message}`)
      }
    }
    catch {
      if (isCurrentAccount(accountId))
        toast.error('B币券自动领取失败，请稍后重试')
    }
  }

  // 自动领取大会员经验
  async function autoReceiveVipExp(accountId = userInfo.mid, nextReceiveAt: number | null = null) {
    if (!isCurrentAccount(accountId) || userInfo.vip?.status !== 1 || !settings.value.autoReceiveVipExp) {
      return
    }

    // 如果已经记录为已领取，则不再请求
    if (vipExpAlreadyReceived.value && isBeforeNextReceiveAt(vipExpNextReceiveAt.value)) {
      return
    }

    try {
      const res = await api.user.receiveVipExp({
        csrf: getCSRF(),
      })

      if (!isCurrentAccount(accountId))
        return

      if (res.code === 0) {
        // 领取成功，更新状态并显示消息
        vipExpAlreadyReceived.value = true
        vipExpNextReceiveAt.value = nextReceiveAt
        toast.success('大会员经验自动领取成功', { timeout: 1500 })
      }
      else if (res.code === 69198) {
        // 经验已领取，静默更新状态
        vipExpAlreadyReceived.value = true
        vipExpNextReceiveAt.value = nextReceiveAt
      }
      // 其他错误码不处理，下次继续尝试
    }
    catch {
      // 请求失败不处理，下次继续尝试
    }
  }

  // Moments Methods
  async function getTopBarNewMomentsCount(selectedType: string = 'video') {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId) || isLoadingMoments.value)
      return

    try {
      isLoadingMoments.value = true

      const res = await api.moment.getMomentsUpdate({
        type: selectedType,
        update_baseline: '0',
      })

      if (res.code === 0 && res.data && isCurrentAccount(accountId)) {
        newMomentsCount.value = res.data.update_num
      }
    }
    catch (error) {
      console.error(error)
    }
    finally {
      if (isCurrentAccount(accountId))
        isLoadingMoments.value = false
    }
  }

  // 获取稍后再看列表数量
  async function getWatchLaterCount() {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId))
      return

    try {
      const res = await api.watchlater.getWatchLaterListByPage({
        pn: 1,
        ps: 10,
      })
      if (res.code === 0 && isCurrentAccount(accountId)) {
        watchLaterCount.value = res.data.count
      }
    }
    catch (error) {
      console.error(error)
    }
  }

  // 获取稍后再看列表
  async function getAllWatchLaterList() {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId))
      return

    isLoadingWatchLater.value = true

    try {
      const res = await api.watchlater.getWatchLaterListByPage({
        pn: 1,
        ps: 10,
      })
      if (res.code === 0 && isCurrentAccount(accountId)) {
        watchLaterCount.value = res.data.count
        watchLaterList.splice(0)
        Object.assign(watchLaterList, res.data.list)
      }
    }
    catch (error) {
      console.error(error)
    }
    finally {
      if (isCurrentAccount(accountId))
        isLoadingWatchLater.value = false
    }
  }

  // 加载更多稍后再看列表
  async function loadMoreWatchLaterList() {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId) || isLoadingWatchLater.value)
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
      if (res.code === 0 && isCurrentAccount(accountId)) {
        watchLaterList.push(...res.data.list)
      }
    }
    catch (error) {
      console.error(error)
    }
    finally {
      if (isCurrentAccount(accountId))
        isLoadingWatchLater.value = false
    }
  }

  // 删除稍后再看项目
  async function deleteWatchLaterItem(index: number, aid: number) {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId))
      return

    try {
      const res = await api.watchlater.removeFromWatchLater({
        aid,
        csrf: getCSRF(),
      })
      if (res.code === 0 && isCurrentAccount(accountId)) {
        watchLaterList.splice(index, 1)
        watchLaterCount.value = Math.max(0, watchLaterCount.value - 1)

        // 先保留本地乐观更新；B 站删除接口返回后，列表查询偶尔仍会短暂返回旧数量。
        // 延迟同步可避免把刚删除的项目/计数立即覆盖回来。
        window.setTimeout(() => {
          void syncWatchLaterState(true).catch((error) => {
            console.error('刷新顶栏稍后再看状态失败:', error)
          })
        }, 800)
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
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId) || isLoadingMoments.value || noMoreMomentsContent.value)
      return

    isLoadingMoments.value = true
    api.moment.getTopBarMoments({
      type: selectedType,
      update_baseline: momentUpdateBaseline.value || undefined,
      offset: momentOffset.value || undefined,
    })
      .then((res: any) => {
        if (res.code === 0 && isCurrentAccount(accountId)) {
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

            const latestVideoTimes = filteredItems
              .filter((item: any) => item.type === 8)
              .flatMap((item: any) => {
                const time = parseTopBarPublicationTime(item.pub_time)
                if (!time)
                  return []

                const authors = Array.isArray(item.authors) && item.authors.length > 0
                  ? item.authors
                  : [item.author]
                return authors.map((author: any) => ({
                  mid: author?.mid,
                  time,
                }))
              })
            void recordUploaderLatestVideoTimes(latestVideoTimes, 'topbar-pop')

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
      .finally(() => {
        if (isCurrentAccount(accountId))
          isLoadingMoments.value = false
      })
  }

  function extractBvid(item: any): string | null {
    const jumpUrl = typeof item.jump_url === 'string' ? item.jump_url : ''
    const bvMatch = jumpUrl.match(/\/(BV\w+)/)
    if (bvMatch?.[1])
      return bvMatch[1]

    const major = item?.modules?.module_dynamic?.major
    const directBvid = item?.bvid || major?.archive?.bvid || major?.ugc_season?.bvid
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
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId) || isLoadingMoments.value)
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
        if (res.code === 0 && isCurrentAccount(accountId)) {
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
              authorJumpUrl: item.link,
            }),
            ),
          )
        }
      })
      .finally(() => {
        if (isCurrentAccount(accountId))
          isLoadingMoments.value = false
      })
  }

  function isNewMoment(index: number) {
    return index < newMomentsCount.value
  }

  function toggleWatchLater(aid: number) {
    const accountId = userInfo.mid
    if (!isCurrentAccount(accountId))
      return

    const isInWatchLater = addedWatchLaterList.includes(aid)

    if (!isInWatchLater) {
      api.watchlater.saveToWatchLater({
        aid,
        csrf: getCSRF(),
      })
        .then((res: any) => {
          if (res.code === 0 && isCurrentAccount(accountId))
            addedWatchLaterList.push(aid)
        })
    }
    else {
      api.watchlater.removeFromWatchLater({
        aid,
        csrf: getCSRF(),
      })
        .then((res: any) => {
          if (res.code === 0 && isCurrentAccount(accountId)) {
            const index = addedWatchLaterList.indexOf(aid)
            if (index !== -1)
              addedWatchLaterList.splice(index, 1)
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

  let updateTimer: ReturnType<typeof setTimeout> | null = null
  let updateTimerGeneration = 0
  let sharedStateMessagingUnavailable = false

  function disableSharedStateMessaging() {
    sharedStateMessagingUnavailable = true
    stopUpdateTimer()
  }

  function createSharedStateSnapshot(): TopBarSharedState {
    return {
      unReadMessage: { ...unReadMessage },
      unReadDm: { ...unReadDm },
      newMomentsCount: newMomentsCount.value,
      watchLaterCount: watchLaterCount.value,
      hasBCoinToReceive: hasBCoinToReceive.value,
      bCoinAlreadyReceived: bCoinAlreadyReceived.value,
      vipExpAlreadyReceived: vipExpAlreadyReceived.value,
      bCoinNextReceiveAt: bCoinNextReceiveAt.value,
      vipExpNextReceiveAt: vipExpNextReceiveAt.value,
    }
  }

  function applySharedState(snapshot: TopBarSharedState) {
    Object.assign(unReadMessage, snapshot.unReadMessage)
    Object.assign(unReadDm, snapshot.unReadDm)
    newMomentsCount.value = snapshot.newMomentsCount
    watchLaterCount.value = snapshot.watchLaterCount
    hasBCoinToReceive.value = snapshot.hasBCoinToReceive
    bCoinAlreadyReceived.value = snapshot.bCoinAlreadyReceived
    vipExpAlreadyReceived.value = snapshot.vipExpAlreadyReceived
    bCoinNextReceiveAt.value = snapshot.bCoinNextReceiveAt ?? null
    vipExpNextReceiveAt.value = snapshot.vipExpNextReceiveAt ?? null
  }

  onMessage<TopBarStatePublish>(
    TOP_BAR_STATE_MESSAGE.UPDATED,
    ({ accountId, snapshot }) => {
      if (accountId === userInfo.mid)
        applySharedState(snapshot)
    },
  )

  onMessage<TopBarStateInvalidate>(
    TOP_BAR_STATE_MESSAGE.INVALIDATED,
    ({ accountId }) => {
      if (accountId !== userInfo.mid)
        return

      syncSharedData({ force: true, refresh: getUnreadMessageCount }).catch((error) => {
        console.error('刷新已失效的未读消息状态失败:', error)
      })
    },
  )

  onMessage<TopBarFavoritesChanged>(
    TOP_BAR_STATE_MESSAGE.FAVORITES_CHANGED,
    ({ accountId }) => {
      if (accountId === userInfo.mid)
        favoriteStateVersion.value++
    },
  )

  // 他处登录/登出/会话过期导致会话 Cookie 变化时，后台广播此消息（见 issue #921）
  onMessage(TOP_BAR_STATE_MESSAGE.LOGIN_STATE_CHANGED, reconcileLocalLoginState)

  async function refreshSharedData() {
    await Promise.all([
      getUnreadMessageCount(),
      getTopBarNewMomentsCount(),
      getWatchLaterCount(),
      refreshVipRewardStatus(),
    ])
  }

  interface SyncSharedDataOptions {
    force?: boolean
    refresh?: () => Promise<void>
  }

  async function syncSharedDataFromBroker(options: SyncSharedDataOptions) {
    if (!isLogin.value)
      return

    const accountId = userInfo.mid
    if (!accountId)
      return

    const claim = await sendMessage<TopBarStateClaim, TopBarRefreshClaim>(
      TOP_BAR_STATE_MESSAGE.CLAIM_REFRESH,
      {
        accountId,
        maxAge: updateInterval,
        force: options.force,
      },
    )

    // 主动刷新必须使用当前操作的 API 结果，不能先用 broker 中可能过期的
    // snapshot 覆盖本地状态；普通定时同步仍复用 snapshot。
    if (claim.snapshot && !options.force && isCurrentAccount(accountId))
      applySharedState(claim.snapshot)

    if (!claim.shouldRefresh)
      return

    if (claim.refreshId === undefined)
      return

    const refreshId = claim.refreshId

    try {
      if (!isCurrentAccount(accountId)) {
        await sendMessage<TopBarStateRelease>(
          TOP_BAR_STATE_MESSAGE.RELEASE_REFRESH,
          {
            accountId,
            refreshId,
          },
        )
        return
      }

      await (options.refresh?.() ?? refreshSharedData())
      if (!isCurrentAccount(accountId)) {
        await sendMessage<TopBarStateRelease>(
          TOP_BAR_STATE_MESSAGE.RELEASE_REFRESH,
          {
            accountId,
            refreshId,
          },
        )
        return
      }

      await sendMessage<TopBarStatePublish>(
        TOP_BAR_STATE_MESSAGE.PUBLISH,
        {
          accountId,
          snapshot: createSharedStateSnapshot(),
          refreshId,
        },
      )
    }
    catch (error) {
      await sendMessage<TopBarStateRelease>(
        TOP_BAR_STATE_MESSAGE.RELEASE_REFRESH,
        {
          accountId,
          refreshId,
        },
      )
      throw error
    }
  }

  async function syncSharedData(options: SyncSharedDataOptions = {}) {
    if (sharedStateMessagingUnavailable)
      return

    try {
      await syncSharedDataFromBroker(options)
    }
    catch (error) {
      if (!isExtensionContextInvalidatedError(error))
        throw error

      // 扩展重新加载后，旧 content script 的 runtime 无法恢复。
      // 停止轮询并让后续同步短路，等待后台刷新提示引导页面加载新脚本。
      disableSharedStateMessaging()
    }
  }

  function syncUnreadMessageState() {
    return syncSharedData({
      force: true,
      refresh: getUnreadMessageCount,
    })
  }

  function syncMomentsState(selectedType: string = 'video') {
    return syncSharedData({
      force: true,
      refresh: () => getTopBarNewMomentsCount(selectedType),
    })
  }

  function syncWatchLaterState(includeList = false) {
    return syncSharedData({
      force: true,
      refresh: includeList ? getAllWatchLaterList : getWatchLaterCount,
    })
  }

  function invalidateUnreadMessageState() {
    const accountId = userInfo.mid
    if (!accountId || sharedStateMessagingUnavailable)
      return Promise.resolve()

    return sendMessage<TopBarStateInvalidate>(
      TOP_BAR_STATE_MESSAGE.INVALIDATE,
      { accountId },
    ).catch((error) => {
      if (!isExtensionContextInvalidatedError(error))
        throw error

      disableSharedStateMessaging()
    })
  }

  function notifyFavoritesChanged() {
    const accountId = userInfo.mid
    if (!accountId || sharedStateMessagingUnavailable)
      return Promise.resolve()

    return sendMessage<TopBarFavoritesChanged>(
      TOP_BAR_STATE_MESSAGE.FAVORITES_CHANGED,
      { accountId },
    ).catch((error) => {
      if (!isExtensionContextInvalidatedError(error))
        throw error

      disableSharedStateMessaging()
    })
  }

  async function initData() {
    const requestGeneration = loginStateGeneration
    await fetchUserInfoOnce()

    if (requestGeneration !== loginStateGeneration || !isLogin.value)
      return

    await syncSharedData()
  }

  function startUpdateTimer() {
    if (updateTimer)
      return

    const timerGeneration = updateTimerGeneration

    // 登录态由本地事实与事件驱动维护（见 reconcileLocalLoginState），定时器
    // 不再承担登录态轮询，只负责两件事：
    // 1. 已登录但 userInfo 尚未填充（初始化时撞风控/限流）：按
    //    LOGIN_RECHECK_INTERVAL 重查，瞬态失败指数退避（60s → 120s → 240s →
    //    300s 封顶），填充成功即转 2；
    // 2. userInfo 已填充：按 updateInterval 同步角标状态。
    // 未登录时不启动任何轮询，等待事件唤醒（见 issue #921）。
    const maxRecheckInterval = 5 * 60 * 1000
    let recheckInterval = LOGIN_RECHECK_INTERVAL
    const needsRecheck = () => isLogin.value && !userInfo.mid
    const scheduleNext = (delay: number) => {
      if (timerGeneration !== updateTimerGeneration || sharedStateMessagingUnavailable)
        return

      updateTimer = setTimeout(() => {
        if (timerGeneration !== updateTimerGeneration)
          return

        // 扩展重载后旧 content script 的 runtime 已失效：停止轮询，等待刷新
        if (sharedStateMessagingUnavailable) {
          updateTimer = null
          return
        }

        if (needsRecheck()) {
          fetchUserInfoOnce()
            .then((status) => {
              if (timerGeneration !== updateTimerGeneration)
                return

              // 重查判定真实登出（-101）：停止轮询，等待事件唤醒
              if (!isLogin.value) {
                updateTimer = null
                return
              }

              // 只有瞬态失败才退避；填充成功即复位到基准间隔
              if (status === LoginStatus.TransientError)
                recheckInterval = Math.min(recheckInterval * 2, maxRecheckInterval)
              else
                recheckInterval = LOGIN_RECHECK_INTERVAL

              // userInfo 填充成功后立即同步一次角标状态，不用等下一个 tick
              if (!needsRecheck()) {
                void syncSharedData().catch((error) => {
                  console.error('同步顶栏共享状态失败:', error)
                })
              }
              scheduleNext(needsRecheck() ? recheckInterval : updateInterval)
            })
          return
        }

        if (!isLogin.value) {
          // 未登录：停止轮询，等待 Cookie 事件或可见性校正唤醒
          updateTimer = null
          return
        }

        recheckInterval = LOGIN_RECHECK_INTERVAL
        syncSharedData().catch((error) => {
          console.error('同步顶栏共享状态失败:', error)
        })
        scheduleNext(updateInterval)
      }, delay)
    }

    if (!isLogin.value)
      return

    scheduleNext(needsRecheck() ? LOGIN_RECHECK_INTERVAL : updateInterval)
  }
  function stopUpdateTimer() {
    updateTimerGeneration++
    if (updateTimer) {
      clearTimeout(updateTimer)
      updateTimer = null
    }
  }

  function cleanup() {
    stopUpdateTimer()
    invalidateLoginStateRequests()

    if (!isLogin.value) {
      lastLoggedOutMid = getLocalLoginMid()
      clearUserInfo()
    }

    resetAccountScopedState()

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
    favoriteStateVersion,
    isLoadingWatchLater,
    drawerVisible,
    notificationsDrawerUrl,
    popupVisible,

    isSearchPage,
    isTopBarFixed,
    showTopBar,

    getUserInfo: fetchUserInfoOnce,
    reconcileLocalLoginState,
    getUnreadMessageCount,
    getTopBarNewMomentsCount,
    handleNotificationsItemClick,
    closeAllPopups,
    initData,
    cleanup,
    isMouseOverPopup,
    setMouseOverPopup,
    getMouseOverPopup,
    syncSharedData,
    syncUnreadMessageState,
    syncMomentsState,
    syncWatchLaterState,
    invalidateUnreadMessageState,
    notifyFavoritesChanged,
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

    getWatchLaterCount,
    getAllWatchLaterList,
    loadMoreWatchLaterList,
    deleteWatchLaterItem,

    privilegeInfo,
    hasBCoinToReceive,
    bCoinAlreadyReceived,
    vipExpAlreadyReceived,

    topBarVisible,
    searchKeyword,
    setTopBarVisible,
    isSwitcherButtonVisible,
    setSwitcherButtonVisible,
  }
})
