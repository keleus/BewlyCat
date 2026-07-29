const commentFloorByReplyKey = new Map<string, number>()
const commentFloorRequests = new Map<string, Promise<void>>()
const commentFloorRequestQueue: Array<() => void> = []
const COMMENT_FLOOR_REQUEST_CONCURRENCY = 3
let activeCommentFloorRequests = 0

function toIdString(id: unknown): string | null {
  if (id === null || id === undefined || id === '')
    return null
  return String(id)
}

function getReplyOid(replyItem: any): string | null {
  return toIdString(replyItem?.oid_str ?? replyItem?.oid)
}

function getReplyRpid(replyItem: any): string | null {
  return toIdString(replyItem?.rpid_str ?? replyItem?.rpid)
}

function getReplyRootRpid(replyItem: any): string | null {
  return toIdString(replyItem?.root_str ?? replyItem?.root)
}

function getReplyType(replyItem: any): string | null {
  return toIdString(replyItem?.type)
}

function getReplyDialogRpid(replyItem: any): string | null {
  return toIdString(replyItem?.dialog_str ?? replyItem?.dialog)
}

function toFloorNumber(floor: unknown): number | null {
  const floorNumber = Number(floor)
  return Number.isSafeInteger(floorNumber) && floorNumber > 0
    ? floorNumber
    : null
}

function getCommentFloorCacheKey(type: string, oid: string, rpid: string) {
  return `${type}:${oid}:${rpid}`
}

export function getCachedCommentFloor(replyItem: any): number | null {
  const directFloor = toFloorNumber(replyItem?.floor)
  if (directFloor)
    return directFloor

  const oid = getReplyOid(replyItem)
  const rpid = getReplyRpid(replyItem)
  if (!oid || !rpid)
    return null

  return commentFloorByReplyKey.get(
    getCommentFloorCacheKey(getReplyType(replyItem) ?? '1', oid, rpid),
  ) ?? null
}

function cacheCommentReplyFloors(
  replyItem: any,
  fallbackType: string,
  fallbackOid: string,
) {
  if (!replyItem)
    return

  const type = getReplyType(replyItem) ?? fallbackType
  const oid = getReplyOid(replyItem) ?? fallbackOid
  const rpid = getReplyRpid(replyItem)
  const floor = toFloorNumber(replyItem.floor)

  if (oid && rpid && floor) {
    commentFloorByReplyKey.set(
      getCommentFloorCacheKey(type, oid, rpid),
      floor,
    )
  }

  if (Array.isArray(replyItem.replies)) {
    replyItem.replies.forEach((reply: any) => {
      cacheCommentReplyFloors(reply, type, oid)
    })
  }
}

function drainCommentFloorRequestQueue() {
  while (
    activeCommentFloorRequests < COMMENT_FLOOR_REQUEST_CONCURRENCY
    && commentFloorRequestQueue.length > 0
  ) {
    const startRequest = commentFloorRequestQueue.shift()
    if (!startRequest)
      return
    activeCommentFloorRequests += 1
    startRequest()
  }
}

function enqueueCommentFloorRequest<T>(request: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    commentFloorRequestQueue.push(() => {
      void request()
        .then(resolve, reject)
        .finally(() => {
          activeCommentFloorRequests -= 1
          drainCommentFloorRequestQueue()
        })
    })
    drainCommentFloorRequestQueue()
  })
}

function requestCommentFloorData(
  requestKey: string,
  requestUrl: URL,
  type: string,
  oid: string,
): Promise<void> {
  const cachedRequest = commentFloorRequests.get(requestKey)
  if (cachedRequest)
    return cachedRequest

  const request = enqueueCommentFloorRequest(async () => {
    const response = await window.fetch(requestUrl, {
      method: 'GET',
      credentials: 'include',
    })
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`)

    const responseData = await response.json()
    if (responseData?.code !== 0 || !responseData.data)
      throw new Error(`API ${responseData?.code ?? 'unknown'}: ${responseData?.message ?? 'unknown error'}`)

    cacheCommentReplyFloors(responseData.data.root, type, oid)
    if (Array.isArray(responseData.data.replies)) {
      responseData.data.replies.forEach((reply: any) => {
        cacheCommentReplyFloors(reply, type, oid)
      })
    }
  }).catch((error) => {
    console.warn(`[BewlyCat] Failed to fetch comment floor data (${requestUrl.pathname}).`, error)
  })

  commentFloorRequests.set(requestKey, request)
  return request
}

export async function resolveCommentFloor(replyItem: any): Promise<number | null> {
  const cachedFloor = getCachedCommentFloor(replyItem)
  if (cachedFloor)
    return cachedFloor

  const oid = getReplyOid(replyItem)
  const rpid = getReplyRpid(replyItem)
  if (!oid || !rpid)
    return null

  const type = getReplyType(replyItem) ?? '1'
  const root = getReplyRootRpid(replyItem)
  const rootRpid = root && root !== '0' ? root : rpid
  const detailUrl = new URL('https://api.bilibili.com/x/v2/reply/detail')
  detailUrl.search = new URLSearchParams({
    type,
    oid,
    root: rootRpid,
    next: '0',
    ps: '3',
  }).toString()

  await requestCommentFloorData(
    `detail:${type}:${oid}:${rootRpid}`,
    detailUrl,
    type,
    oid,
  )

  const detailFloor = getCachedCommentFloor(replyItem)
  if (detailFloor)
    return detailFloor

  const dialogRpid = getReplyDialogRpid(replyItem)
  if (!root || root === '0' || !dialogRpid || dialogRpid === '0')
    return null

  const dialogUrl = new URL('https://api.bilibili.com/x/v2/reply/dialog/cursor')
  dialogUrl.search = new URLSearchParams({
    type,
    oid,
    root: rootRpid,
    dialog: dialogRpid,
    size: '20',
  }).toString()

  await requestCommentFloorData(
    `dialog:${type}:${oid}:${rootRpid}:${dialogRpid}`,
    dialogUrl,
    type,
    oid,
  )

  return getCachedCommentFloor(replyItem)
}
