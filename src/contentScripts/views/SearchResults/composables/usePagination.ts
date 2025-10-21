import { computed, ref } from 'vue'

const PAGE_SIZE = 30

export interface PaginationInfo {
  total?: number
  numResults?: number
  num_results?: number
  pageinfo?: {
    total?: number
    per_page?: number
    page_size?: number
    total_page?: number
    num_page?: number
    numPages?: number
    pages?: number
    context?: string
    next?: {
      context?: string
    }
  }
  page_info?: {
    total?: number
    per_page?: number
    page_size?: number
    total_page?: number
    num_page?: number
    context?: string
    next?: {
      context?: string
    }
  }
  numPages?: number
  num_pages?: number
  page_size?: number
  pagesize?: number
  context?: string
}

/**
 * 分页管理的通用 composable
 * 处理总数、总页数的提取和计算
 */
export function usePagination() {
  const currentPage = ref(0)
  const totalResults = ref(0)
  const totalPages = ref(0)
  const context = ref('')

  /**
   * 从 API 响应中提取分页信息
   * @param data API 响应数据
   * @param fallbackLength 当无法从响应中提取时，使用的备用长度
   */
  function extractPagination(data: PaginationInfo, fallbackLength = 0) {
    // 提取总结果数
    const totalResultsCandidate = [
      data?.numResults,
      data?.num_results,
      data?.pageinfo?.total,
      data?.page_info?.total,
      data?.total,
    ].map(Number).find(value => Number.isFinite(value) && value >= 0)

    totalResults.value = totalResultsCandidate ?? fallbackLength

    // 提取每页大小
    const pageSizeCandidate = [
      data?.page_size,
      data?.pagesize,
      data?.pageinfo?.per_page,
      data?.pageinfo?.page_size,
      data?.page_info?.page_size,
      data?.page_info?.per_page,
    ].map(Number).find(value => Number.isFinite(value) && value > 0)

    const effectivePageSize = pageSizeCandidate || PAGE_SIZE

    // 提取总页数
    const totalPagesCandidate = [
      data?.numPages,
      data?.num_pages,
      data?.pageinfo?.total_page,
      data?.pageinfo?.num_page,
      data?.pageinfo?.numPages,
      data?.pageinfo?.pages,
      data?.page_info?.total_page,
      data?.page_info?.num_page,
    ].map(Number).find(value => Number.isFinite(value) && value > 0)

    // 计算总页数
    if (totalPagesCandidate) {
      // 如果API返回了明确的总页数，使用它
      totalPages.value = totalPagesCandidate
    }
    else if (totalResults.value > 0 && effectivePageSize > 0) {
      // 基于总结果数和每页大小计算总页数
      totalPages.value = Math.ceil(totalResults.value / effectivePageSize)
    }
    else if (totalResults.value === 0) {
      // 如果没有结果，总页数应该是0或1
      totalPages.value = fallbackLength > 0 ? 1 : 0
    }
    else {
      // 其他情况默认为1
      totalPages.value = 1
    }

    // 提取 context（用于无限滚动）
    const contextCandidate = [
      data?.pageinfo?.context,
      data?.pageinfo?.next?.context,
      data?.page_info?.context,
      data?.page_info?.next?.context,
      data?.context,
    ].find(value => typeof value === 'string' && value.length > 0)

    context.value = typeof contextCandidate === 'string' ? contextCandidate : ''
  }

  /**
   * 更新当前页码
   */
  function updatePage(page: number) {
    currentPage.value = page
  }

  /**
   * 获取下一页页码
   */
  function getNextPage(isLoadMore: boolean) {
    if (isLoadMore)
      return currentPage.value + 1
    return 1
  }

  /**
   * 是否还有更多数据
   */
  const hasMore = computed(() => {
    if (totalPages.value > 0)
      return currentPage.value < totalPages.value

    return Boolean(context.value)
  })

  /**
   * 重置分页状态
   */
  function reset() {
    currentPage.value = 0
    totalResults.value = 0
    totalPages.value = 0
    context.value = ''
  }

  return {
    currentPage,
    totalResults,
    totalPages,
    context,
    hasMore,
    extractPagination,
    updatePage,
    getNextPage,
    reset,
  }
}
