import { reactive } from 'vue'

import type { CommentReplyTreeMode } from '~/logic/storage'
import { normalizeCommentLocation } from '~/utils/commentUserInfo'

export interface CommentTarget {
  oid: string
  type: number
}

interface RawComment {
  rpid?: number
  rpid_str?: string
  parent?: number
  parent_str?: string
  ctime?: number
  like?: number
  action?: number
  count?: number
  rcount?: number
  member?: { mid?: string, uname?: string, avatar?: string, sex?: string }
  reply_control?: { location?: string }
  content?: {
    message?: string
    emote?: Record<string, { url?: string }>
    pictures?: Array<{ img_src?: string }>
  }
  replies?: RawComment[] | null
}

export interface CommentPageData {
  replies?: RawComment[] | null
  page?: { count?: number, size?: number }
}

export interface PreviewComment {
  id: string
  parentId: string
  mid: string
  author: string
  avatar: string
  sex: string
  location: string
  time: number
  content: Array<{ text: string, image?: string }>
  pictures: string[]
  likeCount: number
  liked: boolean
  liking: boolean
  collapsed: boolean
  replyCount: number
  hotReplies: PreviewComment[]
  repliesExpanded: boolean
  replies: PreviewComment[]
  replyPage: number
  repliesLoading: boolean
  repliesError: string
  repliesDone: boolean
}

export interface CommentPreviewState {
  expanded: boolean
  opened: boolean
  target?: CommentTarget
  comments: PreviewComment[]
  page: number
  loading: boolean
  error: string
  done: boolean
  scrollTop: number
}

export function createCommentPreview(): CommentPreviewState {
  return reactive({
    expanded: false,
    opened: false,
    comments: [],
    page: 0,
    loading: false,
    error: '',
    done: false,
    scrollTop: 0,
  })
}

export function toggleCommentPreview(state: CommentPreviewState) {
  state.expanded = !state.expanded
  state.opened = true
}

function safeImageUrl(value?: string) {
  if (!value)
    return ''
  try {
    const url = new URL(value, 'https://www.bilibili.com')
    if (!['http:', 'https:'].includes(url.protocol))
      return ''
    url.protocol = 'https:'
    return url.href
  }
  catch {
    return ''
  }
}

function normalizeComment(raw: RawComment): PreviewComment {
  const message = raw.content?.message || ''
  const emotes = raw.content?.emote || {}
  // 只替换接口明确给出的表情，不向页面插入评论 HTML。
  const tokens = Object.keys(emotes).filter(Boolean).sort((a, b) => b.length - a.length)
  const pattern = tokens.length
    ? new RegExp(`(${tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
    : undefined
  const replies = normalizeComments(raw.replies)
  const replyCount = Math.max(Number(raw.rcount ?? raw.count) || 0, replies.length)
  return {
    id: String(raw.rpid_str || raw.rpid || ''),
    parentId: String(raw.parent_str || raw.parent || '0'),
    mid: String(raw.member?.mid || ''),
    author: raw.member?.uname || '',
    avatar: safeImageUrl(raw.member?.avatar),
    sex: raw.member?.sex || '',
    location: normalizeCommentLocation(raw.reply_control?.location),
    time: Number(raw.ctime) || 0,
    content: (pattern ? message.split(pattern) : [message]).filter(Boolean).map(text => ({
      text,
      image: safeImageUrl(emotes[text]?.url),
    })),
    pictures: (raw.content?.pictures || []).map(picture => safeImageUrl(picture.img_src)).filter(Boolean),
    likeCount: Math.max(0, Number(raw.like) || 0),
    liked: Number(raw.action) === 1,
    liking: false,
    collapsed: false,
    replyCount,
    // 列表接口的 replies 是热门摘要；与按顺序分页的完整回复分开保存。
    hotReplies: replies.slice(0, 3),
    repliesExpanded: false,
    replies: [],
    replyPage: 0,
    repliesLoading: false,
    repliesError: '',
    repliesDone: replyCount === 0,
  }
}

export function normalizeComments(raw?: RawComment[] | null): PreviewComment[] {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : []).map(normalizeComment).filter((comment) => {
    if (!comment.id || seen.has(comment.id))
      return false
    seen.add(comment.id)
    return true
  })
}

export function mergeComments(existing: PreviewComment[], incoming: PreviewComment[], replace = false) {
  const byId = new Map(existing.map(comment => [comment.id, comment]))
  // 复用已显示对象，避免翻页覆盖刚完成的点赞及树折叠状态。
  const result = replace ? [] : [...existing]
  const seen = new Set(result.map(comment => comment.id))
  for (const comment of incoming) {
    if (!seen.has(comment.id)) {
      const cached = byId.get(comment.id)
      if (cached) {
        // 完整回复可能补齐摘要里缺失的父节点和用户信息，交互状态仍沿用原对象。
        Object.assign(cached, {
          parentId: comment.parentId,
          mid: comment.mid,
          author: comment.author,
          avatar: comment.avatar,
          sex: comment.sex,
          location: comment.location,
          time: comment.time,
          content: comment.content,
          pictures: comment.pictures,
        })
      }
      result.push(cached || comment)
      seen.add(comment.id)
    }
  }
  return result
}

export function isCommentPageDone(data: CommentPageData, page: number) {
  if (!data.replies?.length)
    return true
  const pageSize = Number(data.page?.size) || 20
  return data.page?.count !== undefined
    ? page * pageSize >= data.page.count
    : data.replies.length < pageSize
}

export interface CommentRow {
  comment: PreviewComment
  parentId: string | null
  depth: number
  hasChildren: boolean
  collapsed: boolean
  hideBody: boolean
}

export function getCommentRows(root: PreviewComment, tree: boolean, mode: CommentReplyTreeMode): CommentRow[] {
  const replies = root.repliesExpanded && root.replyPage > 0 ? root.replies : root.hotReplies
  const all = [root, ...replies.filter(reply => reply.id !== root.id)]
  if (!tree)
    return all.map(comment => ({ comment, parentId: null, depth: 0, hasChildren: false, collapsed: false, hideBody: false }))

  const byId = new Map(all.map(comment => [comment.id, comment]))
  const children = new Map<string, PreviewComment[]>()
  for (const comment of replies) {
    if (comment.id === root.id)
      continue
    let parentId = byId.has(comment.parentId) ? comment.parentId : root.id
    const visited = new Set([comment.id])
    let ancestor = byId.get(parentId)
    while (ancestor && ancestor !== root) {
      if (visited.has(ancestor.id)) {
        parentId = root.id
        break
      }
      visited.add(ancestor.id)
      ancestor = byId.get(ancestor.parentId)
    }
    const siblings = children.get(parentId) || []
    siblings.push(comment)
    children.set(parentId, siblings)
  }

  const rows: CommentRow[] = []
  const queue: Array<{ comment: PreviewComment, depth: number, parentId: string | null }> = [{ comment: root, depth: 0, parentId: null }]
  while (queue.length) {
    const { comment, depth, parentId } = queue.pop()!
    const descendants = children.get(comment.id) || []
    const hasChildren = descendants.length > 0 || (comment === root && !root.repliesDone)
    const collapsed = mode !== 'indentOnly' && hasChildren && comment.collapsed
    rows.push({ comment, parentId, depth, hasChildren, collapsed, hideBody: collapsed && mode === 'lineCollapseMain' })
    if (!collapsed) {
      for (let index = descendants.length - 1; index >= 0; index--)
        queue.push({ comment: descendants[index], depth: depth + 1, parentId: comment.id })
    }
  }
  return rows
}
