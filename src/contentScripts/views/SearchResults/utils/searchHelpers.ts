import type { VideoSearchFilters } from '../types'

/**
 * 获取时间范围参数
 */
export function getTimeRangeParams(filters: VideoSearchFilters): Record<string, number> {
  const { timeRange, customStartDate, customEndDate } = filters

  // 自定义日期范围
  if (timeRange === 'custom') {
    // 如果没有输入任何日期，返回空
    if (!customStartDate && !customEndDate)
      return {}

    let begin = 0
    let end = Math.floor(Date.now() / 1000)

    // 解析开始日期
    if (customStartDate) {
      const startTime = new Date(customStartDate).getTime()
      if (!Number.isNaN(startTime))
        begin = Math.floor(startTime / 1000)
    }

    // 解析结束日期（设置为当天的23:59:59）
    if (customEndDate) {
      const endTime = new Date(customEndDate).getTime()
      if (!Number.isNaN(endTime))
        end = Math.floor(endTime / 1000) + 86399 // 加上23小时59分59秒
    }

    // 如果开始日期大于结束日期，交换它们
    if (begin > 0 && end > 0 && begin > end)
      [begin, end] = [end, begin]

    return {
      pubtime_begin_s: begin,
      pubtime_end_s: end,
    }
  }

  // 预设日期范围
  if (timeRange === 'all')
    return {}

  const now = Math.floor(Date.now() / 1000)
  let begin = 0
  switch (timeRange) {
    case 'day':
      begin = now - 24 * 3600
      break
    case 'week':
      begin = now - 7 * 24 * 3600
      break
    case 'halfyear':
      begin = now - 180 * 24 * 3600
      break
    default:
      begin = 0
  }
  if (begin <= 0)
    return {}
  return {
    pubtime_begin_s: begin,
    pubtime_end_s: now,
  }
}

/**
 * 构建视频搜索参数
 */
export function buildVideoSearchParams(options: {
  loadMore: boolean
  context: string
  filters: VideoSearchFilters
}): Record<string, any> {
  const { loadMore, context, filters } = options
  const rangeParams = getTimeRangeParams(filters)
  const timeParams = {
    pubtime_begin_s: 0,
    pubtime_end_s: 0,
    ...rangeParams,
  }
  return {
    search_type: 'video',
    duration: filters.duration,
    order: filters.order,
    category_id: '',
    context: loadMore ? context : '',
    ...timeParams,
  }
}

/**
 * 过滤视频广告
 */
export function applyVideoTimeFilter(list: any[]): any[] {
  if (!Array.isArray(list))
    return []
  return list.filter(item => !isVideoAd(item))
}

/**
 * 判断是否为视频广告
 */
function isVideoAd(item: any): boolean {
  if (!item || typeof item !== 'object')
    return false
  if (item.is_ad === true || item.is_ad_loc === true)
    return true
  if (item.cm || item.cm_info || item.cm_mark)
    return true
  if (item.ad_info || item.ad_extra || item.ad_index)
    return true
  if (typeof item.card_type === 'string' && item.card_type.toLowerCase().includes('ad'))
    return true
  // 检查 type 字段是否包含 "ad"
  if (typeof item.type === 'string' && item.type.toLowerCase().includes('ad'))
    return true
  return false
}

/**
 * 去重辅助函数
 */
export function dedupeByKey<T>(items: T[], keyGetter: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  items.forEach((item) => {
    const key = keyGetter(item)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  })
  return result
}
