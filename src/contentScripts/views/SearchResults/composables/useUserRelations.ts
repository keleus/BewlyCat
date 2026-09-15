import { ref, watch, watchEffect } from 'vue'

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

  watch(() => relationStore.accountMid, () => {
    userRelations.value = {}
  }, { flush: 'sync' })
  watchEffect(() => {
    for (const [mid, state] of Object.entries(userRelations.value)) {
      const following = relationStore.getFollowing(Number(mid))
      if (following !== undefined)
        state.isFollowing = following
    }
  })

  /**
   * 批量查询用户关系状态
   * @param mids 用户 mid 数组
   */
  async function batchQueryUserRelations(mids: number[]) {
    const accountMid = relationStore.accountMid
    await relationStore.queryRelations(mids)
    if (accountMid !== relationStore.accountMid)
      return
    for (const mid of mids) {
      const isFollowing = relationStore.getFollowing(mid)
      if (isFollowing !== undefined) {
        const current = userRelations.value[mid]
        if (current)
          current.isFollowing = isFollowing
        else
          userRelations.value[mid] = { isFollowing, isLoading: false }
      }
    }
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
    else {
      userRelations.value[mid] = {
        isFollowing,
        isLoading: false,
      }
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
