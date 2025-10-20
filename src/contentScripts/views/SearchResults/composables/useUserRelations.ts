import { ref } from 'vue'

import api from '~/utils/api'

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

  /**
   * 批量查询用户关系状态
   * @param mids 用户 mid 数组
   */
  async function batchQueryUserRelations(mids: number[]) {
    if (mids.length === 0)
      return

    // B站API限制最多40个mid
    const chunks: number[][] = []
    for (let i = 0; i < mids.length; i += 40) {
      chunks.push(mids.slice(i, i + 40))
    }

    for (const chunk of chunks) {
      try {
        const response = await api.user.getRelations({
          fids: chunk.join(','),
        })

        if (response.code === 0 && response.data) {
          Object.keys(response.data).forEach((midStr) => {
            const mid = Number(midStr)
            const relation = response.data[midStr]
            // attribute: 0=未关注, 1=悄悄关注, 2=关注, 6=互相关注, 128=拉黑
            const isFollowing = relation.attribute === 2 || relation.attribute === 6
            userRelations.value[mid] = {
              isFollowing,
              isLoading: false,
            }
          })
        }
      }
      catch (error) {
        console.error('批量查询用户关系失败:', error)
      }
    }
  }

  /**
   * 更新单个用户的关注状态
   * @param mid 用户 mid
   * @param isFollowing 是否关注
   */
  function updateUserRelation(mid: number, isFollowing: boolean) {
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
