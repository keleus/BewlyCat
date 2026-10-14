export type PageCommentReplyTreeMode = 'lineCollapseMain' | 'lineKeepMain' | 'indentOnly'
export type PageCommentReplyPaginationMode = 'loadMore' | 'pagination'

/** Minimal settings payload shared with the page's main-world script. */
export interface PageSettingsPayload {
  localLoudnessEnabled: boolean
  localLoudnessTarget: number
  localLoudnessStrength: number
  /** 收藏夹整理需要在三连后同步时，页面脚本才监听三连请求。 */
  observeTripleRequests: boolean
  adjustCommentImageHeight: boolean
  cleanShareLinkIncludeTitle: boolean
  cleanShareLinkRemoveTrackingParams: boolean
  commentReplyPaginationMode: PageCommentReplyPaginationMode
  commentReplyTreeContainerHeight: number
  commentReplyTreeMode: PageCommentReplyTreeMode
  depersonalizeSearchResults: boolean
  enableCleanShareLink: boolean
  enableCommentReplyTreeContainer: boolean
  enableCommentReplyTreeDisplay: boolean
  language: string
  preventMobileRedirect: boolean
  showCommentHostTag: boolean
  showIPLocation: boolean
  showSex: boolean
  skipConciseDanmaku: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCommentReplyTreeMode(value: unknown): value is PageCommentReplyTreeMode {
  return value === 'lineCollapseMain' || value === 'lineKeepMain' || value === 'indentOnly'
}

function isCommentReplyPaginationMode(value: unknown): value is PageCommentReplyPaginationMode {
  return value === 'loadMore' || value === 'pagination'
}

function isCommentReplyTreeContainerHeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function createPageSettingsPayload(value: unknown): PageSettingsPayload | null {
  if (!isRecord(value)
    || typeof value.adjustCommentImageHeight !== 'boolean'
    || typeof value.cleanShareLinkIncludeTitle !== 'boolean'
    || typeof value.cleanShareLinkRemoveTrackingParams !== 'boolean'
    || !isCommentReplyPaginationMode(value.commentReplyPaginationMode)
    || !isCommentReplyTreeContainerHeight(value.commentReplyTreeContainerHeight)
    || !isCommentReplyTreeMode(value.commentReplyTreeMode)
    || typeof value.depersonalizeSearchResults !== 'boolean'
    || typeof value.enableCleanShareLink !== 'boolean'
    || typeof value.enableCommentReplyTreeContainer !== 'boolean'
    || typeof value.enableCommentReplyTreeDisplay !== 'boolean'
    || typeof value.language !== 'string'
    || typeof value.preventMobileRedirect !== 'boolean'
    || typeof value.showCommentHostTag !== 'boolean'
    || typeof value.showIPLocation !== 'boolean'
    || typeof value.showSex !== 'boolean') {
    return null
  }

  return {
    localLoudnessEnabled: value.localLoudnessEnabled === true,
    localLoudnessTarget: typeof value.localLoudnessTarget === 'number' && Number.isFinite(value.localLoudnessTarget)
      ? Math.max(-24, Math.min(-14, value.localLoudnessTarget))
      : -18,
    localLoudnessStrength: typeof value.localLoudnessStrength === 'number' && Number.isFinite(value.localLoudnessStrength)
      ? Math.max(40, Math.min(100, value.localLoudnessStrength))
      : 75,
    // 页面脚本会再次校验已转换的 payload，此时直接沿用字段。
    observeTripleRequests: value.observeTripleRequests === true
      || (value.favoriteOrganizerSyncAfterTriple === true
        && Array.isArray(value.favoriteOrganizerFolders)
        && value.favoriteOrganizerFolders.length > 0),
    adjustCommentImageHeight: value.adjustCommentImageHeight,
    cleanShareLinkIncludeTitle: value.cleanShareLinkIncludeTitle,
    cleanShareLinkRemoveTrackingParams: value.cleanShareLinkRemoveTrackingParams,
    commentReplyPaginationMode: value.commentReplyPaginationMode,
    commentReplyTreeContainerHeight: value.commentReplyTreeContainerHeight,
    commentReplyTreeMode: value.commentReplyTreeMode,
    depersonalizeSearchResults: value.depersonalizeSearchResults,
    enableCleanShareLink: value.enableCleanShareLink,
    enableCommentReplyTreeContainer: value.enableCommentReplyTreeContainer,
    enableCommentReplyTreeDisplay: value.enableCommentReplyTreeDisplay,
    language: value.language,
    preventMobileRedirect: value.preventMobileRedirect,
    showCommentHostTag: value.showCommentHostTag,
    showIPLocation: value.showIPLocation,
    showSex: value.showSex,
    skipConciseDanmaku: value.skipConciseDanmaku !== false,
  }
}

/**
 * 页面启动快照：主站 localStorage 中保存决定 document_start 钩子是否安装的开关。
 * 页面脚本启动时设置尚未送达，只能同步读取上一次加载写入的值；
 * 快照缺失或无法读取时调用方按默认行为处理，不能据此跳过默认开启的功能。
 */
export interface PageBootSnapshot {
  preventMobileRedirect: boolean
  skipConciseDanmaku: boolean
}

const PAGE_BOOT_SNAPSHOT_KEY = 'bewlycat:page-boot'

export function readPageBootSnapshot(): Partial<PageBootSnapshot> | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PAGE_BOOT_SNAPSHOT_KEY) ?? 'null')
    if (!isRecord(value))
      return null
    return {
      preventMobileRedirect: typeof value.preventMobileRedirect === 'boolean' ? value.preventMobileRedirect : undefined,
      skipConciseDanmaku: typeof value.skipConciseDanmaku === 'boolean' ? value.skipConciseDanmaku : undefined,
    }
  }
  catch {
    return null
  }
}

export function writePageBootSnapshot(settings: PageSettingsPayload) {
  const snapshot: PageBootSnapshot = {
    preventMobileRedirect: settings.preventMobileRedirect,
    skipConciseDanmaku: settings.skipConciseDanmaku,
  }
  try {
    const value = JSON.stringify(snapshot)
    if (localStorage.getItem(PAGE_BOOT_SNAPSHOT_KEY) !== value)
      localStorage.setItem(PAGE_BOOT_SNAPSHOT_KEY, value)
  }
  catch {
    // 存储不可用时下次加载按默认行为安装钩子
  }
}
