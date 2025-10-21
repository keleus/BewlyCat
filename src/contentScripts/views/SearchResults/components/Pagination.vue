<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  currentPage: number
  totalPages: number
  disabled?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'change', page: number): void
}>()

// 生成页码数组
const pageNumbers = computed(() => {
  const { currentPage, totalPages } = props
  const maxVisiblePages = 7 // 最多显示7个页码按钮
  const pages: (number | 'ellipsis')[] = []

  if (totalPages <= maxVisiblePages) {
    // 如果总页数小于最大显示数,显示所有页码
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
  }
  else {
    // 始终显示第一页
    pages.push(1)

    let startPage = Math.max(2, currentPage - 2)
    let endPage = Math.min(totalPages - 1, currentPage + 2)

    // 如果当前页靠近开始
    if (currentPage <= 4) {
      startPage = 2
      endPage = 5
    }

    // 如果当前页靠近结尾
    if (currentPage >= totalPages - 3) {
      startPage = totalPages - 4
      endPage = totalPages - 1
    }

    // 添加左侧省略号
    if (startPage > 2) {
      pages.push('ellipsis')
    }

    // 添加中间页码
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }

    // 添加右侧省略号
    if (endPage < totalPages - 1) {
      pages.push('ellipsis')
    }

    // 始终显示最后一页
    pages.push(totalPages)
  }

  return pages
})

function handlePageChange(page: number) {
  if (props.disabled || props.loading || page === props.currentPage || page < 1 || page > props.totalPages)
    return

  emit('change', page)
}

function goToPrevPage() {
  if (props.currentPage > 1) {
    handlePageChange(props.currentPage - 1)
  }
}

function goToNextPage() {
  if (props.currentPage < props.totalPages) {
    handlePageChange(props.currentPage + 1)
  }
}
</script>

<template>
  <div v-if="totalPages > 1" class="pagination">
    <button
      class="pagination-btn"
      :disabled="disabled || loading || currentPage === 1"
      @click="goToPrevPage"
    >
      <div v-if="loading" class="i-tabler:loader-2 animate-spin" />
      <div v-else class="i-tabler:chevron-left" />
    </button>

    <template v-for="(page, index) in pageNumbers" :key="index">
      <span v-if="page === 'ellipsis'" class="pagination-ellipsis">
        ...
      </span>
      <button
        v-else
        class="pagination-btn"
        :class="{ active: page === currentPage, loading: loading && page === currentPage }"
        :disabled="disabled || loading"
        @click="handlePageChange(page)"
      >
        <div v-if="loading && page === currentPage" class="i-tabler:loader-2 animate-spin" />
        <span v-else>{{ page }}</span>
      </button>
    </template>

    <button
      class="pagination-btn"
      :disabled="disabled || loading || currentPage === totalPages"
      @click="goToNextPage"
    >
      <div v-if="loading" class="i-tabler:loader-2 animate-spin" />
      <div v-else class="i-tabler:chevron-right" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 0;
  user-select: none;
}

.pagination-btn {
  min-width: 2.5rem;
  height: 2.5rem;
  padding: 0 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  background-color: var(--bew-elevated-1);
  color: var(--bew-text-1);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover:not(:disabled):not(.active) {
    background-color: var(--bew-elevated-2);
    border-color: var(--bew-theme-color);
  }

  &.active {
    background-color: var(--bew-theme-color);
    color: white;
    border-color: var(--bew-theme-color);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  &.loading {
    pointer-events: none;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.pagination-ellipsis {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  height: 2.5rem;
  color: var(--bew-text-2);
  font-size: 0.875rem;
}
</style>
