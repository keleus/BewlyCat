import { onScopeDispose, ref, watch, watchEffect } from 'vue'

import { useUserRelationScope } from '~/composables/useUserRelationScope'
import { useUserRelationStore } from '~/stores/userRelationStore'

export interface UserRelation {
  isFollowing: boolean
  isLoading: boolean
}

/**
 * 用户关系管理的 composable
 * 处理批量查询用户关注状态
 */
export function useUserRelations() {
  const userRelations = ref<Record<number, UserRelation>>({})
  const relationStore = useUserRelationStore()
  const requestedMids = ref<number[]>([])
  const { active } = useUserRelationScope(requestedMids, requestedMids)

  watch(() => relationStore.accountMid, () => {
    userRelations.value = {}
  }, { flush: 'sync' })
  watchEffect(() => {
    const next: Record<number, UserRelation> = {}
    if (active.value && relationStore.accountMid) {
      for (const mid of requestedMids.value) {
        const following = relationStore.getFollowing(mid)
        const state = userRelations.value[mid]
          ?? (following === undefined ? undefined : { isFollowing: following, isLoading: false })
        if (state) {
          // 查询尚未完成时也保留当前用户操作及其 loading 状态。
          if (following !== undefined)
            state.isFollowing = following
          next[mid] = state
        }
      }
    }
    userRelations.value = next
  }, { flush: 'sync' })
  onScopeDispose(() => {
    requestedMids.value = []
    userRelations.value = {}
  })

  /**
   * 批量查询用户关系状态
   * @param mids 用户 mid 数组
   */
  async function batchQueryUserRelations(mids: number[]) {
    requestedMids.value = [...new Set(mids)]
    if (active.value)
      await relationStore.queryRelations(requestedMids.value)
  }

  /**
   * 更新单个用户的关注状态
   * @param mid 用户 mid
   * @param isFollowing 是否关注
   */
  function updateUserRelation(mid: number, isFollowing: boolean, accountMid = relationStore.accountMid) {
    if (!relationStore.setFollowing(mid, isFollowing, accountMid))
      return
    if (userRelations.value[mid]) {
      userRelations.value[mid].isFollowing = isFollowing
    }
  }

  /**
   * 设置用户关系的加载状态
   * @param mid 用户 mid
   * @param isLoading 是否加载中
   */
  function setUserRelationLoading(mid: number, isLoading: boolean) {
    if (userRelations.value[mid]) {
      userRelations.value[mid].isLoading = isLoading
    }
    else {
      userRelations.value[mid] = {
        isFollowing: false,
        isLoading,
      }
    }
  }

  /**
   * 重置所有用户关系状态
   */
  function reset() {
    requestedMids.value = []
    userRelations.value = {}
  }

  return {
    userRelations,
    batchQueryUserRelations,
    updateUserRelation,
    setUserRelationLoading,
    reset,
  }
}
