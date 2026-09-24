import type { WatchLaterChange, WatchLaterEntry, WatchLaterSnapshot } from '~/constants/watchLaterState'

export interface WatchLaterTarget {
  aid?: number | string
  bvid?: string
  epid?: number
}

interface WatchLaterListItem {
  aid: number
  bvid?: string
  bangumi?: { ep_id?: number }
}

export function toWatchLaterEntry(target: WatchLaterTarget): WatchLaterEntry | undefined {
  const aid = Number(target.aid || 0)
  const entry: WatchLaterEntry = { aid: Number.isSafeInteger(aid) && aid > 0 ? aid : 0 }
  if (target.bvid)
    entry.bvid = target.bvid
  if (target.epid)
    entry.epid = Number(target.epid)
  return entry.aid || entry.bvid || entry.epid ? entry : undefined
}

export function matchesWatchLaterEntry(entry: WatchLaterEntry, target: WatchLaterEntry) {
  return Boolean(
    (target.aid && entry.aid === target.aid)
    || (target.bvid && entry.bvid === target.bvid)
    || (target.epid && entry.epid === target.epid),
  )
}

export function createWatchLaterSnapshot(list: WatchLaterListItem[], count = list.length): WatchLaterSnapshot {
  const entries = list.flatMap(item => toWatchLaterEntry({
    aid: item.aid,
    bvid: item.bvid,
    epid: item.bangumi?.ep_id,
  }) ?? [])
  return { entries, count: Math.max(count, entries.length) }
}

/** 返回应用变更后的新快照；变更不影响成员关系时返回原快照 */
export function applyWatchLaterChange(snapshot: WatchLaterSnapshot, change: WatchLaterChange): WatchLaterSnapshot {
  if (change.type === 'clear')
    return snapshot.entries.length || snapshot.count ? { entries: [], count: 0 } : snapshot

  const target = change.entry
  if (change.type === 'add') {
    const existingIndex = snapshot.entries.findIndex(entry => matchesWatchLaterEntry(entry, target))
    if (existingIndex === -1)
      return { entries: [target, ...snapshot.entries], count: snapshot.count + 1 }

    // 已存在时只补全缺失的标识（如先以 bvid 添加、后得知 aid）
    const existing = snapshot.entries[existingIndex]
    const merged = { ...target, ...existing, aid: existing.aid || target.aid }
    if (merged.aid === existing.aid && merged.bvid === existing.bvid && merged.epid === existing.epid)
      return snapshot
    const entries = [...snapshot.entries]
    entries[existingIndex] = merged
    return { entries, count: snapshot.count }
  }

  const entries = snapshot.entries.filter(entry => !matchesWatchLaterEntry(entry, target))
  if (entries.length === snapshot.entries.length)
    return snapshot
  return { entries, count: Math.max(0, snapshot.count - (snapshot.entries.length - entries.length)) }
}
