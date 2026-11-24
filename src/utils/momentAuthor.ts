import type { DataItem, ModuleAuthor } from '~/models/moment/moment'
import { ItemType, MajorType, ModuleAuthorType } from '~/models/moment/moment'
import { localizeBilibiliUrl } from '~/utils/bilibiliLocale'

type MomentAuthorKind = 'user' | 'ugc_season' | 'pgc' | 'other'

interface ResolvedMomentAuthor {
  /** 作者实体类型；非 user 时 module_author.mid 为合集/剧集 ID，不能当成用户 UID 使用。 */
  kind: MomentAuthorKind
  /** 仅普通用户返回真实 UID；合集、番剧等非用户实体为 undefined。 */
  userMid?: number
  /** 点击作者头像/名称的跳转地址；合集/番剧优先走接口 jump_url，避免把合集/剧集 ID 拼成 404 空间页。 */
  url: string
}

function parsePositiveInt(value: unknown): number | undefined {
  const num = Number(value)
  return Number.isSafeInteger(num) && num > 0 ? num : undefined
}

function normalizeMomentJumpUrl(rawUrl?: string): string {
  const trimmed = (rawUrl || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('//')) return localizeBilibiliUrl(`https:${trimmed}`)
  if (/^http:\/\//i.test(trimmed))
    return localizeBilibiliUrl(trimmed.replace(/^http:\/\//i, 'https://'))
  if (/^https:\/\//i.test(trimmed)) return localizeBilibiliUrl(trimmed)
  return ''
}

function isInvalidNonUserSpaceUrl(url: string, entityId?: number): boolean {
  if (!url || !entityId) return false
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'space.bilibili.com') return false
    // 合法的合集地址可能在 space.bilibili.com/{upMid}/lists/{seasonId}?type=season
    // 或 space.bilibili.com/{upMid}/channel/collectiondetail?sid={seasonId}，
    // 仅拦截把合集/剧集 ID 直接当作个人空间 UID 的裸空间链接。
    if (parsed.searchParams.has('sid') || parsed.searchParams.has('fid')) return false
    return new RegExp(`^/${entityId}(?:/dynamic)?/?$`).test(parsed.pathname)
  } catch {
    return false
  }
}

function getMomentAuthorKind(item?: Partial<DataItem>): MomentAuthorKind {
  const author = item?.modules?.module_author as Partial<ModuleAuthor> | undefined
  const major = item?.modules?.module_dynamic?.major

  if (author?.type === ModuleAuthorType.AuthorTypeNormal) return 'user'
  if (author?.type === ModuleAuthorType.AuthorTypeUgcSeason) return 'ugc_season'
  if (author?.type === ModuleAuthorType.AuthorTypePgc) return 'pgc'
  if (author?.type) return 'other'

  if (
    item?.type === ItemType.DynamicTypeUgcSeason ||
    major?.type === MajorType.MajorTypeUgcSeason ||
    Boolean(major?.ugc_season)
  ) {
    return 'ugc_season'
  }

  if (
    item?.type === ItemType.DynamicTypePgcUnion ||
    major?.type === MajorType.MajorTypePgc ||
    Boolean(major?.pgc)
  ) {
    return 'pgc'
  }

  return 'user'
}

export function resolveMomentAuthor(item?: Partial<DataItem>): ResolvedMomentAuthor {
  const author = item?.modules?.module_author as Partial<ModuleAuthor> | undefined
  const major = item?.modules?.module_dynamic?.major
  const kind = getMomentAuthorKind(item)
  const rawMid = parsePositiveInt(author?.mid)
  const rawJumpUrl = normalizeMomentJumpUrl(author?.jump_url)

  if (kind === 'user') {
    return {
      kind,
      userMid: rawMid,
      url: rawMid ? `https://space.bilibili.com/${rawMid}` : rawJumpUrl,
    }
  }

  const safeJumpUrl = rawJumpUrl && !isInvalidNonUserSpaceUrl(rawJumpUrl, rawMid) ? rawJumpUrl : ''

  if (kind === 'pgc') {
    const seasonId = parsePositiveInt(major?.pgc?.season_id) ?? rawMid
    return {
      kind,
      url: safeJumpUrl || (seasonId ? `https://www.bilibili.com/bangumi/play/ss${seasonId}` : ''),
    }
  }

  return {
    kind,
    url: safeJumpUrl,
  }
}
