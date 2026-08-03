import { useStorageLocal } from '~/composables/useStorageLocal'

export type UploaderLatestVideoTimeSource
  = | 'following-all'
    | 'following-selected'

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
