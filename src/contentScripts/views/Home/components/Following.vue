<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { Author, Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import type { GridLayoutType } from '~/logic'
import type { DataItem as MomentItem, MomentResult } from '~/models/moment/moment'
import api from '~/utils/api'
import { calcTimeSince, parseStatNumber } from '~/utils/dataFormatter'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

interface Props {
  gridLayout?: GridLayoutType
}

interface UploaderInfo {
  mid: number
  name: string
  face: string
  hasUpdate: boolean
  lastUpdateTime: number
}

interface VideoElement {
  uniqueId: string
  bvid?: string
  item?: MomentItem
  authorList?: Author[]
  displayData?: Video
}

withDefaults(defineProps<Props>(), {
  gridLayout: 'adaptive',
})

const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()

useI18n()

const videoList = ref<VideoElement[]>([])
const uploaderList = ref<UploaderInfo[]>([])
const selectedUploader = ref<number | null>(null) // null means "All"
const previousSelectedUploader = ref<number | null>(null)
const isLoadingUploaderTimes = ref<boolean>(false) // 是否正在后台加载UP主时间
const loadedUploaderTimesCount = ref<number>(0) // 已加载时间的UP主数量

// Provide selectedUploader to child components for preview loading control
provide('moments-selected-uploader', selectedUploader)
const isLoading = ref<boolean>(false)
const noMoreContent = ref<boolean>(false)
const needToLoginFirst = ref<boolean>(false)

// 分别管理ALL和单个UP主的分页状态
const allViewOffset = ref<string>('')
const allViewUpdateBaseline = ref<string>('')
const userMomentsOffset = ref<string>('')

const uploaderListContainerRef = ref<HTMLElement | null>(null)
const currentUserMid = ref<number>(0) // 当前登录用户的mid

// Track viewed uploaders in localStorage
const VIEWED_UPLOADERS_KEY = 'bewlycat_moments_viewed_uploaders'
// Cache uploader latest times in localStorage
const UPLOADER_TIMES_CACHE_KEY = 'bewlycat_uploader_latest_times'
const CACHE_EXPIRY_DAYS = 1 // 缓存1天后过期

function getViewedUploaders(): Record<number, number> {
  try {
    const data = localStorage.getItem(VIEWED_UPLOADERS_KEY)
    return data ? JSON.parse(data) : {}
  }
  catch {
    return {}
  }
}

// 获取缓存的UP主时间
function getCachedUploaderTimes(): Record<number, { time: number, cachedAt: number }> {
  try {
    const data = localStorage.getItem(UPLOADER_TIMES_CACHE_KEY)
    if (!data)
      return {}

    const cache = JSON.parse(data)
    const now = Date.now()
    const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

    // 过滤过期的缓存
    const validCache: Record<number, { time: number, cachedAt: number }> = {}
    for (const [mid, value] of Object.entries(cache)) {
      if (now - (value as any).cachedAt < expiryMs) {
        validCache[Number(mid)] = value as any
      }
    }

    return validCache
  }
  catch {
    return {}
  }
}

// 保存UP主时间到缓存
function cacheUploaderTime(mid: number, time: number) {
  try {
    const cache = getCachedUploaderTimes()
    cache[mid] = {
      time,
      cachedAt: Date.now(),
    }
    localStorage.setItem(UPLOADER_TIMES_CACHE_KEY, JSON.stringify(cache))
  }
  catch (error) {
    console.error('[Following] Failed to cache uploader time:', error)
  }
}

function markUploaderAsViewed(mid: number) {
  const viewed = getViewedUploaders()
  viewed[mid] = Date.now()
  localStorage.setItem(VIEWED_UPLOADERS_KEY, JSON.stringify(viewed))

  const uploader = uploaderList.value.find(u => u.mid === mid)
  if (uploader) {
    uploader.hasUpdate = false
  }
}

function sortUploaderList(excludeMid: number | null = null) {
  let excludedUploader: UploaderInfo | undefined
  let excludedIndex = -1

  if (excludeMid !== null) {
    excludedIndex = uploaderList.value.findIndex(u => u.mid === excludeMid)
    if (excludedIndex !== -1) {
      excludedUploader = uploaderList.value[excludedIndex]
      uploaderList.value.splice(excludedIndex, 1)
    }
  }

  uploaderList.value.sort((a, b) => {
    if (a.hasUpdate !== b.hasUpdate)
      return a.hasUpdate ? -1 : 1
    return b.lastUpdateTime - a.lastUpdateTime
  })

  if (excludedUploader && excludedIndex !== -1) {
    uploaderList.value.splice(excludedIndex, 0, excludedUploader)
  }
}

function updateUploaderStatus() {
  const viewed = getViewedUploaders()
  uploaderList.value = uploaderList.value.map((uploader) => {
    const viewedTime = viewed[uploader.mid] || 0
    return {
      ...uploader,
      hasUpdate: uploader.lastUpdateTime > viewedTime,
    }
  })

  uploaderList.value.sort((a, b) => {
    if (a.hasUpdate !== b.hasUpdate)
      return a.hasUpdate ? -1 : 1
    return b.lastUpdateTime - a.lastUpdateTime
  })
}

const unreadUploadersCount = computed(() => {
  return uploaderList.value.filter(uploader => uploader.hasUpdate).length
})

const gridKey = computed(() => `following-grid-${selectedUploader.value ?? 'all'}`)

// 获取当前用户信息以获取关注列表
async function getCurrentUserInfo() {
  try {
    const response: any = await api.user.getUserInfo()
    if (response.code === 0 && response.data?.mid) {
      currentUserMid.value = response.data.mid
      return response.data.mid
    }
  }
  catch (error) {
    console.error('[Following] Failed to get current user info:', error)
  }
  return 0
}

// 加载关注列表（独立API）- 加载所有关注的UP主
async function loadFollowingList() {
  console.log('[Following] Loading all following list...')

  if (!currentUserMid.value) {
    const mid = await getCurrentUserInfo()
    if (!mid) {
      needToLoginFirst.value = true
      return
    }
  }

  try {
    const allFollowings: any[] = []
    let currentPage = 1
    const pageSize = 50
    let hasMore = true

    // 持续加载所有关注的UP主
    while (hasMore) {
      console.log(`[Following] Loading following list page ${currentPage}...`)

      const response: any = await api.user.getUserFollowings({
        vmid: currentUserMid.value.toString(),
        ps: pageSize,
        pn: currentPage,
      })

      console.log(`[Following] Following list page ${currentPage} response:`, response.code, 'count:', response.data?.list?.length)

      if (response.code === -101) {
        needToLoginFirst.value = true
        return
      }

      if (response.code === 0 && response.data?.list) {
        const followings = response.data.list
        allFollowings.push(...followings)

        // 检查是否还有更多
        const total = response.data.total
        if (allFollowings.length >= total || followings.length < pageSize) {
          hasMore = false
          console.log('[Following] All followings loaded. Total:', allFollowings.length)
        }
        else {
          currentPage++
        }
      }
      else {
        hasMore = false
        console.log('[Following] API returned error code:', response.code)
      }
    }

    if (allFollowings.length > 0) {
      const viewed = getViewedUploaders()
      const cachedTimes = getCachedUploaderTimes()

      uploaderList.value = allFollowings.map((user: any) => {
        const cachedTime = cachedTimes[user.mid]
        return {
          mid: user.mid,
          name: user.uname,
          face: user.face,
          hasUpdate: true,
          // 优先使用缓存的时间，否则使用关注时间
          lastUpdateTime: cachedTime ? cachedTime.time : user.mtime * 1000,
        }
      })

      // 更新已读状态
      uploaderList.value = uploaderList.value.map((uploader) => {
        const viewedTime = viewed[uploader.mid] || 0
        return {
          ...uploader,
          hasUpdate: uploader.lastUpdateTime > viewedTime,
        }
      })

      // 初始排序
      updateUploaderStatus()

      console.log('[Following] Successfully loaded', uploaderList.value.length, 'followings')
      console.log('[Following] Loaded from cache:', Object.keys(cachedTimes).length, 'uploader times')

      // 后台逐个加载UP主最新视频时间（使用并发控制）
      startLoadingUploaderTimesInBackground()
    }
  }
  catch (error) {
    console.error('[Following] Failed to load following list:', error)
  }
}

// 并发控制器：后台逐个加载UP主最新视频时间
async function startLoadingUploaderTimesInBackground() {
  if (isLoadingUploaderTimes.value) {
    return
  }

  isLoadingUploaderTimes.value = true
  loadedUploaderTimesCount.value = 0

  // 初始延迟：等待页面稳定后再开始（避免页面刚加载就触发风控）
  const INITIAL_DELAY = 2000 + Math.random() * 1000 // 2-3秒随机延迟
  console.log(`[Following] Will start loading uploader times in ${Math.round(INITIAL_DELAY / 1000)}s...`)
  await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY))

  console.log('[Following] Starting background loading of uploader times with concurrency control...')

  // 构建请求队列（优先级：选中的 > 无缓存的 > 有缓存的按时间排序）
  const queue: number[] = []
  const cachedTimes = getCachedUploaderTimes()

  // 1. 优先加载当前选中的UP主
  if (selectedUploader.value !== null) {
    queue.push(selectedUploader.value)
  }

  // 2. 分类其他UP主：无缓存 vs 有缓存
  const uncachedUploaders: number[] = []
  const cachedUploaders: { mid: number, time: number }[] = []

  for (const uploader of uploaderList.value) {
    if (uploader.mid === selectedUploader.value) {
      continue // 跳过已选中的
    }

    if (cachedTimes[uploader.mid]) {
      // 有缓存：记录mid和时间用于后续排序
      cachedUploaders.push({
        mid: uploader.mid,
        time: uploader.lastUpdateTime,
      })
    }
    else {
      // 无缓存：优先更新（使用的是关注时间，不准确）
      uncachedUploaders.push(uploader.mid)
    }
  }

  // 3. 有缓存的按lastUpdateTime降序排序（最近更新的优先）
  cachedUploaders.sort((a, b) => b.time - a.time)

  // 4. 构建最终队列
  queue.push(...uncachedUploaders) // 先加载无缓存的
  queue.push(...cachedUploaders.map(u => u.mid)) // 再按时间顺序加载有缓存的

  console.log(`[Following] Queue built: ${queue.length} uploaders (selected: ${selectedUploader.value ? 1 : 0}, uncached: ${uncachedUploaders.length}, cached: ${cachedUploaders.length})`)

  // 并发控制参数
  const MAX_CONCURRENT = 2 // 同时最多2个请求
  const MIN_DELAY = 1200 // 最小间隔1200ms（增加到1.2秒）
  const MAX_DELAY = 2000 // 最大间隔2000ms（增加到2秒）

  let activeRequests = 0
  let queueIndex = 0

  // 随机延迟函数
  const randomDelay = () => {
    const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY)
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  // 处理队列
  const processQueue = async () => {
    while (queueIndex < queue.length) {
      // 等待有空闲槽位
      // eslint-disable-next-line no-unmodified-loop-condition
      while (activeRequests >= MAX_CONCURRENT) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const mid = queue[queueIndex++]
      activeRequests++

      // 异步执行请求
      loadSingleUploaderTime(mid).finally(() => {
        activeRequests--
      })

      // 随机延迟，避免被检测为机器行为
      await randomDelay()
    }

    // 等待所有请求完成
    // eslint-disable-next-line no-unmodified-loop-condition
    while (activeRequests > 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  await processQueue()

  isLoadingUploaderTimes.value = false
  console.log('[Following] Finished loading all uploader times')
}

// 加载单个UP主的最新视频时间（只获取时间，不加载视频列表）
async function loadSingleUploaderTime(mid: number, retryCount: number = 0) {
  const MAX_RETRIES = 2

  try {
    const response: MomentResult = await api.moment.getUserMoments({
      host_mid: mid.toString(),
      offset: '',
      features: 'itemOpusStyle',
    })

    if (response.code === 0 && response.data.items) {
      // 收集前两个视频动态（考虑置顶的情况）
      const videoItems: { item: MomentItem, time: number }[] = []

      for (const item of response.data.items) {
        if (item.modules?.module_dynamic?.major?.archive && item.modules?.module_author?.pub_ts) {
          videoItems.push({
            item,
            time: item.modules.module_author.pub_ts * 1000,
          })

          // 只需要前两个视频动态（第一个可能是置顶，第二个是最新发布）
          if (videoItems.length >= 2) {
            break
          }
        }
      }

      if (videoItems.length > 0) {
        const uploader = uploaderList.value.find(u => u.mid === mid)
        if (uploader) {
          // 如果有两个视频，比较时间选择最新的
          // 如果只有一个视频，直接使用它的时间
          const latestTime = videoItems.length === 1
            ? videoItems[0].time
            : Math.max(videoItems[0].time, videoItems[1].time)

          uploader.lastUpdateTime = latestTime
          loadedUploaderTimesCount.value++

          // 缓存到localStorage
          cacheUploaderTime(mid, latestTime)

          console.log(`[Following] Updated time for UP ${mid} (${loadedUploaderTimesCount.value}/${uploaderList.value.length})`)

          // 每次更新后重新排序（但保持锁定的UP主位置）
          sortUploaderList(selectedUploader.value)
        }
      }
    }
  }
  catch (error) {
    // 如果是风控错误且未超过重试次数，等待后重试
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('风控') && retryCount < MAX_RETRIES) {
      const retryDelay = (retryCount + 1) * 3000 // 3秒、6秒递增
      console.warn(`[Following] Rate limited for UP ${mid}, retrying in ${retryDelay / 1000}s... (${retryCount + 1}/${MAX_RETRIES})`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return loadSingleUploaderTime(mid, retryCount + 1)
    }

    console.error(`[Following] Failed to load time for UP ${mid}:`, error)
  }
}

// 加载ALL视图的动态流（限制3页）
async function loadAllViewVideos(maxPages: number = 3) {
  console.log('[Following] Loading ALL view videos (max', maxPages, 'pages)...')
  emit('beforeLoading')
  isLoading.value = true

  try {
    let tempOffset = allViewOffset.value || undefined
    let pageCount = 0

    while (pageCount < maxPages) {
      pageCount++
      console.log(`[Following] Loading ALL view page ${pageCount}...`)

      const response: MomentResult = await api.moment.getMoments({
        type: 'video',
        offset: tempOffset,
        update_baseline: allViewUpdateBaseline.value || undefined,
      })

      if (response.code === -101) {
        needToLoginFirst.value = true
        console.log('[Following] Need to login first')
        return
      }

      if (response.code === 0) {
        const newOffset = response.data.offset
        allViewUpdateBaseline.value = response.data.update_baseline

        if (newOffset === '0' || newOffset === tempOffset) {
          noMoreContent.value = true
          console.log('[Following] No more content in ALL view')
          break
        }
        else {
          tempOffset = newOffset
          allViewOffset.value = newOffset
        }

        response.data.items.forEach((item: MomentItem) => {
          const authors: Author[] = []

          if ((item.modules?.module_dynamic?.major?.archive?.stat as any)?.coop_num) {
            (item.modules.module_dynamic.major.archive as any).coop_info?.forEach((coop: any) => {
              authors.push({
                name: coop.name,
                authorFace: coop.face,
                mid: coop.mid,
              })
            })
          }
          else {
            authors.push({
              name: item.modules?.module_author?.name,
              authorFace: item.modules?.module_author?.face,
              mid: item.modules?.module_author?.mid,
            })
          }

          videoList.value.push({
            uniqueId: `following-all-${item.id_str}`,
            bvid: item.modules?.module_dynamic?.major?.archive?.bvid,
            item,
            authorList: authors,
            displayData: mapMomentItemToVideo(item, authors),
          })
        })

        console.log(`[Following] ALL view page ${pageCount} loaded. Total videos:`, videoList.value.length)
      }
      else {
        console.log('[Following] API returned error code:', response.code)
        break
      }
    }

    console.log('[Following] ALL view loading complete. Total:', videoList.value.length, 'videos')
  }
  catch (error) {
    console.error('[Following] Failed to load ALL view:', error)
  }
  finally {
    isLoading.value = false
    emit('afterLoading')
  }
}

// 加载单个UP主的动态（限制3页）
async function loadUserMoments(mid: number, maxPages: number = 3) {
  console.log('[Following] Loading moments for UP', mid, '(max', maxPages, 'pages)...')
  emit('beforeLoading')
  isLoading.value = true

  try {
    let tempOffset = userMomentsOffset.value || undefined
    let pageCount = 0
    let hasUpdatedTime = false // 标记是否已更新时间

    while (pageCount < maxPages) {
      pageCount++
      console.log(`[Following] Loading user moments page ${pageCount}...`)

      const response: MomentResult = await api.moment.getUserMoments({
        host_mid: mid.toString(),
        offset: tempOffset,
        features: 'itemOpusStyle',
      })

      console.log('[Following] API Response:', response)

      if (response.code === -101) {
        needToLoginFirst.value = true
        console.log('[Following] Need to login first')
        return
      }

      if (response.code === 0) {
        const newOffset = response.data.offset

        if (newOffset === '0' || newOffset === tempOffset || !response.data.items || response.data.items.length === 0) {
          noMoreContent.value = true
          console.log('[Following] No more content for this UP')
          break
        }
        else {
          tempOffset = newOffset
          userMomentsOffset.value = newOffset
        }

        // 收集所有视频动态用于显示
        const allVideoItems: { item: MomentItem, time: number }[] = []

        response.data.items.forEach((item: MomentItem) => {
          // 只处理包含视频的动态
          if (!item.modules?.module_dynamic?.major?.archive) {
            return
          }

          const authors: Author[] = []

          if ((item.modules?.module_dynamic?.major?.archive?.stat as any)?.coop_num) {
            (item.modules.module_dynamic.major.archive as any).coop_info?.forEach((coop: any) => {
              authors.push({
                name: coop.name,
                authorFace: coop.face,
                mid: coop.mid,
              })
            })
          }
          else {
            authors.push({
              name: item.modules?.module_author?.name,
              authorFace: item.modules?.module_author?.face,
              mid: item.modules?.module_author?.mid,
            })
          }

          const displayData = mapMomentItemToVideo(item, authors)
          if (displayData) {
            const time = item.modules.module_author.pub_ts * 1000

            videoList.value.push({
              uniqueId: `user-moment-${item.id_str}`,
              bvid: item.modules?.module_dynamic?.major?.archive?.bvid,
              item,
              authorList: authors,
              displayData,
            })

            allVideoItems.push({ item, time })
          }
        })

        // 更新UP主时间：比较前两个视频动态，选择最新的
        if (!hasUpdatedTime && allVideoItems.length > 0) {
          const uploader = uploaderList.value.find(u => u.mid === mid)
          if (uploader) {
            // 如果有两个或更多视频，比较前两个的时间
            const latestTime = allVideoItems.length === 1
              ? allVideoItems[0].time
              : Math.max(allVideoItems[0].time, allVideoItems[1].time)

            uploader.lastUpdateTime = latestTime
            hasUpdatedTime = true

            // 缓存到localStorage（与后台加载保持一致）
            cacheUploaderTime(mid, latestTime)

            console.log(`[Following] Updated lastUpdateTime for UP ${mid}:`, new Date(latestTime))
          }
        }

        console.log(`[Following] User moments page ${pageCount} loaded. Total:`, videoList.value.length)
      }
      else {
        console.log('[Following] API returned error code:', response.code)
        break
      }
    }

    console.log('[Following] User moments loading complete. Total:', videoList.value.length, 'videos')
  }
  catch (error) {
    console.error('[Following] Failed to load user moments:', error)
  }
  finally {
    isLoading.value = false
    emit('afterLoading')
  }
}

// 切换UP主
function selectUploader(mid: number | null) {
  console.log('[Following] Selecting uploader:', mid === null ? 'All' : mid)

  // 重置视频列表和分页状态
  videoList.value = []
  noMoreContent.value = false

  if (mid === null) {
    // 切换到ALL视图
    console.log('[Following] Switching to All view')

    if (previousSelectedUploader.value !== null) {
      sortUploaderList(null)
    }

    selectedUploader.value = null
    previousSelectedUploader.value = null

    // 重置ALL视图分页
    allViewOffset.value = ''
    allViewUpdateBaseline.value = ''

    // 加载ALL视图
    loadAllViewVideos(3)
  }
  else {
    // 切换到具体UP主
    console.log('[Following] Selecting uploader:', mid)

    markUploaderAsViewed(mid)

    if (previousSelectedUploader.value !== null && previousSelectedUploader.value !== mid) {
      sortUploaderList(mid)
    }

    selectedUploader.value = mid
    previousSelectedUploader.value = mid

    // 重置用户动态分页
    userMomentsOffset.value = ''

    // 优先加载当前UP主的时间（如果还未加载）
    const uploader = uploaderList.value.find(u => u.mid === mid)
    if (uploader && uploader.lastUpdateTime && uploader.lastUpdateTime < Date.now() - 365 * 24 * 60 * 60 * 1000) {
      // 如果时间看起来是旧的关注时间（超过1年），优先更新
      loadSingleUploaderTime(mid)
    }

    // 加载UP主动态
    loadUserMoments(mid, 3)
  }
}

// 将moment item转换为Video格式
function mapMomentItemToVideo(item?: MomentItem, authors?: Author[]): Video | undefined {
  if (!item)
    return undefined

  const archive = item.modules?.module_dynamic?.major?.archive
  if (!archive)
    return undefined

  const stat = archive.stat
  const likeCount = item.modules?.module_stat?.like?.count

  const decodedAuthors = authors?.map(author => ({
    ...author,
    name: decodeHtmlEntities(author.name),
  }))

  const authorValue = decodedAuthors && decodedAuthors.length > 0
    ? (decodedAuthors.length === 1 ? decodedAuthors[0] : decodedAuthors)
    : undefined

  const isCollaboration = authors && authors.length > 1

  const badge = archive.badge?.text && archive.badge.text !== '投稿视频'
    ? {
        bgColor: archive.badge.bg_color,
        color: archive.badge.color,
        iconUrl: archive.badge.icon_url || undefined,
        text: decodeHtmlEntities(archive.badge.text),
      }
    : undefined

  const id = Number.parseInt(archive.aid, 10)

  return {
    id: Number.isNaN(id) ? 0 : id,
    durationStr: archive.duration_text,
    title: decodeHtmlEntities(archive.title),
    desc: decodeHtmlEntities(archive.desc),
    cover: archive.cover,
    author: authorValue,
    view: parseStatNumber(stat?.play),
    viewStr: stat?.play,
    danmaku: parseStatNumber(stat?.danmaku),
    danmakuStr: stat?.danmaku,
    like: typeof likeCount === 'number' ? likeCount : parseStatNumber(stat?.like),
    likeStr: stat?.like_str ?? stat?.like,
    capsuleText: decodeHtmlEntities(item.modules?.module_author?.pub_time?.trim() || undefined),
    publishedTimestamp: item.modules?.module_author?.pub_ts,
    bvid: archive.bvid,
    badge,
    tag: isCollaboration ? '联合投稿' : undefined,
    threePointV2: [],
  }
}

function transformVideoItem(item: VideoElement): Video | undefined {
  return item.displayData
}

// 加载更多
async function handleLoadMore() {
  if (isLoading.value || noMoreContent.value)
    return

  console.log('[Following] Loading more...')

  if (selectedUploader.value === null) {
    // ALL视图：继续加载视频
    await loadAllViewVideos(1)
  }
  else {
    // UP主视图：继续加载动态
    await loadUserMoments(selectedUploader.value, 1)
  }
}

// 初始化
function initData() {
  console.log('[Following] Initializing...')

  // 保存当前选中的UP主
  const currentSelectedUploader = selectedUploader.value

  videoList.value = []
  allViewOffset.value = ''
  allViewUpdateBaseline.value = ''
  userMomentsOffset.value = ''
  noMoreContent.value = false
  needToLoginFirst.value = false

  // 如果当前已经选中了某个UP主，刷新该UP主的动态
  if (currentSelectedUploader !== null) {
    console.log('[Following] Refreshing moments for UP', currentSelectedUploader)
    loadUserMoments(currentSelectedUploader, 3)
  }
  else {
    // 否则，先加载关注列表，然后加载ALL视图
    if (uploaderList.value.length === 0) {
      loadFollowingList().then(() => {
        console.log('[Following] Following list loaded')
        selectUploader(null)
      }).catch((error) => {
        console.error('[Following] Failed to initialize:', error)
      })
    }
    else {
      // 如果关注列表已经加载过，直接刷新ALL视图
      console.log('[Following] Refreshing ALL view')
      loadAllViewVideos(3)
    }
  }
}

function jumpToLoginPage() {
  location.href = 'https://passport.bilibili.com/login'
}

// 阻止滚动事件冒泡
function handleWheel(e: WheelEvent) {
  const componentInstance = uploaderListContainerRef.value
  if (!componentInstance)
    return

  const osInstance = (componentInstance as any).osInstance?.()
  if (!osInstance)
    return

  const viewport = osInstance.elements?.().viewport
  if (!viewport)
    return

  const { scrollTop, scrollHeight, clientHeight } = viewport
  const isScrollingDown = e.deltaY > 0
  const isScrollingUp = e.deltaY < 0
  const isAtTop = scrollTop === 0
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1

  if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

onMounted(() => {
  initData()

  nextTick(() => {
    const componentInstance = uploaderListContainerRef.value
    if (componentInstance) {
      const osInstance = (componentInstance as any).osInstance?.()
      if (osInstance) {
        const viewport = osInstance.elements?.().viewport
        if (viewport) {
          viewport.addEventListener('wheel', handleWheel, { passive: false })
        }
      }
    }
  })
})

onBeforeUnmount(() => {
  const componentInstance = uploaderListContainerRef.value
  if (componentInstance) {
    const osInstance = (componentInstance as any).osInstance?.()
    if (osInstance) {
      const viewport = osInstance.elements?.().viewport
      if (viewport) {
        viewport.removeEventListener('wheel', handleWheel)
      }
    }
  }
})

defineExpose({ initData })
</script>

<template>
  <div flex="~" w-full gap-4 style="height: calc(100vh - 180px);">
    <!-- Left Panel: Uploader List -->
    <aside
      w-280px shrink-0 bg="$bew-elevated" rounded="$bew-radius"
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      border="1 $bew-border-color"
      style="backdrop-filter: var(--bew-filter-glass-1);"
      overflow-hidden flex="~ col" h-full
    >
      <div p-4 border="b-1 $bew-border-color">
        <h3 text="lg" font-bold>
          {{ $t('home.following') }}
        </h3>
      </div>

      <OverlayScrollbarsComponent
        ref="uploaderListContainerRef"
        element="div" defer
        :options="{
          scrollbars: { autoHide: 'leave', autoHideDelay: 300 },
          overflow: { x: 'hidden', y: 'scroll' },
        }"
        flex-1 overflow-y-auto
      >
        <div p-2>
          <!-- All Uploaders Option -->
          <button
            :class="{
              'uploader-item-active': selectedUploader === null,
            }"
            class="uploader-item"
            @click="selectUploader(null)"
          >
            <div
              w-40px h-40px rounded-full
              bg="$bew-fill-2" flex="~ items-center justify-center"
            >
              <div i-mingcute:classify-2-fill text-xl />
            </div>
            <div flex-1 ml-3 text-left>
              <div font-medium>
                {{ $t('topbar.moments_dropdown.tabs.all') }}
              </div>
              <div text="xs $bew-text-2">
                {{ $t('home.uploaders_with_updates', { count: unreadUploadersCount }) }}
              </div>
            </div>
          </button>

          <!-- Individual Uploaders -->
          <button
            v-for="uploader in uploaderList"
            :key="uploader.mid"
            :class="{
              'uploader-item-active': selectedUploader === uploader.mid,
            }"
            class="uploader-item"
            @click="selectUploader(uploader.mid)"
          >
            <div pos="relative" shrink-0>
              <img
                :src="`${uploader.face}@50w_50h`"
                w-40px h-40px rounded-full object-cover
                loading="lazy"
                alt="Avatar"
              >
              <!-- Red dot for new updates -->
              <div
                v-if="uploader.hasUpdate"
                pos="absolute top-0 right-0"
                w-10px h-10px rounded-full
                bg="red-500" border="2 $bew-elevated"
              />
            </div>
            <div flex-1 ml-3 text-left overflow-hidden>
              <div font-medium truncate>
                {{ uploader.name }}
              </div>
              <div text="xs $bew-text-2">
                {{ calcTimeSince(uploader.lastUpdateTime) }}
              </div>
            </div>
          </button>
        </div>
      </OverlayScrollbarsComponent>
    </aside>

    <!-- Right Panel: Video Feed -->
    <main flex-1 h-full overflow-y-auto overflow-x-hidden>
      <VideoCardGrid
        :key="gridKey"
        :items="videoList"
        :grid-layout="gridLayout"
        :loading="isLoading"
        :no-more-content="noMoreContent"
        :need-to-login-first="needToLoginFirst"
        :transform-item="transformVideoItem"
        :get-item-key="(item: VideoElement) => item.uniqueId"
        :show-watcher-later="false"
        show-preview
        @refresh="initData"
        @login="jumpToLoginPage"
        @load-more="handleLoadMore"
      />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.uploader-item {
  --uno: "w-full flex items-center p-3 rounded-$bew-radius cursor-pointer";
  --uno: "hover:bg-$bew-fill-2 transition-colors duration-200";

  &-active {
    --uno: "bg-$bew-theme-color-20 hover:bg-$bew-theme-color-30";
  }
}
</style>
