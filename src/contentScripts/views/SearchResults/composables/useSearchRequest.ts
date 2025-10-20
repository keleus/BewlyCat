import { ref } from 'vue'

import type { SearchCategory } from '../types'

export interface SearchRequestOptions {
  page?: number
  pageSize?: number
  context?: string
  [key: string]: any
}

export interface SearchRequestState<T = any> {
  isLoading: boolean
  error: string
  results: T
  totalResults: number
  totalPages: number
  context: string
}

/**
 * 搜索请求的通用 composable
 * 管理搜索状态、错误处理和请求取消
 */
export function useSearchRequest<T = any>(category: SearchCategory) {
  const isLoading = ref(false)
  const error = ref('')
  const results = ref<T | null>(null)
  const totalResults = ref(0)
  const totalPages = ref(0)
  const context = ref('')
  const lastResponse = ref<any>(null)

  // 请求令牌，用于取消过期的请求
  let activeRequestToken: symbol | null = null

  /**
   * 执行搜索请求
   * @param keyword 搜索关键词
   * @param searchFn 实际的搜索函数
   * @param options 额外的搜索参数
   * @returns 搜索是否成功
   */
  async function search(
    keyword: string,
    searchFn: (params: any) => Promise<any>,
    options: SearchRequestOptions = {},
  ): Promise<boolean> {
    if (!keyword.trim()) {
      results.value = null
      return false
    }

    isLoading.value = true
    error.value = ''

    const requestToken = Symbol('search-request')
    activeRequestToken = requestToken

    try {
      const response = await searchFn({
        keyword,
        ...options,
      })

      // 检查请求是否已过期
      if (activeRequestToken !== requestToken)
        return false

      if (!response || response.code !== 0) {
        error.value = '搜索失败，请稍后重试'
        return false
      }

      // 保存响应数据供外部使用
      lastResponse.value = response

      return true
    }
    catch (err) {
      console.error(`Search error for ${category}:`, err)
      error.value = '搜索出错，请稍后重试'
      return false
    }
    finally {
      if (activeRequestToken === requestToken)
        isLoading.value = false
    }
  }

  /**
   * 重置搜索状态
   */
  function reset() {
    results.value = null
    totalResults.value = 0
    totalPages.value = 0
    context.value = ''
    error.value = ''
    lastResponse.value = null
    activeRequestToken = null
  }

  return {
    isLoading,
    error,
    results,
    totalResults,
    totalPages,
    context,
    lastResponse,
    search,
    reset,
  }
}
