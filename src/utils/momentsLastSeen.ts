import api from '~/utils/api'

/**
 * 动态“上次看到”定位。
 *
 * B 站在服务端记录动态已读位置：`dynamic/entrance` 的 `dyn_basic_infos` 按新到旧列出全部未读视频动态 ID，
 * 列表最后一项之后即上次看到的位置。`feed/nav`、`feed/all` 的 offset 可传任意动态 ID，返回比它更旧的一页，
 * 且带 offset 的请求不会重置已读位置；不带 offset 的首页请求会把已读位置推进到最新。
 * 因此定位时必须全程使用 offset，直到用户主动回到顶部才请求首页。
 */

interface DynamicEntranceResult {
  code: number
  data?: {
    dyn_basic_infos?: Array<{ dyn_id?: string | number }>
  }
}

interface MomentFeedPage<T> {
  items: T[]
  offset: string
  hasMore: boolean
}

interface NewerMomentsResult<T> {
  /** 比 topId 更新的原始条目，新到旧 */
  items: T[]
  /** 已加载到 feed 顶部（请求了首页），之后不再有更新的内容 */
  reachedTop: boolean
}

function parseDynamicId(id: unknown): bigint | null {
  const value = typeof id === 'number' ? String(id) : id
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    return null
  return BigInt(value)
}

/** a 比 b 新（动态 ID 随发布时间递增）；任一无法解析时返回 false */
export function isNewerDynamicId(a: unknown, b: unknown): boolean {
  const left = parseDynamicId(a)
  const right = parseDynamicId(b)
  return left !== null && right !== null && left > right
}

/** a 不比 b 旧；任一无法解析时返回 false */
export function isNotOlderDynamicId(a: unknown, b: unknown): boolean {
  const left = parseDynamicId(a)
  const right = parseDynamicId(b)
  return left !== null && right !== null && left >= right
}

/** 当前账号全部未读视频动态 ID（新到旧）；请求失败返回 null，由调用方退回顶部加载。 */
export async function fetchUnreadMomentIds(): Promise<string[] | null> {
  try {
    const res = await api.moment.getTopBarNewMomentsCount({}) as DynamicEntranceResult
    if (res.code !== 0)
      return null
    return (res.data?.dyn_basic_infos || [])
      .map(info => String(info.dyn_id ?? ''))
      .filter(id => parseDynamicId(id) !== null)
  }
  catch (error) {
    console.error('获取未读动态失败:', error)
    return null
  }
}

/**
 * 从上次看到的位置开始加载时的首个 offset：保留 contextCount 条最旧的未读在分界线上方。
 * 未读不足时返回空串，表示直接从顶部加载即可。
 */
export function getLastSeenStartOffset(unreadIds: string[], contextCount: number): string {
  const index = unreadIds.length - 1 - contextCount
  return index >= 0 ? unreadIds[index] : ''
}

/**
 * 向上加载比 topId 更新的条目。
 * 已知未读 ID 时向上跨 step 条未读视频作为起点，否则直接请求首页；
 * 从起点向下翻页直到接上 topId，避免中间漏掉非视频动态。
 */
export async function fetchNewerMoments<T extends { id_str?: string }>(
  fetchPage: (offset: string) => Promise<MomentFeedPage<T> | null>,
  unreadIds: string[],
  topId: string,
  step: number,
  maxPages = 5,
): Promise<NewerMomentsResult<T> | null> {
  const newerCount = unreadIds.findIndex(id => !isNewerDynamicId(id, topId))
  const unreadAbove = newerCount === -1 ? unreadIds.length : newerCount
  const startIndex = Math.max(0, unreadAbove - step)
  const reachedTop = startIndex === 0
  let offset = reachedTop ? '' : unreadIds[startIndex - 1]
  const items: T[] = []

  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(offset)
    if (!result)
      return null

    let reachedTopId = false
    for (const item of result.items) {
      if (isNewerDynamicId(item.id_str, topId))
        items.push(item)
      else
        reachedTopId = true
    }
    if (reachedTopId || !result.hasMore || !result.offset || result.offset === offset)
      break
    offset = result.offset
  }

  return { items, reachedTop }
}
