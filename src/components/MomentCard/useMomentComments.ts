import { onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

import type { CommentPageData, CommentPreviewState, CommentReplyTarget, CommentSort, CommentTarget, PreviewComment, RawCommentData } from './commentPreview'
import { isCommentPageDone, mergeComments, normalizeComment, normalizeComments } from './commentPreview'
import type { DisplayMoment } from './types'

export interface CommentPicture {
  img_src: string
  img_width: number
  img_height: number
  img_size: number
}

export interface CommentSubmission {
  message: string
  /** 正文中 @ 的用户，键为不带 @ 的用户名 */
  atNameToMid: Record<string, number>
  pictures: CommentPicture[]
  /** 同时转发到自己的动态（接口参数 sync_to_dynamic），仅一级评论使用 */
  syncToDynamic?: boolean
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// 评论收起或卡片卸载后清空数据，并忽略尚未完成的请求。
export function useMomentComments(
  moment: DisplayMoment,
  state: CommentPreviewState,
  onCountChange?: (delta: number) => void,
  onReposted?: () => void,
) {
  const { t } = useI18n()
  const toast = useToast()
  let disposed = false
  onScopeDispose(() => {
    disposed = true
    state.comments = []
    state.target = undefined
    state.page = 0
    state.loading = false
    state.error = ''
    state.done = false
    state.scrollTop = 0
    state.inputDisabled = false
    state.rootPlaceholder = ''
    state.childPlaceholder = ''
    state.replyTarget = undefined
  })

  async function resolveTarget(): Promise<CommentTarget | undefined> {
    if (state.target)
      return state.target
    if (moment.commentTarget)
      return (state.target = moment.commentTarget)
    // 缺少 basic 时向当前动态详情补取，不能用动态 id 猜相簿、视频或专栏的 oid。
    const response = await api.moment.getMomentDetail({ id: moment.id })
    if (disposed)
      return
    const basic = response?.data?.item?.basic
    if (response?.code !== 0 || !basic?.comment_id_str || !(Number(basic.comment_type) > 0))
      throw new Error(t('moment_card.comments_unavailable'))
    state.target = { oid: String(basic.comment_id_str), type: Number(basic.comment_type) }
    return state.target
  }

  async function loadComments() {
    if (disposed || !state.expanded || state.loading || state.done)
      return
    state.loading = true
    state.error = ''
    try {
      const target = await resolveTarget()
      if (disposed || !target)
        return
      const page = state.page + 1
      const response = await api.moment.getMomentComments({ ...target, pn: page, sort: state.sort })
      if (disposed)
        return
      if (response?.code !== 0 || !response.data)
        throw new Error(response?.message || t('moment_card.comments_load_failed'))
      const data = response.data as CommentPageData
      if (page === 1) {
        state.inputDisabled = Boolean(data.control?.input_disable)
        state.rootPlaceholder = data.control?.root_input_text || ''
        state.childPlaceholder = data.control?.child_input_text || ''
      }
      state.comments = mergeComments(state.comments, normalizeComments(data.replies))
      state.page = page
      state.done = isCommentPageDone(data, page)
    }
    catch (error) {
      if (!disposed)
        state.error = error instanceof Error ? error.message : t('moment_card.comments_load_failed')
    }
    finally {
      if (!disposed)
        state.loading = false
    }
  }

  async function changeSort(sort: CommentSort) {
    if (disposed || state.loading || state.sort === sort)
      return
    state.sort = sort
    state.comments = []
    state.page = 0
    state.done = false
    state.error = ''
    state.scrollTop = 0
    await loadComments()
  }

  async function loadReplies(root: PreviewComment) {
    if (disposed || root.repliesLoading || root.repliesDone || !state.target)
      return
    root.repliesLoading = true
    root.repliesError = ''
    try {
      const page = root.replyPage + 1
      const response = await api.moment.getMomentCommentReplies({ ...state.target, root: root.id, pn: page })
      if (disposed)
        return
      if (response?.code !== 0 || !response.data)
        throw new Error(response?.message || t('moment_card.comments_load_failed'))
      const data = response.data as CommentPageData
      // 首页的楼中楼摘要可能不连续；第一次完整加载以第一页顺序替换摘要。
      const incoming = mergeComments([...root.hotReplies, ...root.replies], normalizeComments(data.replies), true)
      root.replies = mergeComments(root.replies, incoming, page === 1)
      root.replyPage = page
      root.repliesDone = isCommentPageDone(data, page)
      if (data.page?.count !== undefined)
        root.replyCount = Math.max(0, Number(data.page.count) || 0)
    }
    catch (error) {
      if (!disposed)
        root.repliesError = error instanceof Error ? error.message : t('moment_card.comments_load_failed')
    }
    finally {
      if (!disposed)
        root.repliesLoading = false
    }
  }

  function toggleReplies(root: PreviewComment) {
    if (disposed)
      return
    root.repliesExpanded = !root.repliesExpanded
    root.collapsed = false
    if (root.repliesExpanded) {
      if (!root.replyPage)
        void loadReplies(root)
    }
  }

  async function toggleLike(comment: PreviewComment) {
    if (disposed || comment.liking || !state.target)
      return
    const csrf = getCSRF()
    if (!csrf || !getUserID()) {
      toast.warning(t('common.please_log_in_first'))
      return
    }
    comment.liking = true
    const liked = !comment.liked
    try {
      const response = await api.moment.setMomentCommentLike({
        ...state.target,
        rpid: comment.id,
        action: liked ? 1 : 0,
        csrf,
      })
      if (disposed)
        return
      if (response?.code !== 0)
        throw new Error(response?.message || t('moment_card.comment_like_failed'))
      comment.liked = liked
      comment.likeCount = Math.max(0, comment.likeCount + (liked ? 1 : -1))
    }
    catch (error) {
      if (!disposed)
        toast.error(error instanceof Error ? error.message : t('moment_card.comment_like_failed'))
    }
    finally {
      if (!disposed)
        comment.liking = false
    }
  }

  function requireLogin() {
    const csrf = getCSRF()
    if (!csrf || !getUserID())
      throw new Error(t('common.please_log_in_first'))
    return csrf
  }

  async function uploadImage(file: File): Promise<CommentPicture> {
    const csrf = requireLogin()
    const response = await api.moment.uploadMomentCommentImage({
      file_up: await readFileAsDataUrl(file),
      file_name: file.name || 'image',
      csrf,
    })
    if (response?.code !== 0 || !response.data?.image_url)
      throw new Error(response?.message || t('moment_card.comment_image_upload_failed'))
    return {
      img_src: String(response.data.image_url),
      img_width: Number(response.data.image_width) || 0,
      img_height: Number(response.data.image_height) || 0,
      img_size: Number(response.data.img_size) || file.size / 1024,
    }
  }

  /** 发表成功后把接口返回的评论插入当前列表，不重新拉取以免丢失滚动和展开状态。 */
  async function addComment(submission: CommentSubmission, replyTo?: CommentReplyTarget) {
    const csrf = requireLogin()
    const target = await resolveTarget()
    if (disposed || !target)
      return
    // 回复楼中楼时与原生评论一致，在正文前标注被回复者，服务端据此生成提醒。
    const nested = replyTo && replyTo.comment !== replyTo.root
    const response = await api.moment.addMomentComment({
      ...target,
      root: replyTo?.root.id || '',
      parent: replyTo?.comment.id || '',
      message: nested ? `回复 @${replyTo.comment.author} :${submission.message}` : submission.message,
      at_name_to_mid: Object.keys(submission.atNameToMid).length ? JSON.stringify(submission.atNameToMid) : '',
      pictures: submission.pictures.length ? JSON.stringify(submission.pictures) : '',
      sync_to_dynamic: submission.syncToDynamic && !replyTo ? 1 : '',
      csrf,
    })
    if (response?.code !== 0)
      throw new Error(response?.message || t('moment_card.comment_send_failed'))
    onCountChange?.(1)
    if (submission.syncToDynamic && !replyTo)
      onReposted?.()
    const raw = response.data?.reply as RawCommentData | undefined
    if (disposed || !raw)
      return
    const comment = normalizeComment(raw)
    if (!comment.id)
      return
    if (!replyTo) {
      state.comments = [comment, ...state.comments.filter(item => item.id !== comment.id)]
      return
    }
    const { root } = replyTo
    root.hotReplies = [...root.hotReplies.filter(item => item.id !== comment.id), comment]
    if (root.replyPage > 0)
      root.replies = [...root.replies.filter(item => item.id !== comment.id), comment]
    root.replyCount++
    root.collapsed = false
    if (replyTo.comment !== root)
      replyTo.comment.collapsed = false
  }

  async function deleteComment(comment: PreviewComment, root?: PreviewComment) {
    if (disposed || comment.deleting || !state.target)
      return
    comment.deleting = true
    try {
      const response = await api.moment.deleteMomentComment({ ...state.target, rpid: comment.id, csrf: requireLogin() })
      if (disposed)
        return
      if (response?.code !== 0)
        throw new Error(response?.message || t('moment_card.comment_delete_failed'))
      if (!root || root === comment) {
        state.comments = state.comments.filter(item => item !== comment)
        if (state.replyTarget?.root === comment)
          state.replyTarget = undefined
        onCountChange?.(-1 - comment.replyCount)
      }
      else {
        // 删除楼中楼时其下级回复一并失效，只能确定移除当前这一条。
        root.hotReplies = root.hotReplies.filter(item => item !== comment)
        root.replies = root.replies.filter(item => item !== comment)
        root.replyCount = Math.max(0, root.replyCount - 1)
        if (state.replyTarget?.comment === comment)
          state.replyTarget = undefined
        onCountChange?.(-1)
      }
    }
    catch (error) {
      if (!disposed)
        toast.error(error instanceof Error ? error.message : t('moment_card.comment_delete_failed'))
    }
    finally {
      if (!disposed)
        comment.deleting = false
    }
  }

  function setReplyTarget(target?: CommentReplyTarget) {
    if (!disposed)
      state.replyTarget = target
  }

  function saveScrollPosition(scrollTop: number) {
    if (!disposed && state.expanded)
      state.scrollTop = scrollTop
  }

  return { loadComments, changeSort, loadReplies, toggleReplies, toggleLike, uploadImage, addComment, deleteComment, setReplyTarget, saveScrollPosition }
}
