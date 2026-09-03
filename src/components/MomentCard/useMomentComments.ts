import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

import type { CommentPageData, CommentPreviewState, CommentTarget, PreviewComment } from './commentPreview'
import { isCommentPageDone, mergeComments, normalizeComments } from './commentPreview'
import type { DisplayMoment } from './types'

// 状态由动态页按卡片保存；请求可在虚拟列表卸载卡片后完成。
export function useMomentComments(moment: DisplayMoment, state: CommentPreviewState) {
  const { t } = useI18n()
  const toast = useToast()

  async function resolveTarget(): Promise<CommentTarget> {
    if (state.target)
      return state.target
    if (moment.commentTarget)
      return (state.target = moment.commentTarget)
    // 缺少 basic 时向当前动态详情补取，不能用动态 id 猜相簿、视频或专栏的 oid。
    const response = await api.moment.getMomentDetail({ id: moment.id })
    const basic = response?.data?.item?.basic
    if (response?.code !== 0 || !basic?.comment_id_str || !(Number(basic.comment_type) > 0))
      throw new Error(t('moment_card.comments_unavailable'))
    state.target = { oid: String(basic.comment_id_str), type: Number(basic.comment_type) }
    return state.target
  }

  async function loadComments() {
    if (state.loading || state.done)
      return
    state.loading = true
    state.error = ''
    try {
      const target = await resolveTarget()
      const page = state.page + 1
      const response = await api.moment.getMomentComments({ ...target, pn: page })
      if (response?.code !== 0 || !response.data)
        throw new Error(response?.message || t('moment_card.comments_load_failed'))
      const data = response.data as CommentPageData
      state.comments = mergeComments(state.comments, normalizeComments(data.replies))
      state.page = page
      state.done = isCommentPageDone(data, page)
    }
    catch (error) {
      state.error = error instanceof Error ? error.message : t('moment_card.comments_load_failed')
    }
    finally {
      state.loading = false
    }
  }

  async function loadReplies(root: PreviewComment) {
    if (root.repliesLoading || root.repliesDone || !state.target)
      return
    root.repliesLoading = true
    root.repliesError = ''
    try {
      const page = root.replyPage + 1
      const response = await api.moment.getMomentCommentReplies({ ...state.target, root: root.id, pn: page })
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
      root.repliesError = error instanceof Error ? error.message : t('moment_card.comments_load_failed')
    }
    finally {
      root.repliesLoading = false
    }
  }

  function toggleReplies(root: PreviewComment) {
    root.repliesExpanded = !root.repliesExpanded
    root.collapsed = false
    if (root.repliesExpanded) {
      if (!root.replyPage)
        void loadReplies(root)
    }
  }

  async function toggleLike(comment: PreviewComment) {
    if (comment.liking || !state.target)
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
      if (response?.code !== 0)
        throw new Error(response?.message || t('moment_card.comment_like_failed'))
      comment.liked = liked
      comment.likeCount = Math.max(0, comment.likeCount + (liked ? 1 : -1))
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : t('moment_card.comment_like_failed'))
    }
    finally {
      comment.liking = false
    }
  }

  function saveScrollPosition(scrollTop: number) {
    if (state.expanded)
      state.scrollTop = scrollTop
  }

  return { loadComments, loadReplies, toggleReplies, toggleLike, saveScrollPosition }
}
