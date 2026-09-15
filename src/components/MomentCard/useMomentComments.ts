import { onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

import type { CommentPageData, CommentPreviewState, CommentSort, CommentTarget, PreviewComment } from './commentPreview'
import { isCommentPageDone, mergeComments, normalizeComments } from './commentPreview'
import type { DisplayMoment } from './types'

// 评论收起或卡片卸载后清空数据，并忽略尚未完成的请求。
export function useMomentComments(moment: DisplayMoment, state: CommentPreviewState) {
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

  function saveScrollPosition(scrollTop: number) {
    if (!disposed && state.expanded)
      state.scrollTop = scrollTop
  }

  return { loadComments, changeSort, loadReplies, toggleReplies, toggleLike, saveScrollPosition }
}
