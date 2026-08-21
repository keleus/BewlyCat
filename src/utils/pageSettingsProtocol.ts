export type PageCommentReplyTreeMode = 'lineCollapseMain' | 'lineKeepMain' | 'indentOnly'
export type PageCommentReplyPaginationMode = 'loadMore' | 'pagination'

/** Minimal settings payload shared with the page's main-world script. */
export interface PageSettingsPayload {
  adjustCommentImageHeight: boolean
  cleanShareLinkIncludeTitle: boolean
  cleanShareLinkRemoveTrackingParams: boolean
  commentReplyPaginationMode: PageCommentReplyPaginationMode
  commentReplyTreeMode: PageCommentReplyTreeMode
  depersonalizeSearchResults: boolean
  enableCleanShareLink: boolean
  enableCommentReplyTreeDisplay: boolean
  language: string
  preventMobileRedirect: boolean
  showCommentHostTag: boolean
  showIPLocation: boolean
  showSex: boolean
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

export function createPageSettingsPayload(value: unknown): PageSettingsPayload | null {
  if (!isRecord(value)
    || typeof value.adjustCommentImageHeight !== 'boolean'
    || typeof value.cleanShareLinkIncludeTitle !== 'boolean'
    || typeof value.cleanShareLinkRemoveTrackingParams !== 'boolean'
    || !isCommentReplyPaginationMode(value.commentReplyPaginationMode)
    || !isCommentReplyTreeMode(value.commentReplyTreeMode)
    || typeof value.depersonalizeSearchResults !== 'boolean'
    || typeof value.enableCleanShareLink !== 'boolean'
    || typeof value.enableCommentReplyTreeDisplay !== 'boolean'
    || typeof value.language !== 'string'
    || typeof value.preventMobileRedirect !== 'boolean'
    || typeof value.showCommentHostTag !== 'boolean'
    || typeof value.showIPLocation !== 'boolean'
    || typeof value.showSex !== 'boolean') {
    return null
  }

  return {
    adjustCommentImageHeight: value.adjustCommentImageHeight,
    cleanShareLinkIncludeTitle: value.cleanShareLinkIncludeTitle,
    cleanShareLinkRemoveTrackingParams: value.cleanShareLinkRemoveTrackingParams,
    commentReplyPaginationMode: value.commentReplyPaginationMode,
    commentReplyTreeMode: value.commentReplyTreeMode,
    depersonalizeSearchResults: value.depersonalizeSearchResults,
    enableCleanShareLink: value.enableCleanShareLink,
    enableCommentReplyTreeDisplay: value.enableCommentReplyTreeDisplay,
    language: value.language,
    preventMobileRedirect: value.preventMobileRedirect,
    showCommentHostTag: value.showCommentHostTag,
    showIPLocation: value.showIPLocation,
    showSex: value.showSex,
  }
}
