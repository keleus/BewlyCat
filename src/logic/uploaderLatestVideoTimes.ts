import { useStorageLocal } from '~/composables/useStorageLocal'

export type UploaderLatestVideoTimeSource
  = | 'following-all'
    | 'following-selected'
    | 'moments-page'
    | 'topbar-pop'

export interface UploaderLatestVideoTimeEntry {
  time: number
  source: UploaderLatestVideoTimeSource
  recordedAt: number
}

export interface UploaderLatestVideoTimeRecord {
  mid: number | string
  time: number
}

type UploaderLatestVideoTimes = Record<string, UploaderLatestVideoTimeEntry>

let resolveUploaderLatestVideoTimesReady: (() => void) | undefined
export const uploaderLatestVideoTimesReady = new Promise<void>((resolve) => {
  resolveUploaderLatestVideoTimesReady = resolve
})

/**
 * 只保存页面已经加载到的投稿时间，不主动请求任何UP主数据。
 * 投稿时间是可长期复用的历史事实，因此不设置过期时间；后续来源只会以更晚时间覆盖。
 */
export const uploaderLatestVideoTimes = useStorageLocal<UploaderLatestVideoTimes>(
  'uploaderLatestVideoTimes',
  {},
  {
    writeDefaults: false,
    onReady: () => resolveUploaderLatestVideoTimesReady?.(),
  },
)

export async function recordUploaderLatestVideoTimes(
  records: Iterable<UploaderLatestVideoTimeRecord>,
  source: UploaderLatestVideoTimeSource,
) {
  await uploaderLatestVideoTimesReady

  const next = { ...uploaderLatestVideoTimes.value }
  let changed = false

  for (const record of records) {
    const mid = String(record.mid)
    const time = Number(record.time)
    if (!/^\d+$/.test(mid) || Number(mid) <= 0 || !Number.isFinite(time) || time <= 0)
      continue

    const current = next[mid]
    if (current && current.time >= time)
      continue
    // 顶栏接口只有相对时间，不能用近似值覆盖其他接口给出的精确 pub_ts。
    if (source === 'topbar-pop' && current?.source !== 'topbar-pop')
      continue

    next[mid] = {
      time,
      source,
      recordedAt: Date.now(),
    }
    changed = true
  }

  if (changed)
    uploaderLatestVideoTimes.value = next
}

/** 将顶栏动态接口的相对时间转换为可用于排序的近似时间。 */
export function parseTopBarPublicationTime(value: unknown, now = Date.now()): number | undefined {
  if (typeof value !== 'string')
    return undefined

  const text = value.trim()
  if (!text)
    return undefined
  if (text === '刚刚')
    return now

  const relativeMatch = text.match(/^(\d+)\s*(秒|分钟|小时|天)前$/)
  if (relativeMatch) {
    const amount = Number(relativeMatch[1])
    let unitMilliseconds = 1000
    if (relativeMatch[2] === '分钟')
      unitMilliseconds = 60 * 1000
    else if (relativeMatch[2] === '小时')
      unitMilliseconds = 60 * 60 * 1000
    else if (relativeMatch[2] === '天')
      unitMilliseconds = 24 * 60 * 60 * 1000
    return now - amount * unitMilliseconds
  }

  const dayMatch = text.match(/^(今天|昨天|前天)\s+(\d{1,2}):(\d{2})$/)
  if (dayMatch) {
    const date = new Date(now)
    const daysAgo = dayMatch[1] === '今天' ? 0 : (dayMatch[1] === '昨天' ? 1 : 2)
    date.setDate(date.getDate() - daysAgo)
    date.setHours(Number(dayMatch[2]), Number(dayMatch[3]), 0, 0)
    return date.getTime()
  }

  const dateMatch = text.match(/^(\d{4})?[-年/]?(\d{1,2})[-月/](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (dateMatch) {
    const nowDate = new Date(now)
    const hasYear = Boolean(dateMatch[1])
    const date = new Date(
      hasYear ? Number(dateMatch[1]) : nowDate.getFullYear(),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      Number(dateMatch[4] || 0),
      Number(dateMatch[5] || 0),
    )
    if (!hasYear && date.getTime() > now)
      date.setFullYear(date.getFullYear() - 1)
    return date.getTime()
  }

  return undefined
}
